import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isBundleEligible, bundleItems, bundleTone, buildBundleMail, bundleMailToText,
} from '../src/js/lib/bundle.js';
import { recommendTone } from '../src/js/lib/tone.js';
import { copyAndRecord, recordNudges } from '../src/js/store.js';
import { sampleState, DEMO_DATE } from './fixtures.js';

const state = sampleState();
const names = (list) => list.map((x) => x.name);
const minji = bundleItems(state.items, '김민지 대리', DEMO_DATE);
const mailFor = (sorted, tone) => buildBundleMail({
  sorted, person: state.people[sorted[0].owner], client: state.client, manager: state.team.manager, tone,
});

test('같은 담당자 자료만 묶는다: 김민지 대리 3건', () => {
  assert.equal(minji.length, 3);
  assert.ok(minji.every((x) => x.owner === '김민지 대리'));
});

test('완료·보완 요청은 제외, 일부 수령은 포함', () => {
  const items = [
    { id: 'a', owner: 'A', status: 'none', requestedOn: '2026-09-28', neededOn: '2026-10-05' },
    { id: 'b', owner: 'A', status: 'done', requestedOn: '2026-09-28', neededOn: '2026-10-03' },
    { id: 'c', owner: 'A', status: 'fix', requestedOn: '2026-09-28', neededOn: '2026-10-02' },
    { id: 'd', owner: 'A', status: 'part', requestedOn: '2026-09-28', neededOn: '2026-10-04' },
    { id: 'e', owner: 'B', status: 'none', requestedOn: '2026-09-28', neededOn: '2026-10-02' },
  ];
  assert.deepEqual(bundleItems(items, 'A', DEMO_DATE).map((x) => x.id), ['d', 'a']);
  assert.equal(isBundleEligible({ status: 'fix' }), false);
  assert.equal(isBundleEligible({ status: 'part' }), true);
  // 예시: 박준호 과장은 완료 1건을 빼면 1건, 최도윤 차장은 보완 요청뿐이라 0건
  assert.equal(bundleItems(state.items, '박준호 과장', DEMO_DATE).length, 1);
  assert.equal(bundleItems(state.items, '최도윤 차장', DEMO_DATE).length, 0);
});

test('필요일순 정렬: 재고실사 결과표가 첫 번째', () => {
  assert.deepEqual(names(minji), ['재고실사 결과표', '특수관계자 거래내역', '매출채권 연령분석표']);
});

test('필요일이 같으면 기존 우선순위(오래 기다린 순)를 따른다', () => {
  const items = [
    { id: 'new', owner: 'A', status: 'none', requestedOn: '2026-09-30', neededOn: '2026-10-05' },
    { id: 'old', owner: 'A', status: 'none', requestedOn: '2026-09-20', neededOn: '2026-10-05' },
  ];
  assert.deepEqual(bundleItems(items, 'A', DEMO_DATE).map((x) => x.id), ['old', 'new']);
});

test('묶음 톤 = 가장 급한 자료의 추천 톤, 단 최소 정중', () => {
  // 재고실사(남은 5일 · 요청 후 5일)는 단건 추천이 천사지만 묶음에서는 정중
  assert.equal(recommendTone(minji[0]), 'angel');
  assert.equal(bundleTone(minji), 'polite');
  // 정중·단호·매니저 참조는 그대로
  assert.equal(bundleTone([{ left: 2, elapsed: 1 }, { left: 20, elapsed: 1 }]), 'polite');
  assert.equal(bundleTone([{ left: 1, elapsed: 8 }, { left: 20, elapsed: 1 }]), 'firm');
  assert.equal(bundleTone([{ left: -2, elapsed: 9 }, { left: 20, elapsed: 1 }]), 'cc');
  // 첫 번째(가장 급한) 자료 기준
  assert.equal(bundleTone([{ left: 20, elapsed: 1 }, { left: -2, elapsed: 9 }]), 'polite');
});

test('묶음 메일: 한 통, 급한 순 번호, 필요일 표시, 가장 급한 자료 재강조', () => {
  const m = mailFor(minji, 'polite');
  assert.equal(m.subject, '[한빛전자 감사] 요청 자료 3건 진행 상황 정리 (10/6 필요 자료 포함)');
  assert.deepEqual(m.to, { name: '김민지 대리', dept: '재무팀' });
  assert.equal(m.cc, null);
  assert.deepEqual(m.rows.map((r) => [r.no, r.name, r.need, r.isTop]), [
    [1, '재고실사 결과표', '10/6 (화)', true],
    [2, '특수관계자 거래내역', '10/10 (토)', false],
    [3, '매출채권 연령분석표', '10/20 (화)', false],
  ]);

  const text = bundleMailToText(m);
  assert.match(text, /요청드린 자료 진행 상황을 한 번에 정리해 드립니다\./);
  assert.match(text, /가장 급한 재고실사 결과표부터 부탁드립니다\./);
  assert.match(text, /감사 일정상 10월 6일 재고 실사 검토 절차를 시작해야 해서, 10\/4까지 보내주시면/);
  const order = ['1. 재고실사 결과표', '2. 특수관계자 거래내역', '3. 매출채권 연령분석표'].map((s) => text.indexOf(s));
  assert.ok(order.every((v, i) => v > 0 && (i === 0 || v > order[i - 1])), '번호 순서대로 나열');
  assert.ok(text.indexOf('1. 재고실사 결과표') < text.indexOf('가장 급한 재고실사'), '목록 뒤에 다시 강조');
});

test('일부 수령 자료는 "일부 수령, 나머지 필요"로 쓴다', () => {
  const m = mailFor(minji, 'polite');
  assert.equal(m.rows[1].status, '일부 수령, 나머지 필요');
  assert.equal(m.rows[0].status, '아직 받지 못했습니다');
  assert.match(bundleMailToText(m), /2\. 특수관계자 거래내역 — 일부 수령, 나머지 필요 · 필요일 10\/10 \(토\)/);
});

test('톤 체계는 단건과 같다: 매니저 참조면 CC와 협의 문구', () => {
  const m = mailFor(minji, 'cc');
  assert.deepEqual(m.cc, { name: '이서연 매니저', dept: '감사팀' });
  assert.match(bundleMailToText(m), /참조: 이서연 매니저/);
  assert.match(bundleMailToText(m), /매니저님을 참조로 함께 드립니다/);
  const bodies = new Set(['angel', 'polite', 'firm', 'cc'].map((t) => bundleMailToText(mailFor(minji, t))));
  assert.equal(bodies.size, 4);
});

test('복사 성공: 묶인 자료마다 같은 날짜·톤 기록, 담당자 독촉은 1회 증가', async () => {
  const ids = minji.map((x) => x.id);
  const { ok, state: after } = await copyAndRecord(
    state, { itemIds: ids, tone: 'polite', on: DEMO_DATE, text: 'mail' }, async () => true);

  assert.equal(ok, true);
  for (const id of ids) {
    const nudges = after.items.find((x) => x.id === id).nudges;
    assert.deepEqual(nudges[nudges.length - 1], { on: DEMO_DATE, tone: 'polite' });
  }
  assert.equal(after.people['김민지 대리'].nudges, 3);
  assert.equal(after.people['김민지 대리'].lastNudgedOn, DEMO_DATE);
  // 다른 담당자 자료는 그대로
  assert.deepEqual(after.items.find((x) => x.id === 'i1'), state.items.find((x) => x.id === 'i1'));
});

test('복사 실패: 이력을 기록하지 않는다', async () => {
  let copiedText = null;
  const { ok, state: after } = await copyAndRecord(
    state, { itemIds: minji.map((x) => x.id), tone: 'polite', on: DEMO_DATE, text: 'mail' },
    async (t) => { copiedText = t; return false; });

  assert.equal(ok, false);
  assert.equal(copiedText, 'mail');
  assert.equal(after, state);
  assert.equal(after.people['김민지 대리'].nudges, 2);
});

test('recordNudges는 원래 state를 바꾸지 않는다', () => {
  const before = JSON.stringify(state);
  recordNudges(state, ['i3', 'i4'], 'firm', DEMO_DATE);
  assert.equal(JSON.stringify(state), before);
});
