// 외부조회 후속 절차: 회신 결과에 따라 갈라지는 두 갈래를 다룬다.
//   noreply : 최종 독촉 후에도 회신이 없어 '미회수'로 확정 → 조회서 종류별 대체적 절차 가이드
//   diff    : 회신은 왔지만 장부금액과 다름 → 차이 원인별 조정 기록과 결론
// (회신이 불완전한 경우 — 서명 누락·기준일 상이 등 — 는 기존 보완 요청(fix.js)을 그대로 쓴다.)
//
// 상태: 후속 절차가 시작되면 item.status = 'follow', 세부는 item.follow에 둔다.
//   follow = { type: 'noreply'|'diff', startedOn, steps?: { [key]: true }, verified?: number,
//              recon?: { book, confirmed, lines: [{ cause, amount, note }] }, requested?: string[] }
// 판단은 모두 순수 함수. 화면은 views/follow.js.

import { addDays } from './dates.js';

export const FOLLOW_TYPES = {
  noreply: { key: 'noreply', label: '미회수 확정', hint: '최종 독촉 후에도 회신이 없어요' },
  diff: { key: 'diff', label: '금액 차이', hint: '회신 금액이 장부와 달라요' },
};

// ---------- 미회수: 조회서 종류별 절차 ----------
// evidence: 회사에 요청할 자료명. 있으면 'PBC 요청으로 만들기'로 기존 자료 요청 목록에 넣을 수 있다.
// role: 'alt'(대체적 절차) | 'escalate'(회수 재시도·보고) | 'support'(보조 증거, 단독으로 조회를 대신하지 못함)

const BANK_STEPS = [
  { key: 'resend', role: 'escalate', label: '조회서 재발송', detail: '금융기관의 조회 담당 부서·주소를 다시 확인해 2차 조회서를 보내요.' },
  { key: 'call', role: 'escalate', label: '금융기관 담당자에게 직접 연락', detail: '감사인이 직접 연락해 회신을 요청해요. 회사를 거쳐 연락하지 않아요.' },
  { key: 'visit', role: 'escalate', label: '방문해서 회신 직접 수령', detail: '감사인이 금융기관을 방문해 회신서를 받아요.' },
  { key: 'statement', role: 'support', label: '기준일 잔액증명서·거래내역 입수', detail: '보조 증거로만 써요. 금융기관 조회를 대신하지는 못해요.', evidence: '기준일 잔액증명서 및 거래내역' },
  { key: 'report', role: 'escalate', label: '담당 매니저에게 보고', detail: '그래도 회수하지 못하면 감사범위 제한에 해당하는지 함께 검토해요.' },
];

const AR_STEPS = [
  { key: 'subsequent', role: 'alt', label: '기준일 이후 입금 확인', detail: '기준일 이후 실제 입금된 금액을 통장 내역과 대조해요.', evidence: '기준일 이후 입금 내역(통장 사본)' },
  { key: 'invoice', role: 'alt', label: '세금계산서·거래명세서 대조', detail: '기말 잔액을 구성하는 매출 세금계산서와 거래명세서를 확인해요.', evidence: '기말 채권 구성 세금계산서·거래명세서' },
  { key: 'shipping', role: 'alt', label: '출하·인수 증빙 확인', detail: '기준일 전후 출하 기록과 거래처 인수증으로 실재성과 기간귀속을 확인해요.', evidence: '기준일 전후 출하·인수 증빙' },
];

const AP_STEPS = [
  { key: 'subsequentPay', role: 'alt', label: '기준일 이후 지급 확인', detail: '기준일 이후 실제 지급한 금액을 통장 출금 내역과 대조해요.', evidence: '기준일 이후 지급 내역(통장 사본)' },
  { key: 'invoiceIn', role: 'alt', label: '매입 세금계산서·입고 증빙 대조', detail: '기말 채무를 구성하는 매입 세금계산서와 입고 기록을 확인해요.', evidence: '기말 채무 구성 매입 세금계산서·입고 증빙' },
  { key: 'unrecorded', role: 'alt', label: '미기록부채 검토', detail: '기준일 이후 지급·청구서 중 기준일 이전 거래분이 빠지지 않았는지 봐요.', evidence: '기준일 이후 지급 및 수취 청구서 목록' },
];

const LEGAL_STEPS = [
  { key: 'resend', role: 'escalate', label: '조회서 재발송·직접 연락', detail: '법무법인 담당 변호사에게 감사인이 직접 회신을 요청해요.' },
  { key: 'mgmt', role: 'alt', label: '경영진 질문 및 확인서 반영', detail: '진행 중인 소송·분쟁을 경영진에게 묻고, 경영진 확인서에 포함해요.' },
  { key: 'minutes', role: 'alt', label: '이사회 의사록·법률비용 검토', detail: '의사록과 지급수수료(법률비용) 계정에서 드러나지 않은 사건이 있는지 봐요.', evidence: '이사회 의사록 및 법률비용 지급 내역' },
  { key: 'report', role: 'escalate', label: '담당 매니저에게 보고', detail: '회신 없이 중요한 소송 여부를 판단하기 어려우면 함께 검토해요.' },
];

const INVENTORY_STEPS = [
  { key: 'resend', role: 'escalate', label: '조회서 재발송·보관처 직접 연락', detail: '보관처 담당자에게 감사인이 직접 회신을 요청해요.' },
  { key: 'inspect', role: 'alt', label: '보관처 방문 실사', detail: '보관 장소에서 직접 수량을 세고 당사 재고로 구분 보관되는지 확인해요.' },
  { key: 'receipts', role: 'alt', label: '창고증권·보관증 확인', detail: '보관처가 발행한 창고증권이나 보관증으로 품목·수량을 대조해요.', evidence: '창고증권·보관증 사본' },
  { key: 'movement', role: 'alt', label: '기준일 전후 입출고 대조', detail: '기준일 전후 입출고 기록과 운송 증빙으로 기말 수량을 역산해요.', evidence: '기준일 전후 입출고 내역' },
  { key: 'report', role: 'escalate', label: '담당 매니저에게 보고', detail: '중요한 재고를 확인하지 못하면 함께 검토해요.' },
];

/** 조회 건에 맞는 미회수 절차 목록. 채권채무는 채권·채무 중 금액이 있는 쪽만. */
export function noReplySteps(item) {
  if (item.confType === 'bank') return BANK_STEPS;
  if (item.confType === 'inventory') return INVENTORY_STEPS;
  if (item.confType === 'legal') return LEGAL_STEPS;
  const steps = [];
  if ((item.receivable ?? item.bookAmount ?? 0) > 0) steps.push(...AR_STEPS);
  if ((item.payable ?? 0) > 0) steps.push(...AP_STEPS);
  return steps.length ? steps : AR_STEPS;
}

/** 은행·변호사 조회는 금액과 무관하게 회수해야 해서, 대체적 절차만으로 끝내지 않는다. */
export function noReplyNotice(item) {
  if (item.track === 'required') {
    return '금융기관 조회는 금액과 상관없이 회수해야 해요. 잔액증명서는 보조 증거일 뿐, 조회를 대신하지 못해요.';
  }
  if (item.track === 'general') {
    return '경영진 질문, 의사록·법률비용 검토로 소송과 우발부채를 확인하고, 경영진 확인서에 반영해요.';
  }
  return '아래 절차로 기말 잔액을 확인하고, 확인한 금액만큼 커버리지에 반영해요.';
}

// ---------- 금액 차이: 원인과 결론 ----------

export const DIFF_CAUSES = [
  { key: 'goods', label: '시점 차이 · 미착품', misstatement: false, hint: '기준일에 운송 중인 물품' },
  { key: 'cash', label: '시점 차이 · 송금 중', misstatement: false, hint: '기준일에 이체 중인 대금' },
  { key: 'party', label: '조회처 측 오류', misstatement: false, hint: '조회처 장부의 기장 오류' },
  { key: 'company', label: '회사 장부 오류', misstatement: true, hint: '수정이 필요한 왜곡표시' },
  { key: 'unknown', label: '원인 불명', misstatement: true, hint: '추가 절차가 필요한 차이' },
];

// 미착품 차이는 인도조건에 따라 성격이 갈린다.
//   선적지 인도: 출고 때 소유권이 넘어가 회사 장부가 맞고, 조회처가 늦게 잡은 시점 차이
//   도착지 인도: 도착 때 소유권이 넘어가 회사가 매출(채권)을 너무 일찍 잡은 기간귀속 오류 → 왜곡표시
export const DELIVERY_TERMS = [
  { key: 'shipping', label: '선적지 인도', hint: '출고 때 소유권 이전 · 시점 차이' },
  { key: 'destination', label: '도착지 인도', hint: '도착 때 소유권 이전 · 회사 기간귀속 오류' },
];

/** 이 차이 줄이 왜곡표시인지. 미착품은 도착지 인도일 때만 왜곡표시. */
export function isMisstatementLine(line) {
  if (line.cause === 'goods') return line.terms === 'destination';
  return Boolean(causeOf(line.cause)?.misstatement);
}

export function causeOf(key) {
  return DIFF_CAUSES.find((c) => c.key === key);
}

/**
 * 조정 계산. 차이 = 장부금액 − 회신금액. 원인별 금액(부호 포함)의 합이 차이와 같아야 설명이 끝난다.
 * @returns {{ book, confirmed, diff, explained, unexplained, misstatement, termsPending, lines, result }}
 *   termsPending: 인도조건을 아직 확인하지 않은 미착품 줄 수
 *   result: 'matched'(차이 없음) | 'timing'(시점 차이 등으로 모두 설명, 왜곡표시 없음)
 *         | 'misstatement'(회사 오류·원인 불명 금액 있음) | 'open'(아직 설명 안 된 차이)
 */
export function reconcile(recon) {
  const book = Number(recon?.book) || 0;
  const confirmed = Number(recon?.confirmed) || 0;
  const lines = (recon?.lines || []).filter((l) => l.cause && Number(l.amount));
  const diff = book - confirmed;
  const explained = lines.reduce((s, l) => s + Number(l.amount), 0);
  const unexplained = diff - explained;
  const misstatement = lines.filter(isMisstatementLine).reduce((s, l) => s + Number(l.amount), 0);
  const termsPending = lines.filter((l) => l.cause === 'goods' && !l.terms).length;
  let result;
  if (diff === 0) result = 'matched';
  else if (unexplained !== 0) result = 'open';
  else if (misstatement !== 0) result = 'misstatement';
  else result = 'timing';
  return { book, confirmed, diff, explained, unexplained, misstatement, termsPending, lines, result };
}

const won = (n) => `${Number(n).toLocaleString('ko-KR')}원`;

/** 조서에 옮겨 적을 결론 문장 */
export function reconConclusion(r) {
  switch (r.result) {
    case 'matched': return '회신금액이 장부금액과 일치해요. 추가 절차 없이 완료할 수 있어요.';
    case 'timing': return `차이 ${won(r.diff)}은 시점 차이·조회처 오류로 모두 설명돼요. 왜곡표시는 없어요.`;
    case 'misstatement': return `왜곡표시 후보 ${won(r.misstatement)}(회사 장부 오류·원인 불명·도착지 인도 미착품)은 수정 여부를 검토해야 해요.`;
    default: return `아직 설명되지 않은 차이가 ${won(r.unexplained)} 남았어요. 원인을 더 확인해야 해요.`;
  }
}

// ---------- 상태 전환 ----------

/** 후속 절차는 외부조회 건이고, 아직 완료되지 않았을 때만 시작할 수 있다. */
export function canStartFollow(item) {
  return item?.kind === 'confirmation' && item.status !== 'done';
}

/** 후속 절차를 시작한 새 자료. 원래 자료는 바꾸지 않는다. */
export function startFollow(item, type, on) {
  if (!canStartFollow(item)) throw new Error('외부조회 건만 후속 절차를 시작할 수 있어요.');
  const follow = { type, startedOn: on, requested: [] };
  if (type === 'noreply') {
    follow.steps = {};
    follow.verified = 0;
  } else {
    follow.recon = { book: item.bookAmount ?? 0, confirmed: null, lines: [] };
  }
  const next = { ...item, status: 'follow', follow };
  if (type === 'diff') next.received = { ...(item.received || {}), on: item.received?.on || on };
  return next;
}

/**
 * 완료할 수 있는지와, 막혀 있으면 그 이유.
 * - 미회수: 필수 회수 조회(은행·변호사)는 대체적 절차로 끝낼 수 없다. 커버리지 조회는 대체적 절차를 하나 이상 마쳐야 한다.
 * - 금액 차이: 설명되지 않은 차이가 없어야 한다.
 */
export function completeCheck(item) {
  const f = item.follow;
  if (!f) return { ok: false, reason: '후속 절차가 시작되지 않았어요.' };
  if (f.type === 'noreply') {
    if (item.track === 'required') {
      return { ok: false, reason: '필수 회수 조회라 회신을 받은 뒤 완료할 수 있어요.' };
    }
    const doneAlt = noReplySteps(item).some((s) => s.role === 'alt' && f.steps?.[s.key]);
    return doneAlt ? { ok: true } : { ok: false, reason: '대체적 절차를 하나 이상 마쳐야 해요.' };
  }
  if (f.recon?.confirmed === null || f.recon?.confirmed === undefined || f.recon?.confirmed === '') {
    return { ok: false, reason: '회신금액을 입력해 주세요.' };
  }
  const r = reconcile(f.recon);
  if (r.result === 'open') return { ok: false, reason: '설명되지 않은 차이가 남아 있어요.' };
  if (r.termsPending) return { ok: false, reason: '미착품 차이의 인도조건을 확인해 주세요.' };
  return { ok: true };
}

/**
 * 완료 기록(감사기준서 230: 수행자·완료일·검토자) 검증. 수행자와 완료일은 필수, 검토자는 나중에 채워도 된다.
 * @returns {Record<string,string>} 비어 있으면 통과
 */
export function validateSignoff({ preparer, completedOn, reviewer } = {}) {
  const errors = {};
  if (!String(preparer ?? '').trim()) errors.preparer = '수행자를 입력해 주세요.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(completedOn ?? ''))) errors.completedOn = '완료일을 입력해 주세요.';
  return errors;
}

/** 완료 처리한 새 자료. 결론과 수행자·완료일·검토자를 남긴다. */
export function completeFollow(item, signoff) {
  const check = completeCheck(item);
  if (!check.ok) throw new Error(check.reason);
  const errors = validateSignoff(signoff);
  if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
  const f = item.follow;
  const conclusion = f.type === 'diff'
    ? reconConclusion(reconcile(f.recon))
    : `대체적 절차로 ${won(f.verified || 0)} 확인`;
  return {
    ...item,
    status: 'done',
    follow: {
      ...f,
      closedOn: signoff.completedOn,
      conclusion,
      signoff: { preparer: signoff.preparer.trim(), reviewer: String(signoff.reviewer ?? '').trim() },
    },
  };
}

/** 대체적 절차로 확인한 금액. 장부금액을 넘지 않게 자른다. */
export function clampVerified(item, value) {
  const n = Math.max(0, Math.round(Number(String(value).replace(/[,\s원]/g, '')) || 0));
  return Math.min(n, item.bookAmount ?? n);
}

// ---------- 회사에 요청할 증빙 (기존 PBC 자료 요청으로 연결) ----------

/**
 * 후속 절차에 필요한 증빙을 PBC 자료 요청 값으로 만든다. store.addItems()에 그대로 넘긴다.
 * - 미회수: 선택한 절차 중 증빙이 필요한 것
 * - 금액 차이: 거래처별 차이 소명 자료 1건
 * 이미 요청한 증빙(follow.requested)은 다시 만들지 않는다.
 */
export function evidenceRequests(item, { stepKeys = [], owner, dept = '', today, days = 5 }) {
  const f = item.follow;
  const already = new Set(f?.requested || []);
  let wanted;
  if (f?.type === 'diff') {
    wanted = [{ key: 'diff', name: `차이 소명 자료 (${item.counterparty})`, procedure: '외부조회 차이 조정' }];
  } else {
    wanted = noReplySteps(item)
      .filter((s) => s.evidence && stepKeys.includes(s.key))
      .map((s) => ({ key: s.key, name: `${s.evidence} (${item.counterparty})`, procedure: '외부조회 대체적 절차' }));
  }
  return wanted.filter((w) => !already.has(w.key)).map((w) => ({
    key: w.key,
    value: {
      item: {
        name: w.name, owner, requestedOn: today, neededOn: addDays(today, days),
        status: 'none', procedure: w.procedure, nudges: [], sourceId: item.id,
      },
      person: { owner, dept },
    },
  }));
}

// ---------- 커버리지 (금액 커버리지 트랙) ----------

/**
 * 커버리지 트랙 조회의 확인 금액 집계.
 * 확인 = 회신 완료(완료 상태) 금액 + 대체적 절차로 확인한 금액
 *      + 차이 건의 회신금액 (조정을 마쳤으면 왜곡표시가 아닌 설명분까지)
 */
export function coverageSummary(items) {
  const list = items.filter((x) => x.kind === 'confirmation' && x.track === 'coverage');
  const total = list.reduce((s, x) => s + (x.bookAmount || 0), 0);
  let confirmed = 0;
  let alternative = 0;
  for (const x of list) {
    if (x.follow?.type === 'noreply') alternative += x.follow.verified || 0;
    else if (x.follow?.type === 'diff' && x.follow.recon?.confirmed != null) {
      // 조정 중: 회신금액만. 조정을 마친 건: 왜곡표시가 아닌 것으로 설명된 차이(시점 차이 등)까지 확인된 것으로 본다.
      let amount = Number(x.follow.recon.confirmed) || 0;
      if (x.status === 'done') {
        const r = reconcile(x.follow.recon);
        amount += r.explained - r.misstatement;
      }
      confirmed += Math.min(Math.max(amount, 0), x.bookAmount || 0);
    }
    else if (x.status === 'done') confirmed += x.bookAmount || 0;
  }
  const covered = confirmed + alternative;
  return { count: list.length, total, confirmed, alternative, covered, uncovered: total - covered, ratio: total ? covered / total : 0 };
}

// ---------- 대시보드 외부조회 현황 (트랙별) ----------

/**
 * 트랙별 현황. 회신 완료(완료 상태)를 '회수'로 본다.
 * @param performance 수행중요성(원). 회사 단위로 하나. 없으면 비교하지 않는다.
 * @returns {{
 *   any: boolean,
 *   required: { total, received, pending: { id, name }[] },   // 은행: 금액과 무관하게 전수 회수
 *   general:  { total, received, pending: { id, name }[] },   // 변호사
 *   coverage: coverageSummary() + { performance, exceeds, gap }  // 미확인 잔액 vs 수행중요성
 * }}
 */
export function trackOverview(items, performance) {
  const conf = items.filter((x) => x.kind === 'confirmation');
  const byTrack = (track) => {
    const list = conf.filter((x) => x.track === track);
    return {
      total: list.length,
      received: list.filter((x) => x.status === 'done').length,
      pending: list.filter((x) => x.status !== 'done').map((x) => ({ id: x.id, name: x.counterparty })),
    };
  };
  const cov = coverageSummary(items);
  const perf = Number(performance) || 0;
  return {
    any: conf.length > 0,
    required: byTrack('required'),
    general: byTrack('general'),
    coverage: { ...cov, performance: perf || null, exceeds: perf ? cov.uncovered > perf : false, gap: perf ? cov.uncovered - perf : 0 },
  };
}
