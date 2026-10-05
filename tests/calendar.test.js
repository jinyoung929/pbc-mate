import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  monthOf, shiftMonth, monthLabel, monthGrid, calendarEntries, entriesOn,
  addEvent, removeEvent, moveEntry, replyByDate, mailDates, matchMailDate,
  PROGRESS, progressLabel, setEventProgress, countByProgress,
} from '../src/js/lib/calendar.js';
import { sampleState, DEMO_DATE } from './fixtures.js';
import { withDays, isOpen, sortItems } from '../src/js/lib/priority.js';
import { buildMail } from '../src/js/lib/mail.js';

const state = sampleState();

test('월 계산', () => {
  assert.equal(monthOf('2026-10-01'), '2026-10');
  assert.equal(shiftMonth('2026-10', 1), '2026-11');
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  assert.equal(monthLabel('2026-10'), '2026년 10월');
});

test('monthGrid: 일요일 시작 42칸, 2026년 10월은 목요일 시작', () => {
  const g = monthGrid('2026-10');
  assert.equal(g.length, 42);
  assert.equal(g[0].date, '2026-09-27');
  assert.equal(g[0].dow, 0);
  assert.equal(g[4].date, '2026-10-01');
  assert.equal(g[4].inMonth, true);
  assert.equal(g[3].inMonth, false);
  assert.equal(g.filter((c) => c.inMonth).length, 31);
});

test('calendarEntries: 자료 필요일(위험도 포함) + 사용자 일정, 날짜순', () => {
  const s = addEvent(state, { title: '매니저 주간 보고', date: '2026-10-02' }).state;
  const entries = calendarEntries(s, DEMO_DATE);
  assert.equal(entries.length, 7);
  const bank = entries.find((e) => e.id === 'need:i1');
  assert.deepEqual([bank.kind, bank.date, bank.title, bank.risk, bank.left], ['need', '2026-10-02', '은행조회서 회신', 'high', 1]);
  assert.equal(entries.find((e) => e.id === 'need:i6').risk, 'done');
  const ev = entries.find((e) => e.kind === 'event');
  assert.deepEqual([ev.id, ev.date, ev.title], ['event:e1', '2026-10-02', '매니저 주간 보고']);
  assert.ok(entries.every((e, i) => i === 0 || entries[i - 1].date <= e.date));
  assert.deepEqual(entriesOn(entries, '2026-10-02').map((e) => e.id), ['event:e1', 'need:i1']);
});

test('addEvent: 자료 연결·중복 방지·빈 제목 거부', () => {
  const r1 = addEvent(state, { title: '은행조회서 회신 회신 기한', date: '2026-10-01', itemId: 'i1' });
  assert.equal(r1.added, true);
  assert.deepEqual(r1.event, { id: 'e1', title: '은행조회서 회신 회신 기한', date: '2026-10-01', itemId: 'i1' });
  const r2 = addEvent(r1.state, { title: '은행조회서 회신 회신 기한', date: '2026-10-01', itemId: 'i1' });
  assert.equal(r2.added, false);
  assert.equal(r2.state.events.length, 1);
  assert.equal(addEvent(state, { title: '  ', date: '2026-10-01' }).added, false);
  assert.equal(state.events, undefined, '원래 state 불변');
  const r3 = addEvent(r1.state, { title: '두 번째', date: '2026-10-03' });
  assert.equal(r3.event.id, 'e2');
});

test('removeEvent', () => {
  const s = addEvent(state, { title: 'x', date: '2026-10-01' }).state;
  assert.equal(removeEvent(s, 'e1').events.length, 0);
  assert.equal(s.events.length, 1);
});

test('moveEntry(need): 자료 필요일이 바뀌고 대시보드 우선순위에 반영', () => {
  const moved = moveEntry(state, 'need:i1', '2026-10-15');
  const bank = moved.items.find((x) => x.id === 'i1');
  assert.equal(bank.neededOn, '2026-10-15');
  assert.equal(bank.status, 'none');
  assert.deepEqual(bank.nudges, state.items[0].nudges);
  assert.equal(state.items[0].neededOn, '2026-10-02', '원래 state 불변');
  const open = sortItems(moved.items.map((x) => withDays(x, DEMO_DATE)).filter(isOpen), 'need');
  assert.equal(open[0].name, '재고실사 결과표');
  assert.equal(withDays(bank, DEMO_DATE).risk, 'low');
  // 메일 문구에도 반영
  const mail = buildMail({ item: withDays(bank, DEMO_DATE), person: {}, client: state.client, today: DEMO_DATE, tone: 'polite' });
  assert.match(mail.subject, /10\/15 필요/);
});

test('moveEntry(event): 일정 날짜만 바뀐다', () => {
  const s = addEvent(state, { title: 'x', date: '2026-10-01' }).state;
  const moved = moveEntry(s, 'event:e1', '2026-10-09');
  assert.equal(moved.events[0].date, '2026-10-09');
  assert.equal(moved.items[0].neededOn, '2026-10-02');
  assert.equal(moveEntry(s, 'bogus:1', '2026-10-09'), s);
});

test('replyByDate: mail.js 규칙과 같다', () => {
  assert.equal(replyByDate('2026-10-01', '2026-10-02'), '2026-10-01');
  assert.equal(replyByDate('2026-10-01', '2026-10-04'), '2026-10-01');
  assert.equal(replyByDate('2026-10-01', '2026-10-20'), '2026-10-18');
});

test('mailDates: 메일에 나오는 필요일·회신 기한 후보', () => {
  const inv = state.items.find((x) => x.id === 'i3'); // 10/6 필요
  const d = mailDates([inv], DEMO_DATE);
  assert.deepEqual(d.map((x) => [x.title, x.date, x.label]), [
    ['재고실사 결과표 필요일', '2026-10-06', '필요일 10/6'],
    ['재고실사 결과표 회신 기한', '2026-10-04', '회신 기한 10/4'],
  ]);
  // 묶음: 자료마다 필요일 + 가장 급한 자료의 회신 기한 하나
  const bundle = mailDates([inv, state.items.find((x) => x.id === 'i5')], DEMO_DATE);
  assert.equal(bundle.length, 3);
  // 보완 요청: 회신 기한 없이 필요일만
  assert.equal(mailDates([inv], DEMO_DATE, { replyBy: false }).length, 1);
});

test('matchMailDate: 본문 날짜 칩을 일정 후보에 연결', () => {
  const inv = state.items.find((x) => x.id === 'i3');
  const d = mailDates([inv], DEMO_DATE);
  assert.equal(matchMailDate('10/4까지', d).title, '재고실사 결과표 회신 기한');
  assert.equal(matchMailDate('10월 6일', d).title, '재고실사 결과표 필요일', '월/일 표기도 매칭');
  assert.equal(matchMailDate('내일(10/6)', d).date, '2026-10-06');
  assert.equal(matchMailDate('9월 26일', d), null);
});

test('진행 구분: 자료 필요일은 상태로, 사용자 일정은 저장값으로', () => {
  assert.deepEqual(PROGRESS.map((p) => p.label), ['완료', '진행중', '진행예정']);
  let s = addEvent(state, { title: '매니저 보고', date: '2026-10-02' }).state;
  const future = { ...state.items[0], id: 'x9', requestedOn: '2026-10-05', neededOn: '2026-10-12' };
  s = { ...s, items: [...s.items, future] };
  const entries = calendarEntries(s, DEMO_DATE);
  assert.equal(entries.find((e) => e.id === 'need:i6').progress, 'done', '완료 자료');
  assert.equal(entries.find((e) => e.id === 'need:i1').progress, 'doing', '요청해서 기다리는 중');
  assert.equal(entries.find((e) => e.id === 'need:x9').progress, 'planned', '아직 요청 전');
  assert.equal(entries.find((e) => e.kind === 'event').progress, 'planned', '기본값');
  assert.deepEqual(countByProgress(entries), { done: 1, doing: 5, planned: 2 });

  const moved = setEventProgress(s, 'e1', 'doing');
  assert.equal(calendarEntries(moved, DEMO_DATE).find((e) => e.kind === 'event').progress, 'doing');
  assert.equal(setEventProgress(moved, 'e1', 'bogus'), moved, '모르는 값은 무시');
  assert.equal(progressLabel('doing'), '진행중');
  assert.equal(s.events[0].progress, undefined, '원래 state 불변');
});
