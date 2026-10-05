// 테스트 전용 예시 데이터: 원래 초안의 PBC 6건(시연 기준일 2026-10-01)을 그대로 둔다.
// 앱의 예시(store.sampleState)는 시연에 맞게 바뀌었지만(외부조회·팀·2027-01-14 기준),
// 기존 독촉·우선순위·보고 테스트는 이 데이터를 기준으로 짜여 있다.
// PBC 4건에는 표준 양식(template·basisDate)을 붙여 둔다.

import { addDays } from '../src/js/lib/dates.js';

export const DEMO_DATE = '2026-10-01';

export function sampleState() {
  const d = (n) => addDays(DEMO_DATE, n);
  return {
    demoDate: DEMO_DATE,
    client: { name: '㈜한빛전자', engagement: '2026 기말감사' },
    team: { manager: { name: '이서연 매니저', dept: '감사팀' } },
    people: {
      '박준호 과장': { dept: '재무팀', nudges: 1, lastNudgedOn: d(-1) },
      '김민지 대리': { dept: '재무팀', nudges: 2, lastNudgedOn: d(-2) },
      '최도윤 차장': { dept: '관리팀', nudges: 2, lastNudgedOn: d(-5) },
    },
    items: [
      { id: 'i1', name: '은행조회서 회신', owner: '박준호 과장', requestedOn: d(-3), neededOn: d(1), status: 'none',
        procedure: '은행 조회', nudges: [{ on: d(-1), tone: 'angel' }] },
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
    ],
  };
}
