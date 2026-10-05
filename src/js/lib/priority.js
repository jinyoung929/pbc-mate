// 대시보드의 판단 로직: 남은 날 계산, 위험도, 정렬, 담당자 묶음, 요약, 1순위 문구.

import { daysBetween, formatMD } from './dates.js';
import { josa } from './korean.js';

/** 필요일까지 남은 날로 위험도를 나눈다. */
export function riskOf(left) {
  if (left < 0) return 'late';
  if (left <= 2) return 'high';
  if (left <= 7) return 'mid';
  return 'low';
}

/** 오늘 기준 남은 날(left)과 요청 후 경과일(elapsed)을 붙인다. */
export function withDays(item, today) {
  const left = daysBetween(today, item.neededOn);
  return {
    ...item,
    left,
    elapsed: daysBetween(item.requestedOn, today),
    risk: riskOf(left),
  };
}

export function isOpen(item) {
  return item.status !== 'done';
}

/**
 * mode 'need': 필요일이 가까운 순 (같으면 오래 기다린 순)
 * mode 'elapsed': 요청 후 오래된 순 (같으면 필요일이 가까운 순)
 */
export function sortItems(items, mode) {
  const byNeed = (a, b) => a.left - b.left || b.elapsed - a.elapsed;
  const byElapsed = (a, b) => b.elapsed - a.elapsed || a.left - b.left;
  return [...items].sort(mode === 'need' ? byNeed : byElapsed);
}

/** 정렬된 목록을 담당자별로 묶는다. 담당자 순서는 각자의 가장 앞선 자료 순서. */
export function groupByOwner(sorted) {
  const groups = new Map();
  for (const item of sorted) {
    if (!groups.has(item.owner)) groups.set(item.owner, []);
    groups.get(item.owner).push(item);
  }
  return [...groups].map(([owner, items]) => ({ owner, items }));
}

export function summarize(items) {
  const open = items.filter(isOpen);
  return {
    // 긴급 = 지연(필요일 지남) + 2일 이내. riskOf의 late·high와 같은 기준.
    urgent: open.filter((x) => x.left <= 2).length,
    dueWeek: open.filter((x) => x.left <= 7).length,
    needsFix: open.filter((x) => x.status === 'fix').length,
    open: open.length,
    total: items.length,
  };
}

/** '1일 남음' / '오늘' / '2일 지남' */
export function leftText(left) {
  if (left === 0) return '오늘';
  return left > 0 ? `${left}일 남음` : `${-left}일 지남`;
}

/** 대시보드 상단의 1순위 안내 문구 */
export function insight(top, mode) {
  const quoted = `‘${top.name}’${josa(top.name, '이', '가')}`;
  const sub = `필요일 ${formatMD(top.neededOn)} · ${leftText(top.left)}`;

  if (mode === 'elapsed') {
    return {
      eyebrow: '요청 경과 기준 1순위',
      title: `요청 후 ${top.elapsed}일 지난 ${quoted} 가장 오래됐어요.`,
      sub,
    };
  }

  let when;
  if (top.left < 0) when = `필요일이 ${-top.left}일 지난`;
  else if (top.left === 0) when = '오늘 필요한';
  else if (top.left === 1) when = '내일 필요한';
  else when = `${top.left}일 뒤 필요한`;

  return {
    eyebrow: '감사 일정 기준 1순위',
    title: `${when} ${quoted} 가장 급해요.`,
    sub,
  };
}
