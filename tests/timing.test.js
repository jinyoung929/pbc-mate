import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sendTiming, isOffHours, nextBusinessDay, parseNow, clockOf } from '../src/js/lib/timing.js';
import { bundleItems } from '../src/js/lib/bundle.js';
import { sampleState } from './fixtures.js';

const FRI_1720 = { date: '2026-10-02', time: '17:20' }; // 레퍼런스 5 시나리오
const FORBIDDEN = /반드시|자동 예약|발송됩니다/;
const allText = (t) => [t.title, t.recommend, t.reason, ...t.chips.map((c) => `${c.value} ${c.extra || ''}`)].join(' ');

test('금요일 17:20 + 여유 있는 자료(10/6 화) → 월요일 오전 9시 추천', () => {
  const t = sendTiming(FRI_1720, '2026-10-06');
  assert.equal(t.kind, 'wait');
  assert.equal(t.nowLabel, '금 17:20');
  assert.equal(t.title, '지금 보내면 묻힐 수 있어요');
  assert.equal(t.recommend, '월요일 오전 9시 발송을 추천해요');
  assert.equal(t.reason, '금요일 늦은 시간이고, 필요일까지 여유가 있어요.');
  assert.deepEqual(t.chips, [
    { label: '지금', value: '금 17:20' },
    { label: '추천', value: '월 10/5 09:00' },
    { label: '필요일', value: '화 10/6', extra: '하루 여유' },
  ]);
});

test('금요일 17:20 + 필요일 임박(월요일 필요) → 지금 발송 추천', () => {
  const t = sendTiming(FRI_1720, '2026-10-05');
  assert.equal(t.kind, 'urgent');
  assert.equal(t.title, '필요일이 임박해 있어 지금 발송하는 편이 나아요');
  assert.equal(t.recommend, null);
  assert.match(t.reason, /다음 영업일\(월 10\/5\)에 보내면 필요일에 맞추기 어려워요/);
  // 금요일 당일 필요도 임박
  assert.equal(sendTiming(FRI_1720, '2026-10-02').kind, 'urgent');
});

test('금요일 17:20 + 이미 지연 → 지금 발송 추천', () => {
  const t = sendTiming(FRI_1720, '2026-09-30');
  assert.equal(t.kind, 'urgent');
  assert.equal(t.title, '필요일이 지나 지금 발송하는 편이 나아요');
  assert.match(t.reason, /필요일\(9\/30\)이 이미 지났어요/);
  assert.deepEqual(t.chips.at(-1), { label: '필요일', value: '수 9/30', extra: '2일 지남' });
});

test('평일 일반 시간 → 지금 보내도 괜찮아요 (배너 없음)', () => {
  for (const clock of [
    { date: '2026-10-01', time: '10:00' }, // 목 오전
    { date: '2026-10-02', time: '16:59' }, // 금 17시 전
    { date: '2026-10-05', time: '09:00' }, // 월 오전
  ]) {
    const t = sendTiming(clock, '2026-10-20');
    assert.equal(t.kind, 'ok', JSON.stringify(clock));
    assert.equal(t.title, '지금 보내도 괜찮아요');
    assert.deepEqual(t.chips, []);
  }
});

test('평일 일반 시간 + 이미 지연 → 긴급 (요일보다 긴급도 우선)', () => {
  const t = sendTiming({ date: '2026-10-01', time: '10:00' }, '2026-09-30');
  assert.equal(t.kind, 'urgent');
  assert.equal(t.title, '필요일이 지나 지금 발송하는 편이 나아요');
  assert.equal(t.reason, '필요일(9/30)이 이미 지났어요.');
  assert.deepEqual(t.chips, [{ label: '지금', value: '목 10:00' }, { label: '필요일', value: '수 9/30', extra: '1일 지남' }]);
});

test('평일 일반 시간 + 당일·익일 필요 → 긴급, 모레 이후는 ok', () => {
  const thu = { date: '2026-10-01', time: '10:00' };
  const today = sendTiming(thu, '2026-10-01');
  assert.equal(today.kind, 'urgent');
  assert.equal(today.title, '필요일이 임박해 있어 지금 발송하는 편이 나아요');
  assert.equal(today.reason, '다음 영업일(금 10/2)에 보내면 필요일에 맞추기 어려워요.');
  assert.equal(today.chips[1].extra, '오늘');
  // 내일 필요: 다음 영업일 = 필요일 당일 → 긴급 (시연 기준일의 은행조회서)
  assert.equal(sendTiming(thu, '2026-10-02').kind, 'urgent');
  // 모레 필요: 다음 영업일에 보내도 하루 남음 → ok
  assert.equal(sendTiming(thu, '2026-10-03').kind, 'ok');
  // 금요일 오전, 월요일 필요: 다음 영업일(월)이 당일 → 긴급
  assert.equal(sendTiming({ date: '2026-10-02', time: '10:00' }, '2026-10-05').kind, 'urgent');
});

test('주말도 다음 영업일 기준으로 판단한다', () => {
  const sat = sendTiming({ date: '2026-10-03', time: '11:00' }, '2026-10-08');
  assert.equal(sat.kind, 'wait');
  assert.equal(sat.reason, '주말이고, 필요일까지 여유가 있어요.');
  assert.equal(sat.chips[1].value, '월 10/5 09:00');
  assert.equal(sat.chips[2].extra, '3일 여유');
  assert.equal(sendTiming({ date: '2026-10-04', time: '20:00' }, '2026-10-05').kind, 'urgent');
});

test('isOffHours / nextBusinessDay', () => {
  assert.equal(isOffHours({ date: '2026-10-02', time: '17:00' }), true);
  assert.equal(isOffHours({ date: '2026-10-02', time: '16:59' }), false);
  assert.equal(isOffHours({ date: '2026-10-01', time: '23:00' }), false); // 목요일 밤은 대상 아님
  assert.equal(nextBusinessDay('2026-10-02'), '2026-10-05');
  assert.equal(nextBusinessDay('2026-10-01'), '2026-10-02');
});

test('묶음 독촉은 가장 급한 자료(재고실사 10/6) 기준', () => {
  const sorted = bundleItems(sampleState().items, '김민지 대리', FRI_1720.date);
  assert.equal(sorted[0].name, '재고실사 결과표');
  const t = sendTiming(FRI_1720, sorted[0].neededOn);
  assert.equal(t.kind, 'wait');
  // 가장 덜 급한 자료(10/20) 기준이었다면 결과가 달라질 수 있는 경우: 가장 급한 자료가 임박이면 지금
  const urgentFirst = [{ neededOn: '2026-10-05' }, { neededOn: '2026-10-20' }];
  assert.equal(sendTiming(FRI_1720, urgentFirst[0].neededOn).kind, 'urgent');
});

test('단정적인 표현·예약 발송처럼 보이는 표현을 쓰지 않는다', () => {
  for (const need of ['2026-10-06', '2026-10-05', '2026-09-30', '2026-10-20']) {
    for (const clock of [FRI_1720, { date: '2026-10-03', time: '11:00' }, { date: '2026-10-01', time: '10:00' }]) {
      assert.doesNotMatch(allText(sendTiming(clock, need)), FORBIDDEN);
    }
  }
});

test('parseNow / clockOf: 현재 시각 주입', () => {
  assert.deepEqual(parseNow('2026-10-02T17:20'), FRI_1720);
  assert.equal(parseNow('2026-10-02'), null);
  assert.equal(parseNow(null), null);
  assert.deepEqual(clockOf(new Date(2026, 9, 2, 9, 5)), { date: '2026-10-02', time: '09:05' });
});
