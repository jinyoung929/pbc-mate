import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  weekRange, weekLabel, buildReport, summaryLines, reportToText, reportToCsv, csvFileName,
} from '../src/js/lib/report.js';
import { baseDateOf, DEMO_DATE } from '../src/js/store.js';
import { sampleState } from './fixtures.js';
import { summarize, withDays } from '../src/js/lib/priority.js';

const state = sampleState();
const report = buildReport(state, DEMO_DATE);

test('weekRange: 월~금, 주말은 지난 주', () => {
  assert.deepEqual(weekRange('2026-10-01'), { start: '2026-09-28', end: '2026-10-02' });
  assert.deepEqual(weekRange('2026-09-28'), { start: '2026-09-28', end: '2026-10-02' });
  assert.deepEqual(weekRange('2026-10-04'), { start: '2026-09-28', end: '2026-10-02' });
  assert.equal(weekLabel(weekRange('2026-10-01')), '9월 28일(월) ~ 10월 2일(금)');
});

test('상태별 집계', () => {
  assert.deepEqual(
    { total: report.counts.total, done: report.counts.done, none: report.counts.none, part: report.counts.part, fix: report.counts.fix },
    { total: 6, done: 1, none: 3, part: 1, fix: 1 });
});

test('미완료·지연·긴급 집계는 대시보드 숫자와 같다', () => {
  const dash = summarize(state.items.map((x) => withDays(x, DEMO_DATE)));
  assert.equal(report.counts.open, dash.open);
  assert.equal(report.counts.urgent, dash.urgent);
  assert.equal(report.counts.dueWeek, dash.dueWeek);
  assert.equal(report.counts.late, 0);
  assert.equal(report.counts.urgent, 1);
});

test('지연 자료 집계: 기준일이 지나면 늘어난다', () => {
  const later = buildReport(state, '2026-10-07');
  assert.equal(later.counts.late, 2); // 은행조회서(10/2), 재고실사(10/6)
  assert.equal(later.counts.urgent, 3); // + 유형자산(10/8, 1일 남음)
  assert.deepEqual(later.urgentItems.map((r) => r.name), ['은행조회서 회신', '재고실사 결과표', '유형자산 증감내역']);
});

test('이번 주 수령: 수령일이 저장된 자료만 센다', () => {
  assert.equal(report.received.count, 1);
  assert.deepEqual(report.received.items.map((x) => x.name), ['유형자산 증감내역']);
  assert.equal(report.received.missingDates, 2, '완료·일부 수령인데 수령일이 없는 자료');
  // 수령일이 다른 주면 제외
  const other = buildReport({ ...state, items: state.items.map((x) => (x.id === 'i2' ? { ...x, received: { on: '2026-09-20' } } : x)) }, DEMO_DATE);
  assert.equal(other.received.count, 0);
});

test('담당자별 묶기와 미완료 건수·긴급·가장 가까운 필요일·최근 독촉일', () => {
  assert.deepEqual(report.owners.map((o) => [o.owner, o.open, o.urgent, o.nearest, o.lastNudgedOn]), [
    ['박준호 과장', 1, 1, '2026-10-02', '2026-09-30'],
    ['김민지 대리', 3, 0, '2026-10-06', '2026-09-29'],
    ['최도윤 차장', 1, 0, '2026-10-08', '2026-09-26'],
  ]);
  assert.equal(report.owners[1].dept, '재무팀');
});

test('자료 목록은 필요일 기준 우선순위, 완료는 맨 뒤', () => {
  assert.deepEqual(report.rows.map((r) => r.name), [
    '은행조회서 회신', '재고실사 결과표', '유형자산 증감내역', '특수관계자 거래내역', '매출채권 연령분석표', '법인세 신고서 사본',
  ]);
  const bank = report.rows[0];
  assert.deepEqual([bank.statusLabel, bank.left, bank.riskLabel, bank.lastNudgedOn], ['미회신', 1, '2일 이내', '2026-09-30']);
  assert.equal(report.rows.at(-1).riskLabel, '');
  assert.equal(report.rows[2].fixReason, '기준일 상이');
});

test('요약 문구', () => {
  assert.deepEqual(summaryLines(report), [
    '이번 주 기준 미완료 자료는 5건이고, 이 중 1건이 지연 또는 긴급 상태예요.',
    '김민지 대리에게 남은 요청이 3건으로 가장 많아요.',
  ]);
  const noUrgent = summaryLines(buildReport(state, '2026-09-20'));
  assert.equal(noUrgent[0], '이번 주 기준 미완료 자료는 5건이고, 지연이나 긴급 상태인 자료는 없어요.');
  const tie = summaryLines(buildReport({ ...state, items: state.items.filter((x) => x.owner !== '김민지 대리') }, DEMO_DATE));
  assert.equal(tie[1], '박준호 과장 등 2명에게 남은 요청이 1건씩 있어요.');
});

test('현황 복사 텍스트', () => {
  assert.equal(reportToText(report), [
    '[주간 PBC 현황]',
    '한빛전자 · 기준일 10/1',
    '전체 6건 / 완료 1건 / 미완료 5건',
    '긴급·지연 1건',
    '보완 요청 1건',
    '',
    '담당자별',
    '- 박준호 과장: 1건 (긴급·지연 1)',
    '- 김민지 대리: 3건',
    '- 최도윤 차장: 1건',
    '',
    '긴급 자료',
    '- 은행조회서 회신 / 10/2 필요 · 1일 남음',
  ].join('\n'));
});

test('CSV 생성: 헤더·BOM·완료 자료는 남은일수 비움·쉼표 이스케이프', () => {
  const csv = reportToCsv(report);
  const lines = csv.split('\n');
  assert.equal(lines[0], '﻿자료명,담당자,상태,요청일,필요일,남은일수,최근독촉일');
  assert.equal(lines[1], '은행조회서 회신,박준호 과장,미회신,2026-09-28,2026-10-02,1,2026-09-30');
  assert.equal(lines.at(-1), '법인세 신고서 사본,박준호 과장,완료,2026-09-25,2026-10-04,,');
  assert.equal(lines.length, 7);
  const tricky = reportToCsv(buildReport({ ...state, items: [{ ...state.items[0], name: '현금, 예금 "명세"' }] }, DEMO_DATE));
  assert.match(tricky, /"현금, 예금 ""명세"""/);
  assert.equal(csvFileName(report), 'pbc-현황-2026-10-01.csv');
});

test('시연 기준일과 ?today 반영: 대시보드와 같은 기준일 함수', () => {
  const demoToday = baseDateOf(state, null, '2026-10-07');
  assert.equal(demoToday, DEMO_DATE);
  assert.equal(buildReport(state, demoToday).counts.urgent, 1);
  const override = baseDateOf(state, '2026-10-07', '2026-10-01');
  assert.equal(buildReport(state, override).counts.late, 2);
});

test('빈 상태', () => {
  const empty = buildReport({ client: { name: 'X' }, people: {}, items: [] }, DEMO_DATE);
  assert.equal(empty.counts.total, 0);
  assert.deepEqual(empty.owners, []);
  assert.deepEqual(summaryLines(empty), ['아직 집계할 자료가 없어요.']);
  assert.equal(reportToCsv(empty).split('\n').length, 1);
});

test('주간 보고: 상태 칸 합계가 전체 건수와 같다 (외부조회 후속 절차 포함)', async () => {
  const { sampleState: appSample } = await import('../src/js/store.js');
  const r = buildReport(appSample(), '2026-10-01');
  const c = r.counts;
  assert.equal(c.done + c.none + c.part + c.fix + c.follow, c.total);
  assert.equal(c.follow, 2);
});
