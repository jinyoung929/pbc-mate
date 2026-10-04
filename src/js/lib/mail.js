// 독촉 메일 문안 생성. 본문은 조각(segment) 배열로 만들어 화면에서 구분해 보여준다.
//   field  : 자료에서 자동으로 들어간 값 (이름, 날짜, 자료명)
//   reason : 왜 지금 필요한지 알려주는 일정 근거 문장
//   plain  : 그 외 문장

import { addDays, daysBetween, formatMD } from './dates.js';
import { josa } from './korean.js';
import { termsOf } from './terms.js';

const field = (text) => ({ kind: 'field', text });
const reason = (text) => ({ kind: 'reason', text });
const plain = (text) => ({ kind: 'plain', text });

/** '㈜한빛전자' → '한빛전자' */
export function clientShortName(name) {
  return name.replace(/㈜|\(주\)|주식회사/g, '').trim();
}

/** '2026-09-28' → '9월 28일' */
function longDate(iso) {
  const [, m, d] = iso.split('-').map(Number);
  return `${m}월 ${d}일`;
}

/** 필요일이 가까우면 '내일(10/2)'처럼, 멀면 '10월 20일' */
function relativeNeed(left, neededOn) {
  const md = formatMD(neededOn);
  if (left === 0) return `오늘(${md})`;
  if (left === 1) return `내일(${md})`;
  if (left === 2) return `모레(${md})`;
  return longDate(neededOn);
}

/** 회신 기한: 필요일이 3일 이내(또는 지남)면 오늘, 아니면 필요일 2일 전까지 */
export function replyBy(left, neededOn) {
  if (left <= 3) return { soft: '오늘 중', firm: '오늘 18시까지' };
  const by = `${formatMD(addDays(neededOn, -2))}까지`;
  return { soft: by, firm: by };
}

/** 일정 근거 문장. 필요일 전이면 '시작해야 해서', 지났으면 '늦어지고 있어서'. schedule: '감사 일정' 등 부서별 용어 */
export function scheduleReason(tone, left, neededOn, proc, schedule = '감사 일정') {
  const late = left < 0;
  const when = late || tone === 'angel' ? longDate(neededOn) : relativeNeed(left, neededOn);
  const ending = { polite: '해서', firm: '하므로', cc: '하는데' }[tone];
  const lateEnding = { polite: '있어서', firm: '있으므로', cc: '있는데' }[tone];

  const lead = `${schedule}상 `;
  if (tone === 'angel') {
    return late
      ? [reason(lead), field(when), reason(`부터 ${proc}에 사용할 예정이었어서`)]
      : [reason(lead), field(when), reason(`에 ${proc}를 시작할 예정이라`)];
  }
  return late
    ? [reason(lead), field(when), reason(`에 시작했어야 할 ${proc}가 늦어지고 ${lateEnding}`)]
    : [reason(lead), field(when), reason(` ${proc}를 시작해야 ${ending}`)];
}

/**
 * @returns {{ subject, to: {name, dept}, cc: {name, dept} | null, segments }}
 */
export function buildMail({ item, person = {}, client, manager, today, tone }) {
  const left = daysBetween(today, item.neededOn);
  const t = termsOf(client.service);
  const proc = `${item.procedure || t.defaultProcedure} 절차`;
  const by = replyBy(left, item.neededOn);
  const part = item.status === 'part';
  const prefix = `[${clientShortName(client.name)} ${t.mailTag}]`;

  const hello = [field(`${item.owner}님`)];
  const requested = [field(longDate(item.requestedOn)), plain(' 요청드린 '), field(item.name)];
  const why = scheduleReason(tone, left, item.neededOn, proc, t.schedule);

  let subject;
  let segments;

  if (tone === 'angel') {
    subject = `${prefix} ${item.name} 확인 부탁드립니다`;
    segments = [
      ...hello, plain(', 안녕하세요. 바쁘신 와중에 연락드려 죄송합니다.\n\n'),
      ...requested, plain(' 건이 어떻게 진행되고 있는지 여쭙고 싶습니다. '),
      ...why, plain(', 편하실 때 한 번 확인 부탁드리겠습니다.\n\n늘 도와주셔서 감사합니다.\n[이름] 드림'),
    ];
  } else if (tone === 'polite') {
    subject = `${prefix} ${item.name} 요청 (${formatMD(item.neededOn)} 필요)`;
    segments = [
      ...hello, plain(', 안녕하세요.\n\n'),
      ...requested, plain(' 건 확인 부탁드립니다. '),
      ...why, plain(`, ${by.soft} 회신 여부만이라도 알려주시면 큰 도움이 되겠습니다.\n\n감사합니다.\n[이름] 드림`),
    ];
  } else if (tone === 'firm') {
    subject = `${prefix} ${item.name} 요청 — ${by.firm}`;
    const status = part ? ' 중 아직 받지 못한 자료가 있습니다. ' : `${josa(item.name, '이', '가')} 아직 확인되지 않았습니다. `;
    segments = [
      ...hello, plain(', 안녕하세요.\n\n'),
      ...requested, plain(status),
      ...why, plain(`, ${by.firm} 회신 여부를 알려주시기 바랍니다. 일정이 어려우시면 가능한 날짜를 함께 알려주세요.\n\n감사합니다.\n[이름] 드림`),
    ];
  } else {
    subject = `${prefix} ${item.name} 일정 협의 요청`;
    segments = [
      ...hello, plain(', 안녕하세요.\n\n'),
      ...requested, plain(' 건으로 다시 연락드립니다. '),
      ...why, plain(` 아직 ${part ? '남은 자료가' : '회신이'} 확인되지 않았습니다. 일정 협의가 필요해 매니저님을 참조로 함께 드립니다.\n\n${by.soft} 진행 상황을 알려주시면 감사하겠습니다.\n[이름] 드림`),
    ];
  }

  return {
    subject,
    to: { name: item.owner, dept: person.dept || '' },
    cc: tone === 'cc' ? (manager || { name: '[매니저]', dept: '' }) : null,
    segments,
  };
}

export function mailBody(mail) {
  return mail.segments.map((s) => s.text).join('');
}

/** 클립보드에 넣을 텍스트. 아웃룩에서 제목·참조를 옮겨 적을 수 있게 맨 위에 둔다. */
export function mailToText(mail) {
  const head = [`제목: ${mail.subject}`, `받는 사람: ${mail.to.name}`];
  if (mail.cc) head.push(`참조: ${mail.cc.name}`);
  return `${head.join('\n')}\n\n${mailBody(mail)}`;
}
