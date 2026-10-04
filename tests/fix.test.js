import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FIX_REASONS, canOpenFix, currentFixReason, fixSummary, buildFixMail, fixMailToText,
} from '../src/js/lib/fix.js';
import { DEMO_DATE, recordFix, copyAndRecordFix } from '../src/js/store.js';
import { sampleState } from './fixtures.js';

const state = sampleState();
const ppe = state.items.find((x) => x.id === 'i2'); // 유형자산 증감내역 / 최도윤 차장
const mailFor = (reason, item = ppe) => buildFixMail({
  item, person: state.people[item.owner], client: state.client, today: DEMO_DATE, reason,
});
const body = (m) => m.segments.map((s) => s.text).join('');

test('보완 사유 4가지', () => {
  assert.deepEqual(FIX_REASONS.map((r) => r.label), ['기준일 상이', '서명 누락', '일부 항목 누락', '파일 오류']);
});

test('보완 요청 상태인 자료만 보완 요청 화면을 연다', () => {
  assert.equal(canOpenFix(ppe), true);
  for (const id of ['i1', 'i3', 'i4', 'i6']) assert.equal(canOpenFix(state.items.find((x) => x.id === id)), false, id);
  assert.equal(canOpenFix(undefined), false);
});

test('예시 자료는 기준일 상이로 열린다', () => {
  assert.equal(currentFixReason(ppe), 'date');
  assert.equal(currentFixReason({ status: 'fix' }), 'date');
});

test('기준일 상이: 받은 6/30 → 결산 12/31, 필요일 10/8', () => {
  const m = mailFor('date');
  assert.equal(m.subject, '[한빛전자 감사] 유형자산 증감내역 재요청 — 기준일 확인 부탁드립니다');
  assert.deepEqual(m.to, { name: '최도윤 차장', dept: '관리팀' });
  assert.equal(body(m),
    '최도윤 차장님, 안녕하세요.\n\n보내주신 유형자산 증감내역 잘 받았습니다. '
    + '다만 기준일이 6/30로 되어 있어, 결산 기준일(12/31) 자료로 다시 부탁드립니다. '
    + '감사 일정상 유형자산 실증 절차를 10/8에 시작해야 해서, 10/8까지 필요합니다.'
    + '\n\n감사합니다.\n[이름] 드림');
});

test('서명 누락: 서명 또는 날인 누락 안내', () => {
  const m = mailFor('sign');
  assert.equal(m.subject, '[한빛전자 감사] 유형자산 증감내역 재요청 — 서명본 부탁드립니다');
  assert.match(body(m), /담당 임원 확인란에 서명 또는 날인이 빠져 있어, 서명\(날인\)된 본으로 다시 부탁드립니다/);
  assert.match(body(m), /10\/8까지 필요합니다/);
});

test('일부 항목 누락: 빠진 항목 안내', () => {
  const m = mailFor('missing');
  assert.equal(m.subject, '[한빛전자 감사] 유형자산 증감내역 — 누락 항목 추가 요청');
  assert.match(body(m), /건설중인자산 대체 내역이 빠져 있어, 해당 부분만 추가로 부탁드립니다/);
});

test('파일 오류: 열리지 않거나 확인이 어렵다는 안내', () => {
  const m = mailFor('file');
  assert.equal(m.subject, '[한빛전자 감사] 유형자산 증감내역 — 파일 재전송 요청');
  assert.match(body(m), /파일이 열리지 않거나 내용이 깨져 보여 확인이 어렵습니다/);
  assert.match(body(m), /파일을 한 번 더 보내주실 수 있을까요/);
});

test('사유를 바꾸면 제목·본문이 모두 달라진다', () => {
  const keys = FIX_REASONS.map((r) => r.key);
  assert.equal(new Set(keys.map((k) => mailFor(k).subject)).size, 4);
  assert.equal(new Set(keys.map((k) => body(mailFor(k)))).size, 4);
  // 모든 사유에 필요일 근거 문장이 들어간다
  for (const k of keys) {
    assert.match(mailFor(k).segments.filter((s) => s.kind === 'reason').map((s) => s.text).join(''), /감사 일정상/, k);
  }
});

test('세부 항목이 없는 자료는 기본 문구를 쓴다', () => {
  const plain = { ...ppe, fix: { reason: 'sign' } };
  assert.match(body(mailFor('sign', plain)), /확인·승인란에 서명 또는 날인이 빠져 있어/);
  assert.match(body(mailFor('missing', plain)), /요청 범위 중 일부 항목이 빠져 있어/);
});

test('복사 텍스트: 제목 / 받는 사람 / 본문 (참조 없음)', () => {
  const text = fixMailToText(mailFor('date'));
  assert.ok(text.startsWith('제목: [한빛전자 감사] 유형자산 증감내역 재요청 — 기준일 확인 부탁드립니다\n받는 사람: 최도윤 차장\n\n최도윤 차장님'));
  assert.ok(!text.includes('참조:'));
});

test('recordFix: 날짜·사유 기록, 현재 사유·요약 갱신, 상태는 보완 요청 유지', () => {
  const after = recordFix(state, 'i2', 'sign', DEMO_DATE);
  const item = after.items.find((x) => x.id === 'i2');
  assert.deepEqual(item.fixes, [{ on: '2026-09-30', reason: 'date' }, { on: DEMO_DATE, reason: 'sign' }]);
  assert.equal(item.status, 'fix');
  assert.equal(item.fix.reason, 'sign');
  assert.equal(item.fix.requiredBasisDate, '2026-12-31');
  assert.equal(item.reason, '서명 누락 · 서명본 재요청 필요');
  assert.equal(state.items.find((x) => x.id === 'i2').fixes.length, 1, '원래 state는 그대로');
});

test('fixSummary: 기준일 상이 요약은 기존 대시보드 문구와 같다', () => {
  assert.equal(fixSummary(ppe, 'date'), ppe.reason);
});

test('복사 성공 시 보완 이력 기록 (독촉 이력·담당자 횟수는 그대로)', async () => {
  const { ok, state: after } = await copyAndRecordFix(
    state, { itemId: 'i2', reason: 'missing', on: DEMO_DATE, text: 't' }, async () => true);
  const item = after.items.find((x) => x.id === 'i2');
  assert.equal(ok, true);
  assert.deepEqual(item.fixes.at(-1), { on: DEMO_DATE, reason: 'missing' });
  assert.equal(item.status, 'fix');
  assert.deepEqual(item.nudges, []);
  assert.deepEqual(after.people['최도윤 차장'], state.people['최도윤 차장']);
});

test('복사 실패 시 이력 미기록', async () => {
  const { ok, state: after } = await copyAndRecordFix(
    state, { itemId: 'i2', reason: 'file', on: DEMO_DATE, text: 't' }, async () => false);
  assert.equal(ok, false);
  assert.equal(after, state);
  assert.equal(after.items.find((x) => x.id === 'i2').fixes.length, 1);
});
