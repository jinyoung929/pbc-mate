// 앱 데이터를 localStorage에 저장한다.
//
// state = {
//   demoDate?: 'YYYY-MM-DD',   // 예시 자료일 때만. 이 날짜를 오늘로 보고 계산한다.
//   client: { name, engagement, service? },           // service: audit | tax | deal | advisory (없으면 audit)
//   team:   { manager: { name, dept } },              // 매니저 참조 메일의 CC
//   people: { [이름]: { dept, nudges, lastNudgedOn } },
//   items:  [{ id, name, owner, requestedOn, neededOn, status, reason?,
//              procedure?,                           // 이 자료를 쓰는 감사 절차
//              nudges?: [{ on, tone }],               // 독촉 이력
//              received?: { on, basisDate? },         // 받은 자료 (보완 요청 자료)
//              fix?: { reason, requiredBasisDate?, details? },  // 현재 보완 사유
//              fixes?: [{ on, reason }] }]            // 보완 요청 이력
// }
// status: 'none'(미회신) | 'part'(일부 수령) | 'fix'(보완 요청) | 'done'(완료)

import { addDays } from './lib/dates.js';
import { fixSummary } from './lib/fix.js';
import { transitionItem } from './lib/status.js';

const KEY = 'pbc-mate:v1';

/** 심사·데모에서 첫 화면이 항상 같도록 예시 자료는 이 날짜 기준으로 고정한다. */
export const DEMO_DATE = '2026-10-01';

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // 저장이 막힌 환경(시크릿 모드 등)에서도 화면은 계속 동작하게 둔다.
  }
}

export function clear() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}

/**
 * 계산 기준일: ?today= 값 > 예시 자료의 시연 기준일 > 실제 오늘.
 * 직접 넣은 자료는 실제 날짜로 계산된다.
 */
export function baseDateOf(state, override, realToday) {
  return override || state?.demoDate || realToday;
}

/**
 * 예시 자료. 시연 기준일(DEMO_DATE) 기준 상대 날짜로 만든다.
 * PBC 자료 5건(4건은 표준 양식으로 요청, template·basisDate) + 외부조회 7건(kind: 'confirmation'). 외부조회는 조회처가 담당자(owner)이고,
 * 미회신·독촉 중·회신 기한 지남·회신 완료·후속 절차(미회수 확정, 금액 차이)가 고루 보이게 넣었다.
 * confirmSetup은 외부조회서 작성 화면의 공통 정보 기본값이다 (결산일 12/31 기준).
 */
export function sampleState() {
  const d = (n) => addDays(DEMO_DATE, n);
  return {
    demoDate: DEMO_DATE,
    client: { name: '㈜한빛전자', engagement: '2026 기말감사', service: 'audit' },
    team: { manager: { name: '이서연 매니저', dept: '감사팀' } },
    people: {
      '박준호 과장': { dept: '재무팀', nudges: 0, lastNudgedOn: null },
      '김민지 대리': { dept: '재무팀', nudges: 2, lastNudgedOn: d(-2) },
      '최도윤 차장': { dept: '관리팀', nudges: 2, lastNudgedOn: d(-5) },
      '한빛은행 여의도지점': { dept: '금융기관', nudges: 1, lastNudgedOn: d(-2) },
      '바다저축은행 본점': { dept: '금융기관', nudges: 0, lastNudgedOn: null },
      '㈜대한부품': { dept: '거래처', nudges: 1, lastNudgedOn: d(-4) },
      '세진물산㈜': { dept: '거래처', nudges: 2, lastNudgedOn: d(-2) },
      '㈜오성테크': { dept: '거래처', nudges: 3, lastNudgedOn: d(-1) },
      '법무법인 정의': { dept: '법무법인', nudges: 0, lastNudgedOn: null },
      '㈜한결물류 평택센터': { dept: '보관처', nudges: 0, lastNudgedOn: null },
    },
    // 회사 단위 중요성. 예시 회사는 매출 약 500억원을 가정해 전체 중요성 0.5%, 수행중요성은 그 약 75%.
    materiality: { overall: 250000000, performance: 180000000, basis: '매출 약 500억원 가정 · 전체 중요성 0.5% · 수행중요성 약 75%' },
    confirmSetup: {
      companyName: '㈜한빛전자', ceoName: '정한빛', companyAddress: '경기도 성남시 분당구 판교역로 1',
      auditorName: '삼일회계법인', auditorAddress: '서울특별시 용산구 한강대로 100 아모레퍼시픽빌딩',
      contactName: '이서연 매니저', contactPhone: '02-0000-0000', contactEmail: '',
      baseDate: '2026-12-31',
    },
    items: [
      { id: 'i2', name: '유형자산 증감내역', owner: '최도윤 차장', requestedOn: d(-1), neededOn: d(7), status: 'fix', reason: '기준일 상이 · 12/31 기준 재요청 필요',
        procedure: '유형자산 실증', nudges: [], template: 'ppe', basisDate: '2026-12-31',
        received: { on: d(-1), basisDate: '2026-06-30' },
        fix: { reason: 'date', requiredBasisDate: '2026-12-31',
               details: { sign: '담당 임원 확인란', missing: '건설중인자산 대체 내역' } },
        fixes: [{ on: d(-1), reason: 'date' }] },
      { id: 'i3', name: '재고실사 결과표', owner: '김민지 대리', requestedOn: d(-5), neededOn: d(5), status: 'none',
        procedure: '재고 실사 검토', nudges: [{ on: d(-2), tone: 'polite' }], template: 'inventory', basisDate: '2026-12-31' },
      { id: 'i4', name: '특수관계자 거래내역', owner: '김민지 대리', requestedOn: d(-9), neededOn: d(9), status: 'part',
        procedure: '특수관계자 검토', nudges: [{ on: d(-6), tone: 'angel' }, { on: d(-2), tone: 'polite' }], template: 'related', basisDate: '2026-12-31' },
      { id: 'i5', name: '매출채권 연령분석표', owner: '김민지 대리', requestedOn: d(-11), neededOn: d(19), status: 'none',
        procedure: '채권 평가', nudges: [{ on: d(-6), tone: 'angel' }, { on: d(-2), tone: 'polite' }], template: 'aging', basisDate: '2026-12-31' },
      { id: 'i6', name: '법인세 신고서 사본', owner: '박준호 과장', requestedOn: d(-6), neededOn: d(3), status: 'done',
        procedure: '법인세 검토', nudges: [] },
      ...sampleConfirmations(d),
    ],
  };
}

/** 예시 외부조회 건. 발송일 = 요청일, 회신 기한 = 필요일. */
function sampleConfirmations(d) {
  const conf = (id, confType, docNo, counterparty, extra) => {
    const label = { bank: '은행조회서', arap: '채권채무조회서', legal: '변호사조회서', inventory: '제3자보관재고자산조회서' }[confType];
    return {
      id, kind: 'confirmation', confType, docNo, name: `${label} (${counterparty})`, owner: counterparty, counterparty,
      baseDate: '2026-12-31', procedure: '외부조회', blank: false, nudges: [],
      track: { bank: 'required', legal: 'general' }[confType] || 'coverage',
      ...extra,
    };
  };
  return [
    conf('c1', 'bank', 'BK-001', '한빛은행 여의도지점', {
      bookAmount: 4250000000, requestedOn: d(-9), neededOn: d(2), status: 'none',
      nudges: [{ on: d(-2), tone: 'polite' }] }),
    conf('c2', 'bank', 'BK-002', '바다저축은행 본점', {
      bookAmount: 500000000, requestedOn: d(-9), neededOn: d(2), status: 'done', received: { on: d(-3) } }),
    conf('c3', 'arap', 'AR-001', '㈜대한부품', {
      receivable: 842000000, payable: 0, bookAmount: 842000000, requestedOn: d(-9), neededOn: d(2), status: 'follow',
      nudges: [{ on: d(-4), tone: 'polite' }], received: { on: d(-1) },
      follow: { type: 'diff', startedOn: d(-1), requested: [],
        recon: { book: 842000000, confirmed: 830000000, lines: [{ cause: 'goods', amount: 9000000, note: '12/29 출고 · 1/2 거래처 입고분' }] } } }),
    conf('c4', 'arap', 'AR-002', '세진물산㈜', {
      receivable: 315500000, payable: 120000000, bookAmount: 435500000, requestedOn: d(-16), neededOn: d(-2), status: 'none',
      nudges: [{ on: d(-6), tone: 'polite' }, { on: d(-2), tone: 'firm' }] }),
    conf('c5', 'arap', 'AR-003', '㈜오성테크', {
      receivable: 0, payable: 96300000, bookAmount: 96300000, blank: true, requestedOn: d(-16), neededOn: d(-2), status: 'follow',
      nudges: [{ on: d(-9), tone: 'polite' }, { on: d(-5), tone: 'firm' }, { on: d(-1), tone: 'cc' }],
      follow: { type: 'noreply', startedOn: d(0), requested: [], steps: { subsequentPay: true }, verified: 60000000 } }),
    conf('c6', 'legal', 'LG-001', '법무법인 정의', { requestedOn: d(-9), neededOn: d(5), status: 'none' }),
    conf('c7', 'inventory', 'IV-001', '㈜한결물류 평택센터', {
      bookAmount: 1913000000, requestedOn: d(-9), neededOn: d(2), status: 'done', received: { on: d(-2) } }),
  ];
}

/**
 * 메일 한 통을 복사했을 때 독촉 이력을 남긴다. 원래 state는 바꾸지 않고 새 state를 돌려준다.
 * 메일에 담긴 자료마다 이력에 { on, tone }을 추가하고,
 * 담당자의 독촉 횟수는 메일 1통이므로 1만 올린다. (같은 담당자의 자료만 묶는다고 가정)
 */
export function recordNudges(state, itemIds, tone, on) {
  const ids = new Set(itemIds);
  const owner = state.items.find((x) => ids.has(x.id)).owner;
  const person = state.people[owner] || {};
  return {
    ...state,
    items: state.items.map((x) =>
      ids.has(x.id) ? { ...x, nudges: [...(x.nudges || []), { on, tone }] } : x),
    people: {
      ...state.people,
      [owner]: { ...person, nudges: (person.nudges || 0) + 1, lastNudgedOn: on },
    },
  };
}

export function recordNudge(state, itemId, tone, on) {
  return recordNudges(state, [itemId], tone, on);
}

/**
 * 보완 재요청 메일을 복사했을 때: 보완 이력 { on, reason }을 남기고 현재 사유를 갱신한다.
 * 상태는 바꾸지 않는다 (자료를 다시 받아 확인한 뒤 따로 완료 처리).
 */
export function recordFix(state, itemId, reason, on) {
  return {
    ...state,
    items: state.items.map((x) => (x.id !== itemId ? x : {
      ...x,
      fixes: [...(x.fixes || []), { on, reason }],
      fix: { ...x.fix, reason },
      reason: fixSummary(x, reason),
    })),
  };
}

// 메일 텍스트를 복사하고, 성공했을 때만 apply(state)로 이력을 남긴다.
// copy: (text) => Promise<boolean>. 실패하면 원래 state를 그대로 돌려준다.
async function copyThenApply(state, text, copy, apply) {
  const ok = await copy(text);
  return { ok, state: ok ? apply(state) : state };
}

export function copyAndRecord(state, { itemIds, tone, on, text }, copy) {
  return copyThenApply(state, text, copy, (s) => recordNudges(s, itemIds, tone, on));
}

export function copyAndRecordFix(state, { itemId, reason, on, text }, copy) {
  return copyThenApply(state, text, copy, (s) => recordFix(s, itemId, reason, on));
}

/**
 * 자료를 추가한다. values: validateItem()의 value 배열 [{ item, person }].
 * 담당자 이름이 기존과 같으면 같은 담당자로 묶이고(people 항목 재사용),
 * 새 담당자면 people에 추가한다. 부서는 기존 값이 없을 때만 채운다.
 */
export function addItems(state, values) {
  const people = { ...state.people };
  const items = [...state.items];
  const used = new Set(items.map((x) => x.id));
  let n = items.length + 1;
  for (const { item, person } of values) {
    while (used.has(`i${n}`)) n += 1;
    const id = `i${n}`;
    used.add(id);
    items.push({ id, ...item });
    const existing = people[person.owner];
    people[person.owner] = existing
      ? { ...existing, dept: existing.dept || person.dept || '' }
      : { dept: person.dept || '', nudges: 0, lastNudgedOn: null };
  }
  return { ...state, people, items };
}

/**
 * 예시 자료 없이 직접 시작할 때의 빈 state. demoDate가 없어 실제 오늘(또는 ?today=) 기준으로 계산된다.
 */
export function createEmptyState({ clientName, engagement, service = 'audit' }) {
  return {
    client: { name: String(clientName).trim(), engagement: String(engagement).trim(), service },
    team: { manager: null },
    people: {},
    items: [],
  };
}

/**
 * 자료 상태를 바꾼다 (transitionItem 규칙). 원래 state는 바꾸지 않는다.
 * change: { status, reason?, basisDate?, requiredBasisDate? }
 */
export function updateItemStatus(state, itemId, change, on) {
  return {
    ...state,
    items: state.items.map((x) => (x.id === itemId ? transitionItem(x, change, on) : x)),
  };
}
