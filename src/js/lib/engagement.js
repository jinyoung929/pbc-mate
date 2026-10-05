// 첫 실행에서 예시 자료 없이 시작할 때 받는 최소 정보: 클라이언트명 · 감사명

export function validateEngagement({ clientName, engagement }) {
  const errors = {};
  if (!String(clientName ?? '').trim()) errors.clientName = '클라이언트명을 입력해 주세요.';
  if (!String(engagement ?? '').trim()) errors.engagement = '감사명을 입력해 주세요.';
  return errors;
}
