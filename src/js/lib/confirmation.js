// 외부조회서 작성: 선정된 조회처 목록(엑셀 붙여넣기) → 표준 조회서 문서 데이터 → 조회 목록 등록
//
// 조회서는 회사 명의로 작성해 회사가 날인하고, 회신은 감사인에게 직접 오도록 한다.
// 이 파일은 순수 함수만 둔다. 화면(HTML)은 views/confirm.js가 그린다.
//
// 종류
//   bank  : 은행조회서 (금융거래 조회서) — 금융기관 1곳당 1장, 행을 금융기관+지점으로 묶는다
//   arap  : 채권채무조회서 — 거래처 1곳당 1장
//   legal : 변호사조회서 — 법무법인 1곳당 1장, 사건 행을 묶는다
//   inventory : 제3자보관재고자산조회서 — 보관처(창고)별 1장, 품목 행을 묶는다. 수량을 확인받는다
//
// track: 'required'(금액과 무관하게 전수 회수 — 은행, 실무 관행)
//      | 'coverage'(수행중요성 대비 금액 커버리지로 관리 — 채권채무·재고)
//      | 'general'(금액 없이 회신 여부로 관리 — 변호사)

import { normalizeDate, splitCells } from './add.js';
import { addDays, daysBetween } from './dates.js';

export const CONF_TYPES = {
  bank: {
    key: 'bank', label: '은행조회서', title: '금융거래 조회서', prefix: 'BK', track: 'required',
    unit: '금융기관',
    columns: ['금융기관', '지점(선택)', '주소', '구분', '계좌번호·내역', '장부금액(선택)'],
    example: [
      '금융기관\t지점\t주소\t구분\t계좌번호·내역\t장부금액',
      '한빛은행\t여의도지점\t서울특별시 영등포구 국제금융로 10\t보통예금\t110-234-567890\t1,250,000,000',
      '한빛은행\t여의도지점\t서울특별시 영등포구 국제금융로 10\t단기차입금\t운전자금대출 2026-03\t3,000,000,000',
      '한빛은행\t여의도지점\t서울특별시 영등포구 국제금융로 10\t약정\t당좌차월 한도 50억\t',
      '바다저축은행\t본점\t부산광역시 해운대구 센텀중앙로 55\t정기예금\t2026-001-778\t500,000,000',
    ].join('\n'),
  },
  arap: {
    key: 'arap', label: '채권채무조회서', title: '채권·채무 조회서', prefix: 'AR', track: 'coverage',
    unit: '거래처',
    columns: ['거래처명', '주소', '채권(당사 매출채권 등)', '채무(당사 매입채무 등)', '형식(기재/공란, 선택)'],
    example: [
      '거래처명\t주소\t채권\t채무\t형식',
      '㈜대한부품\t경기도 수원시 영통구 광교로 100\t842,000,000\t0\t기재',
      '세진물산㈜\t인천광역시 연수구 송도과학로 32\t315,500,000\t120,000,000\t기재',
      '㈜오성테크\t충청남도 아산시 탕정면 삼성로 181\t0\t96,300,000\t공란',
    ].join('\n'),
  },
  legal: {
    key: 'legal', label: '변호사조회서', title: '법률 조회서', prefix: 'LG', track: 'general',
    unit: '법무법인',
    columns: ['법무법인', '담당 변호사(선택)', '주소', '사건명(선택)'],
    example: [
      '법무법인\t담당 변호사\t주소\t사건명',
      '법무법인 정의\t김정의 변호사\t서울특별시 서초구 서초대로 219\t물품대금 청구 소송 (서울중앙지법 2026가합1234)',
      '법무법인 정의\t김정의 변호사\t서울특별시 서초구 서초대로 219\t특허권 침해 금지 가처분',
      '법무법인 바른길\t\t서울특별시 강남구 테헤란로 92\t',
    ].join('\n'),
  },
  inventory: {
    key: 'inventory', label: '제3자보관재고자산조회서', title: '제3자 보관 재고자산 조회서', prefix: 'IV', track: 'coverage',
    unit: '보관처',
    columns: ['보관처', '창고(선택)', '주소', '품목', '수량', '단위(선택)', '장부금액(선택)'],
    example: [
      '보관처\t창고\t주소\t품목\t수량\t단위\t장부금액',
      '㈜한결물류\t평택센터\t경기도 평택시 포승읍 평택항로 156\tOLED 패널 A-15\t12,400\tEA\t1,488,000,000',
      '㈜한결물류\t평택센터\t경기도 평택시 포승읍 평택항로 156\t구동칩 DX-7\t85,000\tEA\t425,000,000',
      '대성냉장㈜\t부산 감천창고\t부산광역시 사하구 원양로 177\t접착 소재 B-2\t3,200\tkg\t96,000,000',
    ].join('\n'),
  },
};

export const TRACK_LABEL = { required: '필수 회수', coverage: '커버리지 관리', general: '일반 조회' };

export const TYPE_ORDER = ['bank', 'arap', 'legal', 'inventory'];

/** 은행조회서 '구분'으로 받는 항목. 이 단어가 들어가면 인정한다 (보통예금 → 예금). */
export const BANK_CATEGORIES = ['예금', '적금', '차입금', '대출', '보증', '담보', '약정', '파생', '기타'];

const HEADER_WORDS = ['금융기관', '은행', '거래처', '거래처명', '법무법인', '구분', '주소', '채권', '채무', '사건명', '보관처', '품목', '수량'];

// ---------- 공통 정보 ----------

/** 조회서 공통 정보 기본값. 회사명은 앱의 클라이언트명으로 채운다. */
export function defaultSetup(client = {}, today) {
  const year = Number(today.slice(0, 4));
  return {
    companyName: client.name || '',
    ceoName: '',
    companyAddress: '',
    auditorName: '삼일회계법인',
    auditorAddress: '서울특별시 용산구 한강대로 100 아모레퍼시픽빌딩',
    contactName: '',
    contactPhone: '',
    contactEmail: '',
    baseDate: `${year - (today.slice(5) < '04-01' ? 1 : 0)}-12-31`,
    issuedOn: today,
    replyBy: addDays(today, 14),
  };
}

const SETUP_REQUIRED = {
  companyName: '회사명을 입력해 주세요.',
  ceoName: '대표이사 성명을 입력해 주세요.',
  companyAddress: '회사 주소를 입력해 주세요.',
  auditorName: '감사인을 입력해 주세요.',
  auditorAddress: '회신받을 감사인 주소를 입력해 주세요.',
  contactName: '감사인 담당자를 입력해 주세요.',
};

/**
 * 공통 정보 검증 + 날짜 정규화.
 * @returns {{ errors: Record<string,string>, value: object | null }}
 */
export function validateSetup(setup, today) {
  const errors = {};
  const value = {};
  for (const [key, message] of Object.entries(SETUP_REQUIRED)) {
    value[key] = String(setup[key] ?? '').trim();
    if (!value[key]) errors[key] = message;
  }
  value.contactPhone = String(setup.contactPhone ?? '').trim();
  value.contactEmail = String(setup.contactEmail ?? '').trim();
  if (!value.contactPhone && !value.contactEmail) errors.contactPhone = '회신 문의용 전화나 이메일 중 하나는 필요해요.';
  if (value.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.contactEmail)) errors.contactEmail = '이메일 형식을 확인해 주세요.';

  for (const [key, label] of [['baseDate', '조회 기준일'], ['issuedOn', '발송일'], ['replyBy', '회신 기한']]) {
    const raw = String(setup[key] ?? '').trim();
    value[key] = normalizeDate(raw, today);
    if (!raw) errors[key] = `${label}을 입력해 주세요.`;
    else if (!value[key]) errors[key] = '날짜 형식을 확인해 주세요. 예: 2026-12-31';
  }
  if (value.issuedOn && value.replyBy && daysBetween(value.issuedOn, value.replyBy) <= 0) {
    errors.replyBy = '회신 기한은 발송일 뒤여야 해요.';
  }
  return { errors, value: Object.keys(errors).length ? null : value };
}

// ---------- 붙여넣기 파싱 ----------

/** '1,250,000,000' · '1250000000원' · '' → 숫자 / null(빈칸) / NaN(잘못된 값) */
export function parseAmount(input) {
  const s = String(input ?? '').replace(/[,\s원₩]/g, '');
  if (!s || s === '-') return null;
  if (!/^\d+$/.test(s)) return NaN;
  return Number(s);
}

/** 1250000000 → '1,250,000,000' */
export function formatAmount(n) {
  return Number(n).toLocaleString('ko-KR');
}

function lines(text) {
  return String(text ?? '').split(/\r?\n/).filter((l) => l.trim());
}

function isHeader(cells) {
  return cells.some((c) => HEADER_WORDS.includes(c.replace(/\s+|\(.*\)/g, '')));
}

/** 공통: 줄 → 셀, 첫 줄이 제목이면 뺀다 */
function readRows(text) {
  const ls = lines(text);
  let headerSkipped = false;
  if (ls.length && isHeader(splitCells(ls[0]))) {
    ls.shift();
    headerSkipped = true;
  }
  return { rows: ls.map((line, i) => ({ line: i + 1, cells: splitCells(line) })), headerSkipped };
}

function parseBankRow(cells) {
  const [name = '', branch = '', address = '', category = '', desc = '', amount = ''] = cells;
  const errors = {};
  if (!name) errors.name = '금융기관명 없음';
  if (!category) errors.category = '구분 없음';
  else if (!BANK_CATEGORIES.some((w) => category.includes(w))) errors.category = '구분 확인 (예금·차입금·보증·담보·약정 등)';
  const bookAmount = parseAmount(amount);
  if (Number.isNaN(bookAmount)) errors.amount = '금액 형식 오류';
  return { errors, value: { name, branch, address, category, desc, bookAmount } };
}

function parseArapRow(cells) {
  const [name = '', address = '', recv = '', pay = '', form = ''] = cells;
  const errors = {};
  if (!name) errors.name = '거래처명 없음';
  if (!address) errors.address = '주소 없음';
  const receivable = parseAmount(recv);
  const payable = parseAmount(pay);
  if (Number.isNaN(receivable) || Number.isNaN(payable)) errors.amount = '금액 형식 오류';
  else if (receivable === null && payable === null) errors.amount = '채권·채무 금액 없음';
  const f = form.replace(/\s+/g, '');
  let blank = false;
  if (!f || f === '기재' || f.includes('기재')) blank = false;
  else if (f.includes('공란')) blank = true;
  else errors.form = '형식은 기재 또는 공란';
  return { errors, value: { name, address, receivable: receivable ?? 0, payable: payable ?? 0, blank } };
}

function parseLegalRow(cells) {
  const [name = '', lawyer = '', address = '', matter = ''] = cells;
  const errors = {};
  if (!name) errors.name = '법무법인명 없음';
  return { errors, value: { name, lawyer, address, matter } };
}

function parseInventoryRow(cells) {
  const [name = '', branch = '', address = '', item = '', qty = '', unit = '', amount = ''] = cells;
  const errors = {};
  if (!name) errors.name = '보관처명 없음';
  if (!item) errors.category = '품목 없음';
  const quantity = parseAmount(qty);
  if (quantity === null) errors.amount = '수량 없음';
  else if (Number.isNaN(quantity)) errors.amount = '수량 형식 오류';
  const bookAmount = parseAmount(amount);
  if (Number.isNaN(bookAmount)) errors.amount = '금액 형식 오류';
  return { errors, value: { name, branch, address, item, quantity, unit, bookAmount } };
}

const ROW_PARSERS = { bank: parseBankRow, arap: parseArapRow, legal: parseLegalRow, inventory: parseInventoryRow };

/**
 * 붙여넣은 목록을 조회처 단위로 묶는다.
 * @returns {{
 *   rows: { line, cells, value, errors }[],
 *   parties: { key, name, branch?, lawyer?, address, lines: number[], ...type별 값, errors }[],
 *   headerSkipped, errorCount
 * }}
 * errorCount는 행 오류 + 조회처 오류(주소 없음·주소 불일치·중복 거래처) 합계. 0이어야 조회서를 만든다.
 */
export function parseConfirmations(type, text) {
  const { rows: raw, headerSkipped } = readRows(text);
  const rows = raw.map((r) => ({ ...r, ...ROW_PARSERS[type](r.cells) }));
  const parties = type === 'arap' ? arapParties(rows) : groupedParties(type, rows);
  const rowErrors = rows.filter((r) => Object.keys(r.errors).length).length;
  const partyErrors = parties.filter((p) => Object.keys(p.errors).length).length;
  return { rows, parties, headerSkipped, errorCount: rowErrors + partyErrors };
}

function arapParties(rows) {
  const seen = new Map();
  return rows.filter((r) => r.value.name).map((r) => {
    const key = r.value.name.replace(/\s+/g, '');
    const errors = {};
    if (seen.has(key)) errors.duplicate = `${seen.get(key)}행과 거래처 중복`;
    else seen.set(key, r.line);
    return { key, ...r.value, lines: [r.line], errors };
  });
}

/** 은행(금융기관+지점)·재고(보관처+창고)·변호사(법무법인)는 여러 행을 한 조회처로 묶는다. */
function groupedParties(type, rows) {
  const groups = new Map();
  for (const r of rows) {
    if (!r.value.name) continue;
    const key = type === 'legal' ? r.value.name : `${r.value.name}|${r.value.branch}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  return [...groups].map(([key, rs]) => {
    const first = rs[0].value;
    const addresses = [...new Set(rs.map((r) => r.value.address).filter(Boolean))];
    const errors = {};
    if (!addresses.length) errors.address = '주소 없음';
    else if (addresses.length > 1) errors.address = '같은 조회처에 주소가 여러 개';
    const party = { key, name: first.name, address: addresses[0] || '', lines: rs.map((r) => r.line), errors };
    if (type === 'bank') {
      party.branch = first.branch;
      party.entries = rs.map((r) => ({ category: r.value.category, desc: r.value.desc, bookAmount: r.value.bookAmount }));
    } else if (type === 'inventory') {
      party.branch = first.branch;
      party.goods = rs.map((r) => ({ item: r.value.item, quantity: r.value.quantity, unit: r.value.unit, bookAmount: r.value.bookAmount }));
    } else {
      party.lawyer = rs.map((r) => r.value.lawyer).find(Boolean) || '';
      party.matters = rs.map((r) => r.value.matter).filter(Boolean);
    }
    return party;
  });
}

// ---------- 조회서 문서 ----------

/** '2026-12-31' → '2026년 12월 31일' */
export function longKoreanDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${y}년 ${m}월 ${d}일`;
}

function docNo(type, n) {
  return `${CONF_TYPES[type].prefix}-${String(n).padStart(3, '0')}`;
}

function recipientName(type, p) {
  if (type === 'bank' || type === 'inventory') return `${p.name}${p.branch ? ` ${p.branch}` : ''}`;
  return p.name;
}

/**
 * 조회서 문서 데이터. 화면·인쇄는 이 데이터만 보고 그린다.
 * @param opts { startNo = 1, bankBlank = false }  bankBlank: 은행조회서 장부금액을 비워 보낼지
 * @returns letter[] — { type, docNo, title, issuedOn, to, from, paragraphs, table, notes, reply, replyTo, party }
 */
export function buildLetters(type, parties, setup, { startNo = 1, bankBlank = false } = {}) {
  return parties.map((p, i) => {
    const base = longKoreanDate(setup.baseDate);
    const by = longKoreanDate(setup.replyBy);
    const letter = {
      type,
      docNo: docNo(type, startNo + i),
      title: CONF_TYPES[type].title,
      issuedOn: longKoreanDate(setup.issuedOn),
      to: { name: recipientName(type, p), attn: type === 'legal' ? p.lawyer : '', address: p.address },
      from: { company: setup.companyName, ceo: setup.ceoName, address: setup.companyAddress },
      replyTo: {
        auditor: setup.auditorName, address: setup.auditorAddress, contact: setup.contactName,
        phone: setup.contactPhone, email: setup.contactEmail,
      },
      replyBy: by,
      party: p,
    };
    return { ...letter, ...LETTER_BODY[type](p, setup, base, by, { bankBlank }) };
  });
}

const LETTER_BODY = {
  bank(p, setup, base, by, { bankBlank }) {
    const filled = !bankBlank;
    return {
      blank: bankBlank,
      paragraphs: [
        `당사의 외부감사인인 ${setup.auditorName}에서 당사 재무제표 감사를 위하여 ${base} 현재 귀 금융기관과 당사 간의 거래 내용을 조회하고자 합니다.`,
        filled
          ? `아래 당사 장부상 내용을 귀 금융기관의 기록과 대조하시어, ${by}까지 아래 회신처(당사 감사인)로 직접 회신하여 주시기 바랍니다.`
          : `아래 항목에 대하여 귀 금융기관 기록상의 금액을 기재하시어, ${by}까지 아래 회신처(당사 감사인)로 직접 회신하여 주시기 바랍니다.`,
      ],
      table: {
        columns: filled ? ['구분', '계좌번호·내역', '당사 장부금액(원)', '귀 금융기관 확인금액(원)'] : ['구분', '계좌번호·내역', '귀 금융기관 기록금액(원)'],
        rows: p.entries.map((e) => (filled
          ? [e.category, e.desc || '', e.bookAmount === null ? '' : formatAmount(e.bookAmount), '']
          : [e.category, e.desc || '', ''])),
        amountCols: filled ? [2, 3] : [2],
      },
      notes: [
        '위에 기재되지 않은 예금·적금, 차입금, 지급보증, 담보 제공, 약정(한도·파생상품 포함) 등이 있는 경우 그 내용을 함께 기재하여 주시기 바랍니다.',
        '본 조회는 감사 목적으로만 사용되며, 당사에 대한 지급 요청이나 거래 지시가 아닙니다.',
      ],
      reply: {
        heading: '회신 (귀 금융기관 작성란)',
        statements: filled
          ? [`위 내용이 ${base} 현재 당 금융기관의 기록과 일치합니다.`, '위 내용과 다르며, 차이 내역은 별지에 기재합니다.']
          : [`위에 기재한 금액은 ${base} 현재 당 금융기관의 기록과 같습니다.`],
        signer: '금융기관명 · 확인자 직위·성명',
      },
    };
  },

  arap(p, setup, base, by) {
    const filled = !p.blank;
    return {
      blank: p.blank,
      paragraphs: [
        `당사의 외부감사인인 ${setup.auditorName}의 감사 목적으로 ${base} 현재 귀사와 당사 간의 채권·채무 잔액을 조회합니다.`,
        filled
          ? `아래 당사 장부상 잔액을 귀사의 장부와 대조하시어, ${by}까지 아래 회신처(당사 감사인)로 직접 회신하여 주시기 바랍니다.`
          : `귀사 장부상 잔액을 아래에 기재하시어, ${by}까지 아래 회신처(당사 감사인)로 직접 회신하여 주시기 바랍니다.`,
      ],
      table: filled
        ? {
          columns: ['구분', '당사 장부금액(원)', '귀사 확인금액(원)'],
          rows: [
            ['당사의 채권 (귀사의 채무)', formatAmount(p.receivable), ''],
            ['당사의 채무 (귀사의 채권)', formatAmount(p.payable), ''],
          ],
          amountCols: [1, 2],
        }
        : {
          columns: ['구분', '귀사 장부상 잔액(원)'],
          rows: [['귀사의 채무 (당사의 채권)', ''], ['귀사의 채권 (당사의 채무)', '']],
          amountCols: [1],
        },
      notes: [
        '금액이 다른 경우 미착품, 송금 중인 금액 등 차이 내역을 함께 기재하여 주시기 바랍니다.',
        '본 조회는 대금의 청구나 지급 요청이 아니며, 감사 목적으로만 사용됩니다.',
      ],
      reply: {
        heading: '회신 (귀사 작성란)',
        statements: filled
          ? [`위 잔액이 ${base} 현재 당사의 장부와 일치합니다.`, '위 잔액과 다르며, 차이 내역은 별지에 기재합니다.']
          : [`위에 기재한 잔액은 ${base} 현재 당사의 장부와 같습니다.`],
        signer: '회사명 · 확인자 직위·성명',
      },
    };
  },

  legal(p, setup, base, by) {
    return {
      blank: false,
      paragraphs: [
        `당사의 외부감사인인 ${setup.auditorName}의 감사 목적으로, ${base} 현재 및 그 이후 회신일까지 귀 법무법인(사무소)이 당사를 위하여 수임하였거나 자문한 사항에 대하여 아래 내용을 조회합니다.`,
        `아래 사항을 기재하시어 ${by}까지 아래 회신처(당사 감사인)로 직접 회신하여 주시기 바랍니다. 당사는 귀 법무법인이 본 조회에 회신하는 것에 동의합니다.`,
      ],
      table: p.matters.length
        ? {
          caption: '당사가 파악하고 있는 사건',
          columns: ['사건', '소송가액·청구금액', '진행 상황 및 예상 결과'],
          rows: p.matters.map((m) => [m, '', '']),
          amountCols: [],
        }
        : null,
      requests: [
        '진행 중이거나 제기될 가능성이 있는 소송·중재·분쟁의 내용, 소송가액, 진행 상황 및 예상 결과',
        '당사에 대한 청구 또는 우발부채가 될 수 있는 사항',
        `${base} 현재 당사가 지급하지 않은 수임료 및 비용`,
      ],
      notes: [
        p.matters.length
          ? '위 목록에 없는 사건이 있는 경우 그 내용을 함께 기재하여 주시기 바랍니다.'
          : '해당 사항이 없는 경우에도 "해당 없음"으로 회신하여 주시기 바랍니다.',
      ],
      reply: {
        heading: '회신 (귀 법무법인 작성란)',
        statements: ['위 조회 사항에 대한 내용은 별지와 같습니다.', '위 조회 사항에 해당하는 내용이 없습니다.'],
        signer: '법무법인명 · 담당 변호사 성명',
      },
    };
  },

  // 보관처에는 금액이 아니라 수량과 소유권·권리 제한 여부를 확인받는다.
  inventory(p, setup, base, by) {
    return {
      blank: false,
      paragraphs: [
        `당사의 외부감사인인 ${setup.auditorName}의 감사 목적으로, ${base} 현재 귀사가 보관하고 있는 당사 소유 재고자산의 내역을 조회합니다.`,
        `아래 품목과 수량을 귀사의 보관 기록과 대조하시어, ${by}까지 아래 회신처(당사 감사인)로 직접 회신하여 주시기 바랍니다.`,
      ],
      table: {
        columns: ['품목', '단위', '당사 장부수량', '귀사 확인수량'],
        rows: p.goods.map((g) => [g.item, g.unit || '', formatAmount(g.quantity), '']),
        amountCols: [2, 3],
      },
      notes: [
        '위 재고에 대하여 질권·담보 설정, 압류 등 제3자의 권리가 있거나 당사 외 다른 회사의 재고와 함께 보관 중인 경우 그 내용을 기재하여 주시기 바랍니다.',
        '위에 기재되지 않은 당사 재고를 보관하고 있는 경우 함께 기재하여 주시기 바랍니다.',
      ],
      reply: {
        heading: '회신 (귀사 작성란)',
        statements: [
          `위 품목과 수량이 ${base} 현재 당사의 보관 기록과 일치합니다.`,
          '위 내용과 다르며, 차이 내역은 별지에 기재합니다.',
          '위 재고에 대한 질권·담보 설정 등 제3자의 권리가 없습니다.',
        ],
        signer: '보관처명 · 확인자 직위·성명',
      },
    };
  },
};

// ---------- 조회 목록 등록 ----------

/** 이미 등록된 같은 종류 조회서 수 + 1 → 다음 문서번호 */
export function nextDocNo(items, type) {
  return items.filter((x) => x.kind === 'confirmation' && x.confType === type).length + 1;
}

/**
 * 조회서를 대시보드 조회 목록에 넣을 값으로 바꾼다. store.addItems()에 그대로 넘긴다.
 * 조회처를 담당자(owner)로 두어 기존 대시보드의 담당자별 묶음·독촉 이력이 그대로 동작한다.
 * 요청일 = 발송일, 필요일 = 회신 기한.
 */
export function toRegistryValues(letters, setup) {
  return letters.map((l) => {
    const p = l.party;
    const item = {
      kind: 'confirmation',
      confType: l.type,
      docNo: l.docNo,
      name: `${CONF_TYPES[l.type].label} (${l.to.name})`,
      owner: l.to.name,
      counterparty: l.to.name,
      requestedOn: setup.issuedOn,
      neededOn: setup.replyBy,
      baseDate: setup.baseDate,
      status: 'none',
      procedure: '외부조회',
      track: CONF_TYPES[l.type].track,
      blank: l.blank,
      nudges: [],
    };
    if (l.type === 'bank') {
      item.bookAmount = p.entries.reduce((s, e) => s + (e.bookAmount || 0), 0);
    } else if (l.type === 'inventory') {
      item.bookAmount = p.goods.reduce((s, g) => s + (g.bookAmount || 0), 0);
    } else if (l.type === 'arap') {
      item.receivable = p.receivable;
      item.payable = p.payable;
      item.bookAmount = p.receivable + p.payable;
    }
    return { item, person: { owner: l.to.name, dept: CONF_TYPES[l.type].unit } };
  });
}

/** 기존 자료(kind 없음)는 PBC로 본다. */
export function isConfirmation(item) {
  return item?.kind === 'confirmation';
}
