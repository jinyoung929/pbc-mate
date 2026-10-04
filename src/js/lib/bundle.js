// 3. 묶음 독촉: 같은 담당자의 남은 자료를 메일 한 통으로

import { formatMD, formatMDW } from './dates.js';
import { withDays, sortItems } from './priority.js';
import { recommendTone, toneIndex } from './tone.js';
import { clientShortName, replyBy, scheduleReason } from './mail.js';

/**
 * 묶음 대상: 같은 담당자 + 완료·보완 요청이 아닌 자료 (일부 수령은 남은 자료가 있어 포함).
 * 보완 요청은 사유가 달라 4번 보완 요청 화면에서 따로 다룬다.
 * 정렬은 대시보드 필요일순과 같은 규칙(같은 필요일이면 오래 기다린 순).
 */
export function isBundleEligible(item) {
  return item.status !== 'done' && item.status !== 'fix' && item.status !== 'follow';
}

export function bundleItems(items, owner, today) {
  const eligible = items
    .filter((x) => x.owner === owner && isBundleEligible(x))
    .map((x) => withDays(x, today));
  return sortItems(eligible, 'need');
}

/**
 * 묶음 메일 톤 = 가장 급한(첫 번째) 자료의 추천 톤.
 * 여러 건을 한 번에 다시 요청하는 메일이라 최소 '정중'으로 쓴다. (단호·매니저 참조는 그대로)
 */
export function bundleTone(sorted) {
  const tone = recommendTone(sorted[0]);
  return toneIndex(tone) < toneIndex('polite') ? 'polite' : tone;
}

const STATUS_IN_MAIL = {
  none: '아직 받지 못했습니다',
  part: '일부 수령, 나머지 필요',
};

/**
 * @param sorted bundleItems() 결과 (2건 이상)
 * @returns {{ subject, to, cc, intro, rows, outro }}
 *   intro·outro는 단건 메일과 같은 segment 배열, rows는 번호 목록
 */
export function buildBundleMail({ sorted, person = {}, client, manager, tone }) {
  const top = sorted[0];
  const proc = `${top.procedure || '관련 감사'} 절차`;
  const by = replyBy(top.left, top.neededOn);
  const why = scheduleReason(tone, top.left, top.neededOn, proc);
  const prefix = `[${clientShortName(client.name)} 감사]`;
  const count = sorted.length;

  const field = (text) => ({ kind: 'field', text });
  const plain = (text) => ({ kind: 'plain', text });

  const subject = tone === 'cc'
    ? `${prefix} 요청 자료 ${count}건 일정 협의 요청`
    : `${prefix} 요청 자료 ${count}건 진행 상황 정리 (${formatMD(top.neededOn)} 필요 자료 포함)`;

  const intro = [
    field(`${top.owner}님`),
    plain(tone === 'angel'
      ? ', 안녕하세요. 바쁘신 와중에 연락드려 죄송합니다.\n요청드린 자료 진행 상황을 한 번에 정리해 드립니다.'
      : ', 안녕하세요.\n요청드린 자료 진행 상황을 한 번에 정리해 드립니다.'),
  ];

  const rows = sorted.map((x, i) => ({
    no: i + 1,
    name: x.name,
    status: STATUS_IN_MAIL[x.status],
    need: `${formatMDW(x.neededOn)}${x.left < 0 ? ' · 지남' : ''}`,
    isTop: i === 0,
  }));

  const ask = [plain('가장 급한 '), field(top.name), plain('부터 부탁드립니다. '), ...why];
  const closing = {
    angel: `, 가능하시면 ${by.soft} 보내주시면 감사하겠습니다.`,
    polite: `, ${by.soft} 보내주시면 큰 도움이 되겠습니다.`,
    firm: `, ${by.firm} 보내주시기 바랍니다. 일정이 어려우시면 가능한 날짜를 함께 알려주세요.`,
    cc: ` 아직 확인되지 않은 자료가 있어, 일정 협의를 위해 매니저님을 참조로 함께 드립니다. ${by.soft} 진행 상황을 알려주시면 감사하겠습니다.`,
  }[tone];

  return {
    subject,
    to: { name: top.owner, dept: person.dept || '' },
    cc: tone === 'cc' ? (manager || { name: '[매니저]', dept: '' }) : null,
    intro,
    rows,
    outro: [...ask, plain(`${closing}\n\n감사합니다.\n[이름] 드림`)],
  };
}

const joinText = (segments) => segments.map((s) => s.text).join('');

/** 클립보드용 텍스트. 표 대신 번호 목록으로 쓴다. */
export function bundleMailToText(mail) {
  const head = [`제목: ${mail.subject}`, `받는 사람: ${mail.to.name}`];
  if (mail.cc) head.push(`참조: ${mail.cc.name}`);
  const list = mail.rows.map((r) =>
    `${r.no}. ${r.name} — ${r.status}${r.isTop ? ' (가장 급함)' : ''} · 필요일 ${r.need}`);
  return `${head.join('\n')}\n\n${joinText(mail.intro)}\n\n${list.join('\n')}\n\n${joinText(mail.outro)}`;
}
