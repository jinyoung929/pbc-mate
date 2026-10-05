// 앱 데이터를 localStorage에 저장한다.
//
// state = {
//   demoDate?: 'YYYY-MM-DD',   // 예시 자료일 때만. 이 날짜를 오늘로 보고 계산한다.
//   client: { name, engagement },
//   team:   { manager: { name, dept }, members: [], me }, // 매니저 참조 메일의 CC · 감사팀원 · 지금 쓰는 사람 (lib/team.js)
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

/**
 * 심사·데모에서 첫 화면이 항상 같도록 예시 자료는 이 날짜 기준으로 고정한다.
 * 2026 기말감사의 현장 감사 기간(결산일 12/31 이후 1월)으로 잡아, 12/31 기준 외부조회·자료 요청과 날짜가 맞는다.
 */
export const DEMO_DATE = '2027-01-14';

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

/** 예시 첨부 파일 (load-sample 때 브라우저 저장소에 만든다). 내용은 예시 안내 문구뿐이다. */
export const SAMPLE_FILES = [
  { id: 'sample-f1', name: '바다저축은행_은행조회서_회신_BK-002.png', itemId: 'c2' },
  { id: 'sample-f2', name: '한결물류_재고보관_조회회신_IV-001.png', itemId: 'c7' },
  { id: 'sample-f3', name: '2025_법인세_과세표준및세액신고서_사본.png', itemId: 'i6' },
];

/**
 * 예전 버전에서 불러온 예시 자료의 첨부 정보(이름·형식)를 지금 예시로 맞춘다.
 * 직접 올린 파일은 건드리지 않는다. 바뀐 첨부 id를 함께 돌려줘 저장된 파일 내용도 다시 만들게 한다.
 * @returns {{ state, changed: string[] }}
 */
export function upgradeSampleAttachments(state) {
  if (!state?.items) return { state, changed: [] };
  const current = new Map(sampleState().items.flatMap((x) => x.attachments || []).map((a) => [a.id, a]));
  const changed = [];
  const items = state.items.map((x) => {
    if (!x.attachments?.some((a) => current.has(a.id) && current.get(a.id).name !== a.name)) return x;
    return { ...x, attachments: x.attachments.map((a) => {
      const now = current.get(a.id);
      if (!now || now.name === a.name) return a;
      changed.push(a.id);
      return { ...a, name: now.name, size: now.size, type: now.type };
    }) };
  });
  return changed.length ? { state: { ...state, items }, changed } : { state, changed };
}

/**
 * 예시 자료. 시연 기준일(DEMO_DATE, 2027-01-14 목) 기준 상대 날짜로 만든다.
 * 기능마다 보여줄 장면이 하나씩 있도록 구성했다.
 *   PBC 6건  : 미회신·독촉 중(재고실사) / 묶음 독촉(김민지 대리 3건) / 일부 수령(특수관계자) /
 *              보완 요청-기준일 상이(유형자산) / 완료+첨부(법인세) / 후속 절차에서 만든 증빙 요청(지급 내역)
 *              4건은 표준 양식(template·basisDate)으로 요청
 *   외부조회 8건: 은행 2(미회신·회수 완료) / 채권채무 4(기한 지남·미회수 대체적 절차·금액 차이 조정 중·조정 완료+서명) /
 *              변호사 1(미회신) / 제3자보관재고 1(회수 완료+첨부)
 *   커버리지: 미확인 잔액 약 4.8억원 > 수행중요성 1.8억원 → 주간 보고에서 경고가 보인다
 *   팀: 장재혁(나)·김서윤 실무진이 나눠 요청, 이서연 매니저는 요청하지 않고 전체를 본다 (첫 화면 조회의 ㈜한빛전자 2026 기말감사와 같다)
 *   필요일은 타임라인 박스가 겹치지 않게 며칠씩 띄워 두었다.
 */
export function sampleState() {
  const d = (n) => addDays(DEMO_DATE, n);
  const ME = '장재혁 회계사';
  const KIM = '김서윤 회계사';
  const LEE = '이서연 매니저';
  return {
    demoDate: DEMO_DATE,
    client: { name: '㈜한빛전자', engagement: '2026 기말감사' },
    team: { manager: { name: LEE, dept: '감사팀' }, members: [ME, KIM, LEE], me: ME },
    people: {
      '박준호 과장': { dept: '재무팀', nudges: 0, lastNudgedOn: null },
      '김민지 대리': { dept: '재무팀', nudges: 2, lastNudgedOn: d(-2) },
      '최도윤 차장': { dept: '관리팀', nudges: 1, lastNudgedOn: d(-5) },
      '한빛은행 여의도지점': { dept: '금융기관', nudges: 1, lastNudgedOn: d(-1) },
      '바다저축은행 본점': { dept: '금융기관', nudges: 0, lastNudgedOn: null },
      '세진물산㈜': { dept: '거래처', nudges: 2, lastNudgedOn: d(-1) },
      '㈜오성테크': { dept: '거래처', nudges: 3, lastNudgedOn: d(-2) },
      '㈜대한부품': { dept: '거래처', nudges: 1, lastNudgedOn: d(-4) },
      '한성정밀㈜': { dept: '거래처', nudges: 0, lastNudgedOn: null },
      '법무법인 정의': { dept: '법무법인', nudges: 0, lastNudgedOn: null },
      '㈜한결물류 평택센터': { dept: '보관처', nudges: 0, lastNudgedOn: null },
    },
    // 회사 단위 중요성. 예시 회사는 매출 약 500억원을 가정해 전체 중요성 0.5%, 수행중요성은 그 약 75%.
    materiality: { overall: 250000000, performance: 180000000, basis: '매출 약 500억원 가정 · 전체 중요성 0.5% · 수행중요성 약 75%' },
    confirmSetup: {
      companyName: '㈜한빛전자', ceoName: '정한빛', companyAddress: '경기도 성남시 분당구 판교역로 1',
      auditorName: '삼일회계법인', auditorAddress: '서울특별시 용산구 한강대로 100 아모레퍼시픽빌딩',
      contactName: ME, contactPhone: '02-0000-0000', contactEmail: '',
      baseDate: '2026-12-31',
    },
    events: [
      // by: 만든 감사인 (일정 탭은 회계사마다 자기 일정만, 매니저는 전체). by가 없으면 팀 공통 일정
      { id: 'e1', title: '재고실사 차이 원인 회사 미팅', date: d(-3), progress: 'done', by: ME },
      { id: 'e2', title: '외부조회 회신 현황 매니저 리뷰', date: d(1), progress: 'planned' },
      { id: 'e3', title: '채권 평가 조서 작성', date: d(18), progress: 'planned', by: ME },
      { id: 'e4', title: '유형자산 재요청 자료 확인', date: d(2), progress: 'planned', by: KIM },
    ],
    items: [
      { id: 'i2', requester: KIM, name: '유형자산 증감내역', owner: '최도윤 차장', requestedOn: d(-9), neededOn: d(12), status: 'fix',
        reason: '기준일 상이 · 12/31 기준 재요청 필요', procedure: '유형자산 실증', template: 'ppe', basisDate: '2026-12-31',
        nudges: [{ on: d(-5), tone: 'polite' }],
        received: { on: d(-3), basisDate: '2026-06-30' },
        fix: { reason: 'date', requiredBasisDate: '2026-12-31', details: { sign: '담당 임원 확인란', missing: '건설중인자산 대체 내역' } },
        fixes: [{ on: d(-3), reason: 'date' }] },
      { id: 'i3', requester: ME, name: '재고실사 결과표', owner: '김민지 대리', requestedOn: d(-6), neededOn: d(8), status: 'none',
        procedure: '재고 실사 검토', template: 'inventory', basisDate: '2026-12-31', nudges: [{ on: d(-2), tone: 'polite' }] },
      { id: 'i4', requester: KIM, name: '특수관계자 거래내역', owner: '김민지 대리', requestedOn: d(-10), neededOn: d(16), status: 'part',
        procedure: '특수관계자 검토', template: 'related', basisDate: '2026-12-31',
        nudges: [{ on: d(-6), tone: 'angel' }, { on: d(-2), tone: 'polite' }], received: { on: d(-4) } },
      { id: 'i5', requester: ME, name: '매출채권 연령분석표', owner: '김민지 대리', requestedOn: d(-11), neededOn: d(20), status: 'none',
        procedure: '채권 평가', template: 'aging', basisDate: '2026-12-31',
        nudges: [{ on: d(-6), tone: 'angel' }, { on: d(-2), tone: 'polite' }] },
      { id: 'i6', requester: KIM, name: '법인세 신고서 사본', owner: '박준호 과장', requestedOn: d(-8), neededOn: d(-1), status: 'done',
        procedure: '법인세 검토', nudges: [], received: { on: d(-6) },
        attachments: [{ id: 'sample-f3', name: '2025_법인세_과세표준및세액신고서_사본.png', size: 572000, type: 'image/png', addedOn: d(-6) }] },
      // ㈜오성테크 미회수 → 대체적 절차 증빙으로 만든 자료 요청 (후속 절차와 PBC가 이어지는 장면)
      { id: 'i7', requester: KIM, name: '기준일 이후 지급 내역(통장 사본) (㈜오성테크)', owner: '박준호 과장', requestedOn: d(-1), neededOn: d(5), status: 'none',
        procedure: '외부조회 대체적 절차', nudges: [], sourceId: 'c5' },
      ...sampleConfirmations(d, { ME, KIM, LEE }),
    ],
  };
}

/** 예시 외부조회 건. 발송일 = 요청일(대부분 1/4 월), 회신 기한 = 필요일. */
function sampleConfirmations(d, { ME, KIM, LEE }) { // LEE: 매니저 (요청 감사인 아님, 서명 검토자)
  const conf = (id, confType, docNo, counterparty, extra) => {
    const label = { bank: '은행조회서', arap: '채권채무조회서', legal: '변호사조회서', inventory: '제3자보관재고자산조회서' }[confType];
    return {
      id, kind: 'confirmation', confType, docNo, name: `${label} (${counterparty})`, owner: counterparty, counterparty,
      baseDate: '2026-12-31', procedure: '외부조회', blank: false, nudges: [],
      track: { bank: 'required', legal: 'general' }[confType] || 'coverage',
      ...extra,
    };
  };
  const SENT = d(-10);
  return [
    // 은행: 금액과 무관하게 회수해야 하는 1건이 아직 남음
    conf('c1', 'bank', 'BK-001', '한빛은행 여의도지점', { requester: ME,
      bookAmount: 4250000000, requestedOn: SENT, neededOn: d(4), status: 'none', nudges: [{ on: d(-1), tone: 'polite' }] }),
    conf('c2', 'bank', 'BK-002', '바다저축은행 본점', { requester: ME,
      bookAmount: 500000000, requestedOn: SENT, neededOn: d(4), status: 'done', received: { on: d(-3) },
      attachments: [{ id: 'sample-f1', name: '바다저축은행_은행조회서_회신_BK-002.png', size: 632000, type: 'image/png', addedOn: d(-3) }] }),
    // 채권채무: 기한 지남 · 미회수 대체적 절차 · 금액 차이 조정 중 · 조정 완료(서명)
    conf('c4', 'arap', 'AR-002', '세진물산㈜', { requester: ME,
      receivable: 315500000, payable: 120000000, bookAmount: 435500000, requestedOn: SENT, neededOn: d(-2), status: 'none',
      nudges: [{ on: d(-6), tone: 'polite' }, { on: d(-1), tone: 'firm' }] }),
    conf('c5', 'arap', 'AR-003', '㈜오성테크', { requester: KIM,
      receivable: 0, payable: 96300000, bookAmount: 96300000, blank: true, requestedOn: SENT, neededOn: d(-1), status: 'follow',
      nudges: [{ on: d(-7), tone: 'polite' }, { on: d(-4), tone: 'firm' }, { on: d(-2), tone: 'cc' }],
      follow: { type: 'noreply', startedOn: d(-1), requested: ['subsequentPay'], steps: { subsequentPay: true }, verified: 60000000 } }),
    conf('c3', 'arap', 'AR-001', '㈜대한부품', { requester: ME,
      receivable: 842000000, payable: 0, bookAmount: 842000000, requestedOn: SENT, neededOn: d(9), status: 'follow',
      nudges: [{ on: d(-4), tone: 'polite' }], received: { on: d(-1) },
      // 송금 중 300만원이 아직 설명되지 않았고, 미착품은 인도조건 확인 전 → 시연에서 채워 완료하는 장면
      follow: { type: 'diff', startedOn: d(-1), requested: [],
        recon: { book: 842000000, confirmed: 830000000, lines: [{ cause: 'goods', amount: 9000000, note: '12/29 출고 · 1/2 거래처 입고분' }] } } }),
    conf('c8', 'arap', 'AR-004', '한성정밀㈜', { requester: ME,
      receivable: 512000000, payable: 0, bookAmount: 512000000, requestedOn: SENT, neededOn: d(7), status: 'done', received: { on: d(-5) },
      follow: { type: 'diff', startedOn: d(-5), closedOn: d(-1), requested: [],
        recon: { book: 512000000, confirmed: 505000000, lines: [{ cause: 'cash', amount: 7000000, note: '12/31 송금 · 1/2 입금' }] },
        conclusion: '차이 7,000,000원은 시점 차이·조회처 오류로 모두 설명돼요. 왜곡표시는 없어요.',
        signoff: { preparer: ME, reviewer: LEE } } }),
    // 변호사: 일반 조회 · 미회신
    conf('c6', 'legal', 'LG-001', '법무법인 정의', { requester: KIM, requestedOn: SENT, neededOn: d(13), status: 'none' }),
    // 제3자 보관 재고: 회수 완료
    conf('c7', 'inventory', 'IV-001', '㈜한결물류 평택센터', { requester: KIM,
      bookAmount: 1913000000, requestedOn: SENT, neededOn: d(6), status: 'done', received: { on: d(-2) },
      attachments: [{ id: 'sample-f2', name: '한결물류_재고보관_조회회신_IV-001.png', size: 617000, type: 'image/png', addedOn: d(-2) }] }),
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
export function createEmptyState({ clientName, engagement, team }) {
  return {
    client: { name: String(clientName).trim(), engagement: String(engagement).trim() },
    team: team || { manager: null },
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
