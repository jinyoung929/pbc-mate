// PBC 요청서 표준 양식: 자료를 요청할 때 기준일과 필수 컬럼을 고정해 보내고,
// 받은 자료를 같은 기준으로 점검해 보완 요청(기준일 상이·항목 누락·서명 누락)을 바로 잡는다.
// 양식은 일반적인 구성이다(법인 실무 양식으로 바꿀 수 있게 이 파일 한 곳에 모아 둔다).

import { formatMD } from './dates.js';

export const PBC_TEMPLATES = {
  ppe: {
    key: 'ppe', name: '유형자산 증감내역', procedure: '유형자산 실증',
    columns: ['계정과목', '기초', '취득', '처분', '대체', '감가상각비', '기말'],
    example: ['건물', '1,200,000,000', '0', '0', '0', '40,000,000', '1,160,000,000'],
    checks: ['기말 합계가 시산표 유형자산 잔액과 일치', '기초가 전기말 감사받은 잔액과 일치', '건설중인자산 대체 내역 포함'],
    sign: '담당 임원 확인란',
  },
  inventory: {
    key: 'inventory', name: '재고실사 결과표', procedure: '재고 실사 검토',
    columns: ['실사일', '창고', '품목코드', '품목명', '단위', '장부수량', '실사수량', '차이', '차이사유'],
    example: ['2026-12-31', '본사 1창고', 'P-1001', 'OLED 패널 A-15', 'EA', '12,400', '12,380', '-20', '파손 폐기'],
    checks: ['차이 합계가 재고 조정 분개와 일치', '제3자 보관 재고는 별도 표시'],
    sign: '실사 참여자 서명란',
  },
  related: {
    key: 'related', name: '특수관계자 거래내역', procedure: '특수관계자 검토',
    columns: ['특수관계자명', '관계', '거래유형', '거래금액', '기말 채권', '기말 채무'],
    example: ['㈜한빛홀딩스', '지배기업', '경영자문료', '360,000,000', '0', '30,000,000'],
    checks: ['전기 특수관계자 목록과 비교해 누락 없음', '주석 공시 금액과 일치'],
    sign: '담당 임원 확인란',
  },
  aging: {
    key: 'aging', name: '매출채권 연령분석표', procedure: '채권 평가',
    columns: ['거래처', '기말잔액', '30일 이내', '31~90일', '91~180일', '181~365일', '1년 초과', '대손충당금'],
    example: ['㈜대한부품', '842,000,000', '842,000,000', '0', '0', '0', '0', '0'],
    checks: ['기말잔액 합계가 매출채권 잔액과 일치', '1년 초과 채권의 대손 검토 근거'],
    sign: null,
  },
};

export const TEMPLATE_ORDER = ['ppe', 'inventory', 'related', 'aging'];

const norm = (s) => String(s ?? '').replace(/\s+/g, '');

/** 자료명으로 양식 찾기. '유형자산 증감내역(1분기)'처럼 뒤에 붙은 말이 있어도 찾는다. */
export function templateForName(name) {
  const n = norm(name);
  if (!n) return null;
  return TEMPLATE_ORDER.map((k) => PBC_TEMPLATES[k]).find((t) => n.startsWith(norm(t.name))) || null;
}

/** 자료의 양식: 저장된 키가 있으면 그것, 없으면 자료명으로. 외부조회 건은 대상이 아니다. */
export function templateOf(item) {
  if (!item || item.kind === 'confirmation') return null;
  return PBC_TEMPLATES[item.template] || templateForName(item.name);
}

/** 기준일 기본값: 외부조회서 공통 정보의 기준일, 없으면 그 해 결산일 */
export function defaultBasisDate(state, today) {
  return state?.confirmSetup?.baseDate || `${today.slice(0, 4)}-12-31`;
}

/**
 * 엑셀에 붙여넣을 표 (탭 구분). 1행 기준일 안내, 2행 컬럼, 3행 작성 예시.
 * 회사가 이 표에 그대로 채워 보내면 기준일·항목 누락이 줄어든다.
 */
export function requestSheetTsv(template, basisDate) {
  return [
    [`${template.name} · 기준일 ${basisDate}${template.sign ? ` · ${template.sign} 서명 필요` : ''}`],
    template.columns,
    template.example.map((v, i) => (i === 0 ? `(예시) ${v}` : v)),
  ].map((row) => row.join('\t')).join('\n');
}

/** 메일에 붙일 한 줄 안내 */
export function requestNote(template, basisDate) {
  const [, m, d] = basisDate.split('-').map(Number);
  return `${m}월 ${d}일 기준으로, ${template.columns.join(' · ')} 항목을 포함해 주세요.${template.sign ? ` ${template.sign}에 서명도 부탁드립니다.` : ''}`;
}

/**
 * 받은 자료 점검 → 상태 변경 추천.
 * check = { basisOk: true|false|null, missing: string[], signOk: true|false|null }
 *   null은 아직 확인 안 함. 기준일이 다르면 '기준일 상이'가 가장 먼저(다시 받아야 하므로).
 * @returns {{ status: 'done'|'fix'|null, reason?, requiredBasisDate?, detail?, summary }}
 *   status null: 점검을 다 하지 않음
 */
export function receiptSuggestion(template, check, basisDate) {
  const missing = check.missing || [];
  if (check.basisOk === false) {
    return { status: 'fix', reason: 'date', requiredBasisDate: basisDate,
      summary: `기준일이 ${formatMD(basisDate)}이 아니에요. 기준일 상이로 재요청해요.` };
  }
  if (missing.length) {
    return { status: 'fix', reason: 'missing', detail: missing.join(', '),
      summary: `${missing.join(', ')} 항목이 빠졌어요. 일부 항목 누락으로 재요청해요.` };
  }
  if (template.sign && check.signOk === false) {
    return { status: 'fix', reason: 'sign', detail: template.sign,
      summary: `${template.sign}에 서명이 없어요. 서명 누락으로 재요청해요.` };
  }
  const pending = check.basisOk == null || (template.sign && check.signOk == null);
  if (pending) return { status: null, summary: '기준일과 서명을 확인하면 상태를 추천해 드려요.' };
  return { status: 'done', summary: '양식대로 받았어요. 완료로 처리할 수 있어요.' };
}
