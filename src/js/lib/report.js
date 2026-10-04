// 7. 주간 현황 보고: 현재 자료 현황을 요약해 내부 공유용 텍스트·CSV로 만든다.
// 숫자는 대시보드와 같은 함수(withDays·riskOf·sortItems·groupByOwner)로 계산한다.

import { addDays, formatMD } from './dates.js';
import { withDays, isOpen, sortItems, groupByOwner, leftText } from './priority.js';
import { clientShortName } from './mail.js';
import { fixReasonLabel } from './fix.js';

const STATUS = { none: '미회신', part: '일부 수령', fix: '보완 요청', follow: '후속 절차', done: '완료' };
const RISK = { late: '지연', high: '2일 이내', mid: '3~7일', low: '8일 이상' };
const DOW = ['일', '월', '화', '수', '목', '금', '토'];

function dow(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** today가 속한 주의 월요일~금요일. 주말이면 그 주(지난 월~금). */
export function weekRange(today) {
  const offset = (dow(today) + 6) % 7; // 월=0 … 일=6
  const start = addDays(today, -offset);
  return { start, end: addDays(start, 4) };
}

export function weekLabel({ start, end }) {
  const f = (iso) => {
    const [, m, d] = iso.split('-').map(Number);
    return `${m}월 ${d}일(${DOW[dow(iso)]})`;
  };
  return `${f(start)} ~ ${f(end)}`;
}

const lastOf = (list) => (list && list.length ? list[list.length - 1] : null);

/**
 * @returns {{
 *   today, week, client,
 *   counts: { total, done, none, part, fix, open, late, urgent, dueWeek },
 *   received: { count, items, missingDates },   // 이번 주 수령 (수령일이 저장된 자료만)
 *   owners: { owner, dept, open, urgent, nearest, lastNudgedOn }[],
 *   rows: { id, name, owner, status, statusLabel, requestedOn, neededOn, left, risk, riskLabel, lastNudgedOn }[],
 *   urgentItems: rows 중 지연·2일 이내
 * }}
 */
export function buildReport(state, today) {
  const all = state.items.map((x) => withDays(x, today));
  const open = sortItems(all.filter(isOpen), 'need');
  const done = all.filter((x) => !isOpen(x));
  const week = weekRange(today);

  const count = (s) => all.filter((x) => x.status === s).length;
  const counts = {
    total: all.length,
    done: count('done'),
    none: count('none'),
    part: count('part'),
    fix: count('fix'),
    follow: count('follow'), // 외부조회 후속 절차. 칸 합계(완료+미회신+일부 수령+보완 요청+후속 절차)가 전체와 같아지도록
    open: open.length,
    late: open.filter((x) => x.risk === 'late').length,
    urgent: open.filter((x) => x.risk === 'late' || x.risk === 'high').length,
    dueWeek: open.filter((x) => x.left <= 7).length,
  };

  // 수령일이 저장된 자료만 센다. 완료 상태라도 수령일이 없으면 추정하지 않는다.
  const inWeek = (iso) => iso >= week.start && iso <= week.end;
  const receivedItems = all.filter((x) => x.received?.on && inWeek(x.received.on));
  const received = {
    count: receivedItems.length,
    items: receivedItems,
    missingDates: all.filter((x) => (x.status === 'done' || x.status === 'part') && !x.received?.on).length,
  };

  const toRow = (x) => ({
    id: x.id,
    name: x.name,
    owner: x.owner,
    status: x.status,
    statusLabel: STATUS[x.status],
    requestedOn: x.requestedOn,
    neededOn: x.neededOn,
    left: x.left,
    risk: x.risk,
    riskLabel: isOpen(x) ? RISK[x.risk] : '',
    lastNudgedOn: lastOf(x.nudges)?.on ?? null,
    fixReason: x.status === 'fix' && x.fix?.reason ? fixReasonLabel(x.fix.reason) : null,
    // 외부조회 후속 절차를 마친 건: 수행자·검토자 (감사기준서 230)
    signoff: x.follow?.signoff
      ? `수행 ${x.follow.signoff.preparer}${x.follow.signoff.reviewer ? ` · 검토 ${x.follow.signoff.reviewer}` : ' · 검토 전'}`
      : null,
  });

  const owners = groupByOwner(open).map(({ owner, items }) => ({
    owner,
    dept: state.people[owner]?.dept || '',
    open: items.length,
    urgent: items.filter((x) => x.risk === 'late' || x.risk === 'high').length,
    nearest: items[0].neededOn,
    nearestLeft: items[0].left,
    lastNudgedOn: state.people[owner]?.lastNudgedOn ?? null,
  }));

  const rows = [...open, ...done].map(toRow);
  return {
    today,
    week,
    client: state.client,
    counts,
    received,
    owners,
    rows,
    urgentItems: rows.filter((r) => r.risk === 'late' || r.risk === 'high').filter((r) => r.status !== 'done'),
  };
}

/** 사람이 읽는 한두 문장 요약 */
export function summaryLines(report) {
  const { counts, owners } = report;
  if (!counts.total) return ['아직 집계할 자료가 없어요.'];
  if (!counts.open) return [`요청한 자료 ${counts.total}건을 모두 받았어요.`];

  const lines = [];
  const urgentPart = counts.urgent
    ? `이 중 ${counts.urgent}건이 지연 또는 긴급 상태예요.`
    : '지연이나 긴급 상태인 자료는 없어요.';
  lines.push(`이번 주 기준 미완료 자료는 ${counts.open}건이고, ${urgentPart}`);

  const max = Math.max(...owners.map((o) => o.open));
  const top = owners.filter((o) => o.open === max);
  if (owners.length > 1 && top.length === 1) {
    lines.push(`${top[0].owner}에게 남은 요청이 ${max}건으로 가장 많아요.`);
  } else if (owners.length > 1) {
    lines.push(`${top[0].owner} 등 ${top.length}명에게 남은 요청이 ${max}건씩 있어요.`);
  }
  return lines;
}

/** 내부 공유용 plain text */
export function reportToText(report) {
  const { counts, owners, urgentItems } = report;
  const lines = [
    '[주간 PBC 현황]',
    `${clientShortName(report.client.name)} · 기준일 ${formatMD(report.today)}`,
    `전체 ${counts.total}건 / 완료 ${counts.done}건 / 미완료 ${counts.open}건`,
    `긴급·지연 ${counts.urgent}건`,
    `보완 요청 ${counts.fix}건`,
  ];
  if (owners.length) {
    lines.push('', '담당자별');
    for (const o of owners) lines.push(`- ${o.owner}: ${o.open}건${o.urgent ? ` (긴급·지연 ${o.urgent})` : ''}`);
  }
  if (urgentItems.length) {
    lines.push('', '긴급 자료');
    for (const r of urgentItems) lines.push(`- ${r.name} / ${formatMD(r.neededOn)} 필요 · ${leftText(r.left)}`);
  }
  return lines.join('\n');
}

const csvCell = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV (엑셀에서 한글이 깨지지 않도록 BOM 포함). 완료 자료는 남은일수를 비운다. */
export function reportToCsv(report) {
  const head = ['자료명', '담당자', '상태', '요청일', '필요일', '남은일수', '최근독촉일'];
  const body = report.rows.map((r) => [
    r.name, r.owner, r.statusLabel, r.requestedOn, r.neededOn,
    r.status === 'done' ? '' : r.left, r.lastNudgedOn ?? '',
  ]);
  return `﻿${[head, ...body].map((row) => row.map(csvCell).join(',')).join('\n')}`;
}

export function csvFileName(report) {
  return `pbc-현황-${report.today}.csv`;
}
