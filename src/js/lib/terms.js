// 부서(서비스)별 용어 사전. "요청 → 독촉 → 수령 → 보완" 흐름은 공통이고, 문구만 여기서 바뀐다.
// client.service 가 없으면 감사(audit) 용어를 쓴다 (기존 데이터·예시 자료 호환).

export const SERVICES = [
  { key: 'audit', label: '감사' },
  { key: 'tax', label: '세무' },
  { key: 'deal', label: '딜·실사' },
  { key: 'advisory', label: '컨설팅·자문' },
];

const TERMS = {
  audit: {
    service: '감사',
    mailTag: '감사',                 // 메일 제목 접두어: [한빛전자 감사]
    schedule: '감사 일정',           // "감사 일정상 …", "감사 일정 기준"
    procedure: '감사 절차',          // 자료를 쓰는 단계의 이름
    procedureHint: '예: 차입금 실증',
    defaultProcedure: '관련 감사',   // 절차를 안 적었을 때: "관련 감사 절차"
    team: '감사팀',
    engagementExample: '2026 기말감사',
    needDef: '해당 자료를 실제 감사 절차에 사용하기 시작하는 날',
    heroSub: '감사 일정에 맞춰 급한 자료부터 정리했어요.',
    fitQuestion: '감사에 그대로 쓸 수 있나요?',
  },
  tax: {
    service: '세무',
    mailTag: '세무 신고',
    schedule: '신고 일정',
    procedure: '검토 항목',
    procedureHint: '예: 법인세 세무조정',
    defaultProcedure: '관련 신고',
    team: '세무팀',
    engagementExample: '2026 법인세 신고',
    needDef: '해당 자료를 신고 검토에 쓰기 시작하는 날',
    heroSub: '신고 일정에 맞춰 급한 자료부터 정리했어요.',
    fitQuestion: '신고에 그대로 쓸 수 있나요?',
  },
  deal: {
    service: '딜',
    mailTag: '실사',
    schedule: '실사 일정',
    procedure: '실사 영역',
    procedureHint: '예: 재무실사 운전자본 분석',
    defaultProcedure: '관련 실사',
    team: '딜 팀',
    engagementExample: 'Project Alpha 재무실사',
    needDef: '해당 자료를 실사 분석에 쓰기 시작하는 날',
    heroSub: '실사 일정에 맞춰 급한 자료부터 정리했어요.',
    fitQuestion: '실사에 그대로 쓸 수 있나요?',
  },
  advisory: {
    service: '자문',
    mailTag: '자문',
    schedule: '프로젝트 일정',
    procedure: '업무 단계',
    procedureHint: '예: 내부통제 진단',
    defaultProcedure: '관련 업무',
    team: '프로젝트팀',
    engagementExample: '2026 내부회계 자문',
    needDef: '해당 자료를 업무에 쓰기 시작하는 날',
    heroSub: '프로젝트 일정에 맞춰 급한 자료부터 정리했어요.',
    fitQuestion: '업무에 그대로 쓸 수 있나요?',
  },
};

export function termsOf(service) {
  return TERMS[service] || TERMS.audit;
}

export function serviceLabel(key) {
  return SERVICES.find((s) => s.key === key)?.label ?? SERVICES[0].label;
}
