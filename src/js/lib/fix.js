// 4. 보완 요청: 받은 자료에 문제가 있을 때, 사유에 맞는 재요청 메일
// 톤은 항상 정중. 복사해도 상태는 '보완 요청' 그대로 둔다.

import { daysBetween, formatMD } from './dates.js';
import { josa } from './korean.js';
import { clientShortName } from './mail.js';
import { termsOf } from './terms.js';

export const FIX_REASONS = [
  { key: 'date', label: '기준일 상이', hint: '다른 기준일 자료가 옴' },
  { key: 'sign', label: '서명 누락', hint: '확인·승인 서명이 없음' },
  { key: 'missing', label: '일부 항목 누락', hint: '요청 범위 중 일부가 빠짐' },
  { key: 'file', label: '파일 오류', hint: '열리지 않거나 깨짐' },
];

// 자료에 세부 항목이 없을 때 쓰는 기본값
const DEFAULT_DETAIL = {
  sign: '확인·승인란',
  missing: '요청 범위 중 일부 항목',
};

export function fixReasonLabel(key) {
  return FIX_REASONS.find((r) => r.key === key)?.label ?? key;
}

/** 보완 요청 화면은 상태가 '보완 요청'인 자료만 연다. */
export function canOpenFix(item) {
  return Boolean(item) && item.status === 'fix';
}

/** 화면을 열 때 선택돼 있을 사유: 자료에 저장된 현재 사유, 없으면 기준일 상이 */
export function currentFixReason(item) {
  return item.fix?.reason || 'date';
}

export function fixDetail(item, reason) {
  return item.fix?.details?.[reason] || DEFAULT_DETAIL[reason] || '';
}

/** 대시보드 행에 보이는 한 줄 요약 (item.reason) */
export function fixSummary(item, reason) {
  switch (reason) {
    case 'date': {
      const required = item.fix?.requiredBasisDate;
      return `기준일 상이 · ${required ? `${formatMD(required)} 기준 ` : ''}재요청 필요`;
    }
    case 'sign': return '서명 누락 · 서명본 재요청 필요';
    case 'missing': return '일부 항목 누락 · 누락 항목 추가 요청';
    default: return '파일 오류 · 파일 재전송 요청';
  }
}

/**
 * @returns {{ subject, to: {name, dept}, segments }}
 * segments 형식은 단건 독촉 메일과 같다 (field / reason / plain).
 */
export function buildFixMail({ item, person = {}, client, today, reason }) {
  const field = (text) => ({ kind: 'field', text });
  const why = (text) => ({ kind: 'reason', text });
  const plain = (text) => ({ kind: 'plain', text });

  const left = daysBetween(today, item.neededOn);
  const need = formatMD(item.neededOn);
  const t = termsOf(client.service);
  const proc = `${item.procedure || t.defaultProcedure} 절차`;
  const prefix = `[${clientShortName(client.name)} ${t.mailTag}] ${item.name}`;
  const detail = fixDetail(item, reason);

  let subject;
  let problem;
  if (reason === 'date') {
    const received = item.received?.basisDate;
    const required = item.fix?.requiredBasisDate;
    const yearEnd = required?.endsWith('-12-31');
    subject = `${prefix} 재요청 — 기준일 확인 부탁드립니다`;
    problem = [
      plain('기준일이 '), field(received ? formatMD(received) : '다른 날짜'), plain('로 되어 있어, '),
      plain(yearEnd ? '결산 기준일(' : '요청드린 기준일('), field(required ? formatMD(required) : '요청 기준일'),
      plain(') 자료로 다시 부탁드립니다. '),
    ];
  } else if (reason === 'sign') {
    subject = `${prefix} 재요청 — 서명본 부탁드립니다`;
    problem = [
      field(detail), plain('에 서명 또는 날인이 빠져 있어, 서명(날인)된 본으로 다시 부탁드립니다. 스캔본도 괜찮습니다. '),
    ];
  } else if (reason === 'missing') {
    subject = `${prefix} — 누락 항목 추가 요청`;
    problem = [
      field(detail), plain(`${josa(detail, '이', '가')} 빠져 있어, 해당 부분만 추가로 부탁드립니다. `),
    ];
  } else {
    subject = `${prefix} — 파일 재전송 요청`;
    problem = [
      plain('첨부해 주신 파일이 '), field('열리지 않거나 내용이 깨져 보여'),
      plain(' 확인이 어렵습니다. 번거로우시겠지만 파일을 한 번 더 보내주실 수 있을까요? '),
    ];
  }

  const schedule = left < 0
    ? [why(`${t.schedule}상 ${proc}를 `), field(need), why('부터 사용할 예정이었어서'), plain(', 가능한 한 빨리 부탁드립니다.')]
    : [why(`${t.schedule}상 ${proc}를 `), field(need), why('에 시작해야 해서'), plain(', '), field(need), plain('까지 필요합니다.')];

  return {
    subject,
    to: { name: item.owner, dept: person.dept || '' },
    segments: [
      field(`${item.owner}님`), plain(', 안녕하세요.\n\n보내주신 '), field(item.name), plain(' 잘 받았습니다. 다만 '),
      ...problem,
      ...schedule,
      plain('\n\n감사합니다.\n[이름] 드림'),
    ],
  };
}

/** 클립보드용: 제목 / 받는 사람 / 본문 */
export function fixMailToText(mail) {
  const body = mail.segments.map((s) => s.text).join('');
  return `제목: ${mail.subject}\n받는 사람: ${mail.to.name}\n\n${body}`;
}
