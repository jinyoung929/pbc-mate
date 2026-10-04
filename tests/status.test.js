import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALLOWED_TRANSITIONS, allowedStatuses, canTransition, validateTransition, transitionItem,
} from '../src/js/lib/status.js';
import { canOpenFix, currentFixReason, buildFixMail } from '../src/js/lib/fix.js';
import { isBundleEligible, bundleItems } from '../src/js/lib/bundle.js';
import { buildMail } from '../src/js/lib/mail.js';
import { withDays, isOpen, summarize, groupByOwner, sortItems } from '../src/js/lib/priority.js';
import { buildReport } from '../src/js/lib/report.js';
import { updateItemStatus, DEMO_DATE } from '../src/js/store.js';
import { sampleState } from './fixtures.js';

const state = sampleState();
const bank = state.items.find((x) => x.id === 'i1'); // 미회신
const partial = state.items.find((x) => x.id === 'i4'); // 일부 수령
const ppe = state.items.find((x) => x.id === 'i2'); // 보완 요청
const ON = DEMO_DATE;

test('허용 전환: 역방향은 막는다', () => {
  assert.deepEqual(ALLOWED_TRANSITIONS, { none: ['part', 'fix', 'done'], part: ['fix', 'done'], fix: ['part', 'done'], done: [] });
  assert.deepEqual(allowedStatuses(bank), ['part', 'fix', 'done']);
  assert.equal(canTransition(partial, 'none'), false);
  assert.equal(canTransition({ status: 'done' }, 'none'), false);
  assert.match(validateTransition(partial, { status: 'none' }).status, /바꿀 수 없어요/);
  assert.throws(() => transitionItem(partial, { status: 'none' }, ON), /바꿀 수 없어요/);
});

test('미회신 → 일부 수령: 상태와 최초 수령일, 이력은 그대로', () => {
  const next = transitionItem(bank, { status: 'part' }, ON);
  assert.equal(next.status, 'part');
  assert.deepEqual(next.received, { on: ON });
  assert.deepEqual(next.nudges, bank.nudges, '독촉 이력 변화 없음');
  assert.equal(bank.status, 'none', '원래 자료는 그대로');
  assert.equal('received' in bank, false);
});

test('미회신 → 완료', () => {
  const next = transitionItem(bank, { status: 'done' }, ON);
  assert.equal(next.status, 'done');
  assert.equal(next.received.on, ON);
  assert.equal(isOpen(next), false);
});

test('일부 수령 → 완료: 기존 received.on이 있으면 유지', () => {
  const first = transitionItem(bank, { status: 'part' }, '2026-10-01');
  const done = transitionItem(first, { status: 'done' }, '2026-10-03');
  assert.equal(done.status, 'done');
  assert.equal(done.received.on, '2026-10-01', '최초 수령일 유지');
  // 예시의 일부 수령 자료(수령일 없음) → 완료면 이번 날짜로 기록
  assert.equal(transitionItem(partial, { status: 'done' }, ON).received.on, ON);
});

test('미회신 → 보완 요청: 사유 필수, 저장 후 보완 화면 진입 가능', () => {
  assert.match(validateTransition(bank, { status: 'fix' }).reason, /사유/);
  const next = transitionItem(bank, { status: 'fix', reason: 'sign' }, ON);
  assert.equal(next.status, 'fix');
  assert.equal(next.fix.reason, 'sign');
  assert.equal(next.reason, '서명 누락 · 서명본 재요청 필요');
  assert.equal(next.received.on, ON);
  assert.equal(canOpenFix(next), true);
  assert.equal(currentFixReason(next), 'sign');
  assert.deepEqual(next.fixes, undefined, '보완 이력은 메일 복사 때만 쌓인다');
  assert.equal(isBundleEligible(next), false, '묶음 독촉 대상에서 빠짐');
});

test('기준일 상이: 두 기준일을 모두 받아 저장', () => {
  const errs = validateTransition(bank, { status: 'fix', reason: 'date' });
  assert.deepEqual(Object.keys(errs).sort(), ['basisDate', 'requiredBasisDate']);
  const next = transitionItem(bank,
    { status: 'fix', reason: 'date', basisDate: '2026-06-30', requiredBasisDate: '2026-12-31' }, ON);
  assert.equal(next.received.basisDate, '2026-06-30');
  assert.equal(next.fix.requiredBasisDate, '2026-12-31');
  assert.equal(next.reason, '기준일 상이 · 12/31 기준 재요청 필요');
  const mail = buildFixMail({ item: withDays(next, ON), person: {}, client: state.client, today: ON, reason: 'date' });
  assert.match(mail.segments.map((s) => s.text).join(''), /기준일이 6\/30로 되어 있어, 결산 기준일\(12\/31\)/);
});

test('보완 요청 → 완료: 요약은 지우고 이력·기존 수령일은 유지', () => {
  const done = transitionItem(ppe, { status: 'done' }, '2026-10-05');
  assert.equal(done.status, 'done');
  assert.equal(done.received.on, '2026-09-30');
  assert.equal(done.received.basisDate, '2026-06-30');
  assert.equal('reason' in done, false);
  assert.deepEqual(done.fixes, ppe.fixes);
});

test('일부 수령으로 바꾸면 단건 메일은 일부 수령 문구를 쓴다', () => {
  const next = withDays(transitionItem(bank, { status: 'part' }, ON), ON);
  const mail = buildMail({ item: next, person: {}, client: state.client, today: ON, tone: 'firm' });
  assert.match(mail.segments.map((s) => s.text).join(''), /중 아직 받지 못한 자료가 있습니다/);
  assert.equal(isBundleEligible(next), true, '묶음 독촉에는 계속 포함');
});

test('updateItemStatus: 새 state 반환, 대시보드·주간 현황 숫자 즉시 반영', () => {
  const after = updateItemStatus(state, 'i1', { status: 'done' }, ON);
  assert.equal(state.items[0].status, 'none', '원래 state 불변');
  const before = summarize(state.items.map((x) => withDays(x, ON)));
  const now = summarize(after.items.map((x) => withDays(x, ON)));
  assert.equal(now.open, before.open - 1);
  assert.equal(now.urgent, before.urgent - 1);
  const groups = groupByOwner(sortItems(after.items.map((x) => withDays(x, ON)).filter(isOpen), 'need'));
  assert.equal(groups.some((g) => g.owner === '박준호 과장'), false, '담당자 카드에서 빠짐');
  const report = buildReport(after, ON);
  assert.equal(report.counts.done, 2);
  assert.equal(report.received.count, 2, '수령일이 이번 주라 이번 주 수령에 포함');
  assert.equal(after.people['박준호 과장'].nudges, state.people['박준호 과장'].nudges, '독촉 횟수 변화 없음');
});

test('updateItemStatus: 보완 요청으로 바꾸면 독촉 대상에서 빠지고 보완 건수 증가', () => {
  const after = updateItemStatus(state, 'i3', { status: 'fix', reason: 'file' }, ON);
  assert.equal(bundleItems(after.items, '김민지 대리', ON).length, 2);
  assert.equal(summarize(after.items.map((x) => withDays(x, ON))).needsFix, 2);
  assert.equal(after.items.find((x) => x.id === 'i3').nudges.length, 1, '독촉 이력 그대로');
});
