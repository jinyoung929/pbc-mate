import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  riskOf, withDays, isOpen, sortItems, groupByOwner, summarize, leftText, insight,
} from '../src/js/lib/priority.js';
import { baseDateOf } from '../src/js/store.js';
import { sampleState, DEMO_DATE } from './fixtures.js';

// 예시 자료는 시연 기준일(레퍼런스 화면과 같은 2026-10-01)로 고정돼 있다.
const TODAY = DEMO_DATE;
const items = sampleState().items.map((x) => withDays(x, TODAY));
const open = items.filter(isOpen);
const names = (list) => list.map((x) => x.name);

test('riskOf: 경계값', () => {
  assert.equal(riskOf(-1), 'late');
  assert.equal(riskOf(0), 'high');
  assert.equal(riskOf(2), 'high');
  assert.equal(riskOf(3), 'mid');
  assert.equal(riskOf(7), 'mid');
  assert.equal(riskOf(8), 'low');
});

test('withDays: 레퍼런스의 남은 날·경과일과 일치', () => {
  const bank = items.find((x) => x.name === '은행조회서 회신');
  assert.equal(bank.left, 1);
  assert.equal(bank.elapsed, 3);
  assert.equal(bank.risk, 'high');
});

test('필요일순 정렬은 레퍼런스 순서와 같다', () => {
  assert.deepEqual(names(sortItems(open, 'need')), [
    '은행조회서 회신', '재고실사 결과표', '유형자산 증감내역', '특수관계자 거래내역', '매출채권 연령분석표',
  ]);
});

test('경과일순 정렬은 오래된 요청부터', () => {
  assert.deepEqual(names(sortItems(open, 'elapsed')), [
    '매출채권 연령분석표', '특수관계자 거래내역', '재고실사 결과표', '은행조회서 회신', '유형자산 증감내역',
  ]);
});

test('같은 남은 날이면 더 오래 기다린 자료가 앞', () => {
  const a = { name: 'a', left: 3, elapsed: 1 };
  const b = { name: 'b', left: 3, elapsed: 5 };
  assert.deepEqual(names(sortItems([a, b], 'need')), ['b', 'a']);
});

test('groupByOwner: 가장 급한 자료가 있는 담당자부터', () => {
  const groups = groupByOwner(sortItems(open, 'need'));
  assert.deepEqual(groups.map((g) => g.owner), ['박준호 과장', '김민지 대리', '최도윤 차장']);
  assert.equal(groups[1].items.length, 3);
});

test('summarize: 레퍼런스 상단 숫자와 일치', () => {
  assert.deepEqual(summarize(items), { urgent: 1, dueWeek: 3, needsFix: 1, open: 5, total: 6 });
});

test('leftText', () => {
  assert.equal(leftText(1), '1일 남음');
  assert.equal(leftText(0), '오늘');
  assert.equal(leftText(-2), '2일 지남');
});

test('insight: 레퍼런스 문구와 일치', () => {
  const need = insight(sortItems(open, 'need')[0], 'need');
  assert.equal(need.title, '내일 필요한 ‘은행조회서 회신’이 가장 급해요.');
  assert.equal(need.sub, '필요일 10/2 · 1일 남음');

  const elapsed = insight(sortItems(open, 'elapsed')[0], 'elapsed');
  assert.equal(elapsed.title, '요청 후 11일 지난 ‘매출채권 연령분석표’가 가장 오래됐어요.');
  assert.equal(elapsed.sub, '필요일 10/20 · 19일 남음');
});

test('insight: 필요일이 지난 자료', () => {
  const late = { name: '급여대장', neededOn: '2026-09-29', left: -2, elapsed: 8 };
  assert.equal(insight(late, 'need').title, '필요일이 2일 지난 ‘급여대장’이 가장 급해요.');
});

test('summarize: 긴급 자료는 지연 + 2일 이내', () => {
  const list = [-3, 0, 2, 3].map((left, i) => ({ id: String(i), left, status: 'none' }));
  assert.equal(summarize(list).urgent, 3);
});

test('예시 자료는 시연 기준일 2026-10-01에 고정', () => {
  const s = sampleState();
  assert.equal(s.demoDate, '2026-10-01');
  assert.equal(s.items.find((x) => x.name === '은행조회서 회신').neededOn, '2026-10-02');
});

test('baseDateOf: ?today= > 시연 기준일 > 실제 오늘', () => {
  const demo = { demoDate: '2026-10-01' };
  assert.equal(baseDateOf(demo, '2026-10-05', '2026-10-03'), '2026-10-05');
  assert.equal(baseDateOf(demo, null, '2026-10-03'), '2026-10-01');
  assert.equal(baseDateOf({ items: [] }, null, '2026-10-03'), '2026-10-03');
});
