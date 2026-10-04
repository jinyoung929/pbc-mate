import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  noReplySteps, noReplyNotice, reconcile, reconConclusion, canStartFollow, startFollow,
  completeCheck, completeFollow, clampVerified, evidenceRequests, coverageSummary, validateSignoff, isMisstatementLine,
} from '../src/js/lib/followup.js';

const ON = '2026-10-20';
const bank = { id: 'c1', kind: 'confirmation', confType: 'bank', track: 'required', counterparty: '한빛은행 여의도지점', bookAmount: 4250000000, status: 'none' };
const ar = { id: 'c2', kind: 'confirmation', confType: 'arap', track: 'coverage', counterparty: '㈜대한부품', receivable: 842000000, payable: 0, bookAmount: 842000000, status: 'none' };
const both = { ...ar, id: 'c3', counterparty: '세진물산㈜', receivable: 315500000, payable: 120000000, bookAmount: 435500000 };
const apOnly = { ...ar, id: 'c4', counterparty: '㈜오성테크', receivable: 0, payable: 96300000, bookAmount: 96300000 };
const legal = { id: 'c5', kind: 'confirmation', confType: 'legal', track: 'required', counterparty: '법무법인 정의', status: 'none' };
const pbc = { id: 'i3', name: '재고실사 결과표', status: 'none' };

test('미회수 절차: 종류별 목록, 채권채무는 금액이 있는 쪽만', () => {
  assert.deepEqual(noReplySteps(bank).map((s) => s.key), ['resend', 'call', 'visit', 'statement', 'report']);
  assert.ok(noReplySteps(ar).every((s) => ['subsequent', 'invoice', 'shipping'].includes(s.key)));
  assert.deepEqual(noReplySteps(apOnly).map((s) => s.key), ['subsequentPay', 'invoiceIn', 'unrecorded']);
  assert.equal(noReplySteps(both).length, 6);
  assert.ok(noReplySteps(legal).some((s) => s.key === 'mgmt'));
  assert.equal(noReplySteps(bank).find((s) => s.key === 'statement').role, 'support', '잔액증명서는 보조 증거');
  assert.match(noReplyNotice(bank), /금액과 상관없이 회수/);
  assert.match(noReplyNotice(ar), /커버리지/);
});

test('후속 절차 시작: 외부조회 건만, 상태는 follow', () => {
  assert.equal(canStartFollow(pbc), false);
  assert.equal(canStartFollow({ ...ar, status: 'done' }), false);
  assert.throws(() => startFollow(pbc, 'noreply', ON));

  const n = startFollow(ar, 'noreply', ON);
  assert.equal(n.status, 'follow');
  assert.deepEqual(n.follow, { type: 'noreply', startedOn: ON, requested: [], steps: {}, verified: 0 });
  assert.equal(ar.status, 'none', '원래 자료는 그대로');

  const d = startFollow(ar, 'diff', ON);
  assert.deepEqual(d.follow.recon, { book: 842000000, confirmed: null, lines: [] });
  assert.equal(d.received.on, ON, '회신을 받은 날을 수령일로');
});

test('차이 조정: 시점 차이로 모두 설명되면 왜곡표시 없음', () => {
  const r = reconcile({ book: 842000000, confirmed: 830000000, lines: [
    { cause: 'goods', amount: 9000000 }, { cause: 'cash', amount: 3000000 },
  ] });
  assert.equal(r.diff, 12000000);
  assert.equal(r.unexplained, 0);
  assert.equal(r.result, 'timing');
  assert.match(reconConclusion(r), /12,000,000원은 시점 차이/);
});

test('차이 조정: 회사 오류·원인 불명은 왜곡표시, 남은 차이는 open', () => {
  const mis = reconcile({ book: 100, confirmed: 70, lines: [{ cause: 'goods', amount: 10 }, { cause: 'company', amount: 20 }] });
  assert.equal(mis.result, 'misstatement');
  assert.equal(mis.misstatement, 20);

  const open = reconcile({ book: 100, confirmed: 70, lines: [{ cause: 'goods', amount: 10 }] });
  assert.equal(open.result, 'open');
  assert.equal(open.unexplained, 20);
  assert.match(reconConclusion(open), /20원 남았어요/);

  assert.equal(reconcile({ book: 100, confirmed: 100, lines: [] }).result, 'matched');
  // 회신이 더 큰 경우(음수 차이)도 부호를 맞춰 설명
  assert.equal(reconcile({ book: 100, confirmed: 110, lines: [{ cause: 'party', amount: -10 }] }).result, 'timing');
  // 원인 없는 줄·0원 줄은 무시
  assert.equal(reconcile({ book: 100, confirmed: 90, lines: [{ cause: '', amount: 10 }, { cause: 'cash', amount: 0 }] }).result, 'open');
});

test('완료 조건: 필수 회수는 대체적 절차로 끝낼 수 없다', () => {
  let b = startFollow(bank, 'noreply', ON);
  b = { ...b, follow: { ...b.follow, steps: { resend: true, call: true, visit: true, statement: true, report: true } } };
  assert.equal(completeCheck(b).ok, false);
  assert.match(completeCheck(b).reason, /필수 회수/);
});

test('완료 조건: 커버리지 조회는 대체적 절차 하나 이상', () => {
  let a = startFollow(ar, 'noreply', ON);
  assert.equal(completeCheck(a).ok, false);
  a = { ...a, follow: { ...a.follow, steps: { subsequent: true }, verified: 500000000 } };
  assert.equal(completeCheck(a).ok, true);
  const done = completeFollow(a, { preparer: ' 장재혁 ', completedOn: '2026-10-25', reviewer: '이서연 매니저' });
  assert.equal(done.status, 'done');
  assert.equal(done.follow.closedOn, '2026-10-25');
  assert.deepEqual(done.follow.signoff, { preparer: '장재혁', reviewer: '이서연 매니저' });
  assert.match(done.follow.conclusion, /500,000,000원 확인/);
});

test('완료 조건: 금액 차이는 회신금액 입력 + 설명되지 않은 차이 없음', () => {
  let d = startFollow(ar, 'diff', ON);
  assert.match(completeCheck(d).reason, /회신금액/);
  d = { ...d, follow: { ...d.follow, recon: { book: 842000000, confirmed: 840000000, lines: [] } } };
  assert.equal(completeCheck(d).ok, false);
  d = { ...d, follow: { ...d.follow, recon: { ...d.follow.recon, lines: [{ cause: 'cash', amount: 2000000 }] } } };
  assert.equal(completeCheck(d).ok, true);
  assert.match(completeFollow(d, { preparer: '장재혁', completedOn: ON }).follow.conclusion, /왜곡표시는 없어요/);
  assert.throws(() => completeFollow(startFollow(ar, 'diff', ON), { preparer: '장재혁', completedOn: ON }));
  assert.throws(() => completeFollow(d, { preparer: '', completedOn: ON }), /수행자/);
});

test('대체적 절차 확인 금액은 0~장부금액', () => {
  assert.equal(clampVerified(ar, '300,000,000'), 300000000);
  assert.equal(clampVerified(ar, '9,999,999,999'), 842000000);
  assert.equal(clampVerified(ar, '-5'), 0);
  assert.equal(clampVerified(ar, 'abc'), 0);
});

test('증빙 요청: 선택한 절차의 증빙만 PBC 자료로, 이미 요청한 것은 제외', () => {
  const a = startFollow(both, 'noreply', ON);
  const reqs = evidenceRequests(a, { stepKeys: ['subsequent', 'unrecorded', 'nonexistent'], owner: '김민지 대리', dept: '재무팀', today: ON });
  assert.deepEqual(reqs.map((r) => r.key), ['subsequent', 'unrecorded']);
  const [first] = reqs;
  assert.equal(first.value.item.name, '기준일 이후 입금 내역(통장 사본) (세진물산㈜)');
  assert.equal(first.value.item.owner, '김민지 대리');
  assert.equal(first.value.item.neededOn, '2026-10-25');
  assert.equal(first.value.item.sourceId, 'c3');
  assert.equal(first.value.item.kind, undefined, 'PBC 자료로 들어감');

  const again = { ...a, follow: { ...a.follow, requested: ['subsequent'] } };
  assert.deepEqual(evidenceRequests(again, { stepKeys: ['subsequent', 'unrecorded'], owner: 'x', today: ON }).map((r) => r.key), ['unrecorded']);

  const d = startFollow(ar, 'diff', ON);
  const [diffReq] = evidenceRequests(d, { owner: '박준호 과장', today: ON });
  assert.equal(diffReq.value.item.name, '차이 소명 자료 (㈜대한부품)');
});

test('커버리지: 회신 완료 + 대체적 절차 + 차이 건의 회신금액, 필수 트랙은 제외', () => {
  const items = [
    { ...ar, status: 'done' },                                                                   // 842,000,000 회신
    { ...both, status: 'follow', follow: { type: 'noreply', verified: 400000000 } },              // 대체적 절차
    { ...apOnly, status: 'follow', follow: { type: 'diff', recon: { confirmed: 90000000 } } },   // 회신 90,000,000
    { ...ar, id: 'c9', bookAmount: 100000000, status: 'none' },                                   // 미확인
    bank,
  ];
  const c = coverageSummary(items);
  assert.equal(c.count, 4);
  assert.equal(c.total, 842000000 + 435500000 + 96300000 + 100000000);
  assert.equal(c.confirmed, 842000000 + 90000000);
  assert.equal(c.alternative, 400000000);
  assert.equal(c.uncovered, c.total - c.covered);
  assert.equal(Math.round(c.ratio * 1000), 904); // 1,332,000,000 / 1,473,800,000
  assert.equal(coverageSummary([]).ratio, 0);
});

test('미회수 절차: 재고 조회는 실사·창고증권·입출고 대조', () => {
  const inv = { id: 'c8', kind: 'confirmation', confType: 'inventory', track: 'coverage', counterparty: '㈜한결물류 평택센터', bookAmount: 1913000000, status: 'none' };
  assert.deepEqual(noReplySteps(inv).map((s) => s.key), ['resend', 'inspect', 'receipts', 'movement', 'report']);
  const f = startFollow(inv, 'noreply', ON);
  const reqs = evidenceRequests(f, { stepKeys: ['receipts', 'inspect'], owner: '김민지 대리', today: ON });
  assert.deepEqual(reqs.map((r) => r.value.item.name), ['창고증권·보관증 사본 (㈜한결물류 평택센터)']);
});

test('완료 기록: 수행자·완료일 필수, 검토자는 선택', () => {
  assert.deepEqual(validateSignoff({ preparer: '장재혁', completedOn: '2026-10-25' }), {});
  const e = validateSignoff({ preparer: ' ', completedOn: '' });
  assert.ok(e.preparer && e.completedOn);
  assert.equal(validateSignoff({ preparer: 'a', completedOn: '10/25' }).completedOn, '완료일을 입력해 주세요.');
});

test('미착품 차이: 인도조건을 확인해야 완료, 도착지 인도면 왜곡표시', () => {
  const lines = (terms) => [{ cause: 'goods', amount: 9000000, terms }, { cause: 'cash', amount: 3000000 }];
  const pending = reconcile({ book: 842000000, confirmed: 830000000, lines: lines('') });
  assert.equal(pending.termsPending, 1);
  assert.equal(pending.result, 'timing', '금액은 모두 설명됨');
  let d = startFollow(ar, 'diff', ON);
  d = { ...d, follow: { ...d.follow, recon: { book: 842000000, confirmed: 830000000, lines: lines('') } } };
  assert.match(completeCheck(d).reason, /인도조건/);

  const shipping = reconcile({ book: 842000000, confirmed: 830000000, lines: lines('shipping') });
  assert.equal(shipping.result, 'timing');
  assert.equal(shipping.misstatement, 0);

  const dest = reconcile({ book: 842000000, confirmed: 830000000, lines: lines('destination') });
  assert.equal(dest.result, 'misstatement');
  assert.equal(dest.misstatement, 9000000);
  assert.match(reconConclusion(dest), /9,000,000원.*수정 여부를 검토/);
  assert.equal(isMisstatementLine({ cause: 'company' }), true);
  assert.equal(isMisstatementLine({ cause: 'cash' }), false);
});

test('변호사 조회는 필수 회수가 아니라 대체적 절차로 완료할 수 있다', () => {
  const lg = { ...legal, track: 'general' };
  assert.match(noReplyNotice(lg), /경영진 확인서/);
  let f = startFollow(lg, 'noreply', ON);
  assert.equal(completeCheck(f).ok, false);
  f = { ...f, follow: { ...f.follow, steps: { mgmt: true } } };
  assert.equal(completeCheck(f).ok, true);
});

test('트랙별 현황: 은행 회수 건수, 미확인 잔액과 수행중요성 비교', async () => {
  const { trackOverview } = await import('../src/js/lib/followup.js');
  const { sampleState } = await import('../src/js/store.js');
  const s = sampleState();
  const o = trackOverview(s.items, s.materiality.performance);
  assert.equal(o.any, true);
  assert.deepEqual([o.required.total, o.required.received], [2, 1]);
  assert.deepEqual(o.required.pending.map((p) => p.name), ['한빛은행 여의도지점']);
  assert.deepEqual([o.general.total, o.general.received], [1, 0]);
  // 미확인 = 세진물산 435,500,000 + 오성테크 (96,300,000 − 60,000,000) + 대한부품 차이 12,000,000
  assert.equal(o.coverage.uncovered, 483800000);
  assert.equal(o.coverage.performance, 180000000);
  assert.equal(o.coverage.exceeds, true);
  assert.equal(o.coverage.gap, 303800000);
  assert.equal(trackOverview([], 0).any, false);
  assert.equal(trackOverview(s.items, null).coverage.exceeds, false, '수행중요성이 없으면 비교하지 않음');
});

test('커버리지: 차이 조정을 마치면 시점 차이로 설명된 금액까지 확인, 왜곡표시는 미확인으로 남김', () => {
  const recon = { book: 842000000, confirmed: 830000000, lines: [
    { cause: 'goods', amount: 9000000, terms: 'destination' }, { cause: 'cash', amount: 3000000 },
  ] };
  const doing = { ...ar, status: 'follow', follow: { type: 'diff', recon } };
  const done = { ...doing, status: 'done' };
  assert.equal(coverageSummary([doing]).confirmed, 830000000);
  assert.equal(coverageSummary([done]).confirmed, 833000000, '송금 중 3,000,000만 더하고 도착지 인도 9,000,000은 제외');
});
