// 시연용 예시 첨부파일의 내용 (스캔 문서처럼 그릴 수 있게 구조만 둔다).
// 그리기는 src/js/scan.js가 한다. 금액·수량은 예시 자료(store.js)의 장부 금액과 맞춘다.
// 모든 회사·은행·사람·번호는 가공의 것이다.

const won = (n) => Number(n).toLocaleString('ko-KR');

/** 은행조회서 회신 — 바다저축은행 본점 (BK-002, 장부 5억원과 일치) */
function bankReply(item, setup) {
  const deposits = [
    ['보통예금', '110-482-***521', 'KRW', '-', '-', 120000000],
    ['정기예금', '210-031-***087', 'KRW', '2027-06-30', '3.40%', 380000000],
  ];
  const total = deposits.reduce((s, r) => s + r[5], 0);
  return {
    kind: 'bank',
    docNo: item.docNo,
    title: '은 행 조 회 서 (회 신)',
    to: `${setup.auditorName} 귀중 (담당: ${setup.contactName})`,
    meta: [
      ['조회 의뢰 회사', `${setup.companyName} (대표이사 ${setup.ceoName})`],
      ['조회 기준일', '2026년 12월 31일'],
      ['조회서 번호', item.docNo],
    ],
    lead: '귀 감사인의 조회 의뢰에 대하여 당행의 장부에 기록된 내용을 아래와 같이 회신합니다.',
    sections: [
      { heading: '1. 예금 잔액', cols: ['예금 종류', '계좌번호', '통화', '만기일', '이율', '잔액(원)'],
        rows: deposits.map((r) => [...r.slice(0, 5), won(r[5])]), total: ['합계', '', '', '', '', won(total)] },
      { heading: '2. 차입금 및 당좌차월', cols: ['종류', '약정한도', '잔액', '이율', '만기일', '담보'],
        rows: [['해당 사항 없음', '', '', '', '', '']] },
      { heading: '3. 담보 제공 · 지급보증 · 기타 약정', cols: ['구분', '내용'],
        rows: [['담보 제공', '해당 사항 없음'], ['지급보증', '해당 사항 없음'], ['파생상품 · 기타 약정', '해당 사항 없음']] },
    ],
    remark: '상기 이외에 기준일 현재 귀사와의 거래로 당행 장부에 기록된 채권·채무는 없습니다.',
    signed: { date: '2027년 1월 11일', org: '바다저축은행 본점 수신관리팀', person: '책임자  한 지 원 (인)', stamp: ['바다저축', '은행', '본점'] },
    total,
  };
}

/** 제3자 보관 재고자산 조회 회신 — ㈜한결물류 평택센터 (수량만 확인) */
function inventoryReply(item, setup) {
  const lines = [
    ['P-1001', 'OLED 패널 A-15', 'EA', 8200, 8200],
    ['P-1024', 'OLED 패널 B-13', 'EA', 5400, 5400],
    ['M-3310', '구동 IC DR-7', 'BOX', 1260, 1260],
    ['M-4102', '편광필름 PF-2', 'ROLL', 340, 340],
  ];
  return {
    kind: 'inventory',
    docNo: item.docNo,
    title: '제3자 보관 재고자산 조회서 (회신)',
    to: `${setup.auditorName} 귀중 (담당: ${setup.contactName})`,
    meta: [
      ['위탁 회사', setup.companyName],
      ['보관 장소', '경기도 평택시 포승읍 평택항로 268 · 한결물류 평택센터 B동'],
      ['조회 기준일', '2026년 12월 31일'],
      ['조회서 번호', item.docNo],
    ],
    lead: '기준일 현재 당사가 위 회사를 위하여 보관 중인 재고자산의 수량을 아래와 같이 확인합니다.',
    sections: [
      { heading: '보관 수량 확인', cols: ['품목코드', '품목명', '단위', '회사 통지 수량', '보관 확인 수량', '차이'],
        rows: lines.map(([code, name, unit, notified, held]) => [code, name, unit, won(notified), won(held), won(held - notified)]) },
      { heading: '기타 확인 사항', cols: ['구분', '내용'],
        rows: [['소유권', '상기 재고는 당사 소유가 아니며 위탁 회사의 소유임'],
          ['담보 · 질권 설정', '해당 사항 없음'], ['출고 제한 · 보관료 미납', '해당 사항 없음']] },
    ],
    remark: '금액은 확인하지 않았으며 수량만 확인하였습니다.',
    signed: { date: '2027년 1월 12일', org: '㈜한결물류 평택센터', person: '센터장  오 승 민 (인)', stamp: ['㈜한결', '물류', '평택센터'] },
    lines,
  };
}

/** 법인세 과세표준 및 세액신고서 사본 — 2025 사업연도 (세율 2억 이하 9%, 2억 초과~200억 19%) */
export function corporateTax(income) {
  const base = income.net + income.add - income.deduct;
  const low = Math.min(base, 200000000);
  const computed = Math.round(low * 0.09 + Math.max(base - 200000000, 0) * 0.19);
  const payable = computed - income.credit;
  return { base, computed, payable, due: payable - income.prepaid };
}

function taxReturn(item, setup) {
  const income = { net: 3120000000, add: 410000000, deduct: 185000000, credit: 42000000, prepaid: 280000000 };
  const t = corporateTax(income);
  const row = (no, label, amount) => [no, label, won(amount)];
  return {
    kind: 'tax',
    title: '법인세 과세표준 및 세액신고서',
    to: '',
    meta: [
      ['법인명', setup.companyName],
      ['사업자등록번호', '124-81-*****'],
      ['대표자', setup.ceoName],
      ['사업연도', '2025.01.01 ~ 2025.12.31'],
    ],
    lead: '',
    sections: [
      { heading: '① 과세표준 및 세액의 계산', cols: ['코드', '구분', '금액(원)'],
        rows: [
          row('01', '결산서상 당기순손익', income.net),
          row('02', '소득조정금액  익금산입', income.add),
          row('03', '소득조정금액  손금산입', income.deduct),
          row('04', '각 사업연도 소득금액 (01+02-03)', t.base),
          row('10', '과세표준', t.base),
          row('12', '산출세액', t.computed),
          row('17', '공제감면세액', income.credit),
          row('20', '총부담세액', t.payable),
          row('22', '기납부세액 (중간예납)', income.prepaid),
          row('25', '차감 납부할 세액', t.due),
        ] },
    ],
    remark: '「법인세법」 제60조에 따라 위와 같이 신고합니다.',
    signed: { date: '2026년 3월 31일', org: `신고인  ${setup.companyName}`, person: `대표이사  ${setup.ceoName.split('').join(' ')} (인)`, stamp: null },
    receipt: ['전자신고 접수', '2026.03.31', '접수번호 1203-2026-***41'],
    tax: t,
  };
}

/** 예시 첨부 id → 문서 내용 */
export const SAMPLE_DOC_BUILDERS = {
  'sample-f1': bankReply,
  'sample-f2': inventoryReply,
  'sample-f3': taxReturn,
};

/** 예시 첨부의 문서 내용. 해당 없으면 null */
export function sampleDoc(fileId, item, setup) {
  const build = SAMPLE_DOC_BUILDERS[fileId];
  return build && item && setup ? build(item, setup) : null;
}
