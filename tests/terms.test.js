import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SERVICES, termsOf, serviceLabel } from '../src/js/lib/terms.js';
import { buildMail } from '../src/js/lib/mail.js';
import { buildBundleMail, bundleItems } from '../src/js/lib/bundle.js';
import { buildFixMail } from '../src/js/lib/fix.js';
import { insight, withDays } from '../src/js/lib/priority.js';
import { sampleState, DEMO_DATE } from '../src/js/store.js';

const state = sampleState();
const inv = withDays(state.items.find((x) => x.id === 'i3'), DEMO_DATE); // 재고실사 결과표 · 10/6 필요
const body = (m) => m.segments.map((s) => s.text).join('');

test('업무 구분 4가지, 모르는 값은 감사 용어로', () => {
  assert.deepEqual(SERVICES.map((s) => s.key), ['audit', 'tax', 'deal', 'advisory']);
  assert.equal(termsOf(undefined).mailTag, '감사');
  assert.equal(termsOf('nope').schedule, '감사 일정');
  assert.equal(serviceLabel('deal'), '딜·실사');
});

test('기존(감사) 문구는 그대로: service 없는 클라이언트', () => {
  const m = buildMail({ item: inv, person: {}, client: { name: '㈜한빛전자' }, today: DEMO_DATE, tone: 'polite' });
  assert.match(m.subject, /^\[한빛전자 감사\]/);
  assert.match(body(m), /감사 일정상 10월 6일 재고 실사 검토 절차를 시작해야 해서/);
});

test('세무: 메일 접두어·근거 문장·기본 절차가 바뀐다', () => {
  const client = { name: '㈜한빛전자', service: 'tax' };
  const m = buildMail({ item: { ...inv, procedure: undefined }, person: {}, client, today: DEMO_DATE, tone: 'polite' });
  assert.equal(m.subject, '[한빛전자 세무 신고] 재고실사 결과표 요청 (10/6 필요)');
  assert.match(body(m), /신고 일정상 10월 6일 관련 신고 절차를 시작해야 해서/);
  assert.doesNotMatch(body(m), /감사 일정/);
});

test('딜: 묶음·보완 메일도 같은 용어 사전을 쓴다', () => {
  const client = { name: '㈜한빛전자', service: 'deal' };
  const sorted = bundleItems(state.items, '김민지 대리', DEMO_DATE);
  const b = buildBundleMail({ sorted, person: {}, client, manager: null, tone: 'polite' });
  assert.match(b.subject, /^\[한빛전자 실사\] 요청 자료 3건/);
  assert.match(b.outro.map((s) => s.text).join(''), /실사 일정상 10월 6일 재고 실사 검토 절차를 시작해야 해서/);
  const ppe = withDays(state.items.find((x) => x.id === 'i2'), DEMO_DATE);
  const f = buildFixMail({ item: ppe, person: {}, client, today: DEMO_DATE, reason: 'date' });
  assert.match(f.subject, /^\[한빛전자 실사\] 유형자산 증감내역 재요청/);
  assert.match(body(f), /실사 일정상 유형자산 실증 절차를 10\/8에 시작해야 해서/);
});

test('대시보드 1순위 문구의 기준 라벨', () => {
  assert.equal(insight(inv, 'need').eyebrow, '감사 일정 기준 1순위');
  assert.equal(insight(inv, 'need', '신고 일정').eyebrow, '신고 일정 기준 1순위');
});
