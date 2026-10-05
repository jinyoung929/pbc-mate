// 감사 계약 조회: 첫 화면에서 클라이언트명으로 조회해 감사명·팀원·담당 매니저를 불러온다.
// 실제로는 법인 시스템에서 가져와야 하지만, 서버가 없는 프로토타입이라 가상의 계약 목록을 둔다.
// (연결할 때는 searchEngagements만 바꾸면 된다.)

export const ENGAGEMENTS = [
  { id: 'e1', client: '㈜한빛전자', engagement: '2026 기말감사', manager: '이서연 매니저', members: ['장재혁 회계사', '김서윤 회계사'] },
  { id: 'e2', client: '㈜한빛전자', engagement: '2026 반기검토', manager: '이서연 매니저', members: ['김서윤 회계사', '박도윤 회계사'] },
  { id: 'e3', client: '동해에너지㈜', engagement: '2026 기말감사', manager: '최민준 매니저', members: ['정하늘 회계사', '오지훈 회계사', '장재혁 회계사'] },
  { id: 'e4', client: '㈜새봄바이오', engagement: '2026 기말감사', manager: '강태오 매니저', members: ['한유진 회계사', '윤가람 회계사'] },
  { id: 'e5', client: '한결유통㈜', engagement: '2026 내부회계관리제도 감사', manager: '이서연 매니저', members: ['박도윤 회계사', '서민재 회계사'] },
  { id: 'e6', client: '㈜미래모빌리티', engagement: '2026 기말감사', manager: '최민준 매니저', members: ['오지훈 회계사', '윤가람 회계사'] },
];

/** '㈜한빛전자' → '한빛전자' (㈜·(주)·주식회사·띄어쓰기 무시) */
const key = (s) => String(s ?? '').replace(/㈜|\(주\)|주식회사|\s+/g, '').toLowerCase();

/** 클라이언트명 일부로 조회. 빈 검색어면 빈 목록. */
export function searchEngagements(query, list = ENGAGEMENTS) {
  const q = key(query);
  return q ? list.filter((e) => key(e.client).includes(q)) : [];
}

export function engagementById(id, list = ENGAGEMENTS) {
  return list.find((e) => e.id === id) || null;
}

/** 시작 검증: 조회한 계약을 골랐는지, 내 이름을 넣었는지 */
export function validateStart({ selectedId, myName }) {
  const errors = {};
  if (!engagementById(selectedId)) errors.client = '클라이언트명으로 조회한 뒤 감사 계약을 골라 주세요.';
  if (!String(myName ?? '').trim()) errors.myName = '내 이름을 입력해 주세요. 요청 감사인과 메일 서명에 들어가요.';
  return errors;
}

/**
 * 고른 계약 + 내 이름·직급 → state.team.
 * 내 이름이 팀원 목록에 있으면(직급 없이 이름만 넣어도) 그 사람으로, 없으면 맨 앞에 더한다.
 * 매니저는 팀원 맨 뒤.
 */
export function teamFromEngagement(eng, myName, myTitle) {
  const name = String(myName ?? '').trim().replace(/\s+/g, ' ');
  const title = String(myTitle ?? '').trim();
  const label = [name, title].filter(Boolean).join(' ');
  const pool = [...eng.members, eng.manager];
  const found = pool.find((m) => m === label) || pool.find((m) => m.split(' ')[0] === name && (!title || m === label));
  const me = found || label;
  const members = [...new Set([me, ...eng.members, eng.manager])];
  return { manager: { name: eng.manager, dept: '감사팀' }, members, me };
}
