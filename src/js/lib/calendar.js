// 일정: 자료 필요일(자동) + 사용자가 만든 일정(events)을 한 달력에서 관리한다.
//
// state.events = [{ id, title, date, itemId?, note?, progress?, by? }]   // 사용자가 만든 일정 (by: 만든 감사인, 없으면 팀 공통)
//   progress: 'planned'(진행예정, 기본) | 'doing'(진행중) | 'done'(완료)
// 달력 항목(entry)은 두 종류:
//   need:<itemId>  — 자료의 필요일. 옮기면 item.neededOn이 바뀐다.
//   event:<id>     — 사용자 일정. 옮기면 event.date가 바뀐다.

import { addDays, daysBetween, formatMD } from './dates.js';
import { withDays, isOpen } from './priority.js';

/** 할 일 구분 3가지 */
export const PROGRESS = [
  { key: 'done', label: '완료' },
  { key: 'doing', label: '진행중' },
  { key: 'planned', label: '진행예정' },
];

export function progressLabel(key) {
  return PROGRESS.find((p) => p.key === key)?.label ?? key;
}

/**
 * 항목의 진행 구분.
 * 자료 필요일: 완료 상태면 완료, 아직 요청 전(요청일이 기준일 뒤)이면 진행예정, 그 외(요청해서 기다리는 중)는 진행중.
 * 사용자 일정: 저장된 progress (기본 진행예정).
 */
export function progressOf(entry) {
  return entry.progress;
}

const pad = (n) => String(n).padStart(2, '0');

/** 'YYYY-MM' ← 'YYYY-MM-DD' */
export function monthOf(iso) {
  return iso.slice(0, 7);
}

export function shiftMonth(ym, delta) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

export function monthLabel(ym) {
  const [y, m] = ym.split('-').map(Number);
  return `${y}년 ${m}월`;
}

/**
 * 달력 격자: 일요일 시작, 6주(42칸). 각 칸은 { date, inMonth, dow }.
 */
export function monthGrid(ym) {
  const [y, m] = ym.split('-').map(Number);
  const first = `${ym}-01`;
  const lead = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const start = addDays(first, -lead);
  return Array.from({ length: 42 }, (_, i) => {
    const date = addDays(start, i);
    return { date, inMonth: monthOf(date) === ym, dow: i % 7 };
  });
}

/** 자료 필요일 + 사용자 일정을 달력 항목으로 합친다. */
export function calendarEntries(state, today) {
  const needs = state.items.map((x) => {
    const w = withDays(x, today);
    return {
      id: `need:${x.id}`,
      kind: 'need',
      date: x.neededOn,
      title: x.name,
      sub: `${x.owner} · 필요일`,
      itemId: x.id,
      status: x.status,
      risk: isOpen(x) ? w.risk : 'done',
      left: w.left,
      progress: x.status === 'done' ? 'done' : x.requestedOn > today ? 'planned' : 'doing',
    };
  });
  const events = (state.events || []).map((e) => ({
    id: `event:${e.id}`,
    kind: 'event',
    date: e.date,
    title: e.title,
    sub: e.itemId ? state.items.find((x) => x.id === e.itemId)?.name || '' : (e.note || ''),
    itemId: e.itemId || null,
    eventId: e.id,
    progress: e.progress || 'planned',
  }));
  return [...needs, ...events].sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind));
}

export function entriesOn(entries, date) {
  return entries.filter((e) => e.date === date);
}

function nextEventId(state) {
  const used = new Set((state.events || []).map((e) => e.id));
  let n = (state.events || []).length + 1;
  while (used.has(`e${n}`)) n += 1;
  return `e${n}`;
}

/** 사용자 일정 추가. 같은 자료·같은 날짜·같은 제목이 이미 있으면 그대로 둔다(중복 방지). */
export function addEvent(state, { title, date, itemId = null, note = '', by = '' }) {
  const t = String(title ?? '').trim();
  if (!t || !date) return { state, added: false };
  const dup = (state.events || []).some((e) => e.title === t && e.date === date && (e.itemId || null) === itemId);
  if (dup) return { state, added: false };
  const event = { id: nextEventId(state), title: t, date, ...(itemId && { itemId }), ...(note && { note }), ...(by && { by }) };
  return { state: { ...state, events: [...(state.events || []), event] }, added: true, event };
}

/** 사용자 일정의 진행 구분 변경 */
export function setEventProgress(state, eventId, progress) {
  if (!PROGRESS.some((p) => p.key === progress)) return state;
  return { ...state, events: (state.events || []).map((e) => (e.id === eventId ? { ...e, progress } : e)) };
}

/** 구분별 개수 { done, doing, planned } */
export function countByProgress(entries) {
  return entries.reduce((acc, e) => ({ ...acc, [e.progress]: (acc[e.progress] || 0) + 1 }), { done: 0, doing: 0, planned: 0 });
}

export function removeEvent(state, eventId) {
  return { ...state, events: (state.events || []).filter((e) => e.id !== eventId) };
}

/**
 * 달력 항목을 다른 날로 옮긴다.
 * need:* 는 자료의 필요일(neededOn)을 바꾸고, event:* 는 일정 날짜를 바꾼다. 상태·이력은 건드리지 않는다.
 */
export function moveEntry(state, entryId, date) {
  const [kind, id] = entryId.split(':');
  if (kind === 'need') {
    return { ...state, items: state.items.map((x) => (x.id === id ? { ...x, neededOn: date } : x)) };
  }
  if (kind === 'event') {
    return { ...state, events: (state.events || []).map((e) => (e.id === id ? { ...e, date } : e)) };
  }
  return state;
}

/** 회신 기한 날짜: 필요일이 3일 이내(또는 지남)면 오늘, 아니면 필요일 2일 전 (mail.js의 replyBy와 같은 규칙) */
export function replyByDate(today, neededOn) {
  const left = daysBetween(today, neededOn);
  return left <= 3 ? today : addDays(neededOn, -2);
}

/**
 * 메일에 나오는 일정 후보: 캘린더로 끌어다 놓을 수 있는 날짜들.
 * @param items 메일에 담긴 자료들 (단건·보완은 1개, 묶음은 여러 개 — 가장 급한 자료 기준으로 회신 기한 1개)
 */
export function mailDates(items, today, { replyBy = true } = {}) {
  const dates = items.map((x) => ({
    key: `need-${x.id}`, itemId: x.id, date: x.neededOn,
    title: `${x.name} 필요일`, label: `필요일 ${formatMD(x.neededOn)}`,
  }));
  if (replyBy && items.length) {
    const top = items[0];
    const by = replyByDate(today, top.neededOn);
    dates.push({
      key: `reply-${top.id}`, itemId: top.id, date: by,
      title: `${top.name} 회신 기한`, label: `회신 기한 ${formatMD(by)}`,
    });
  }
  return dates;
}

/** 메일 본문의 날짜 칩이 어떤 일정 후보인지 찾는다. '내일(10/2)', '10/4까지', '10월 6일' 표기를 모두 본다. */
export function matchMailDate(text, dates) {
  return dates.find((d) => {
    const [, m, day] = d.date.split('-').map(Number);
    return text.includes(formatMD(d.date)) || text.includes(`${m}월 ${day}일`);
  }) || null;
}
