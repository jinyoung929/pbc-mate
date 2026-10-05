// 팀 단위 사용: 감사팀원 목록과 '지금 쓰는 사람'을 두고, 자료마다 요청 감사인(requester)을 기록한다.
//   state.team = { manager: { name, dept } | null, members: ['장재혁 회계사', …], me: '장재혁 회계사' }
//   item.requester = '장재혁 회계사'
// 데이터는 브라우저마다 따로 저장되므로, 같은 화면에서 사용자를 바꿔 보는 방식으로 팀 사용을 보여준다.

const clean = (s) => String(s ?? '').trim().replace(/\s+/g, ' ');

/** '장재혁', '회계사' → '장재혁 회계사' */
export function memberLabel(name, title) {
  return [clean(name), clean(title)].filter(Boolean).join(' ');
}

/** '김서윤 회계사, 이서연 매니저\n박도윤' → ['김서윤 회계사', '이서연 매니저', '박도윤'] (중복 제거) */
export function parseMembers(text) {
  return [...new Set(String(text ?? '').split(/[,\n]/).map(clean).filter(Boolean))];
}

/** 첫 화면의 감사인 정보 검증. 내 이름만 필수. */
export function validateTeam({ myName }) {
  const errors = {};
  if (!clean(myName)) errors.myName = '내 이름을 입력해 주세요. 요청 감사인과 메일 서명에 들어가요.';
  return errors;
}

/**
 * 첫 화면 입력 → state.team. 나는 항상 팀원 맨 앞, 매니저가 있으면 팀원에도 넣는다.
 * @returns {{ manager, members, me }}
 */
export function buildTeam({ myName, myTitle, members, manager }) {
  const me = memberLabel(myName, myTitle);
  const mgr = clean(manager);
  const list = [...new Set([me, ...parseMembers(members), ...(mgr ? [mgr] : [])].filter(Boolean))];
  return { manager: mgr ? { name: mgr, dept: '감사팀' } : null, members: list, me };
}

/** 팀원 목록. 예전 데이터처럼 팀 정보가 없으면 빈 목록. */
export function teamMembers(state) {
  const t = state?.team || {};
  const list = t.members?.length ? t.members : t.me ? [t.me] : [];
  return [...list];
}

export function currentUser(state) {
  return state?.team?.me || '';
}

/** 담당 매니저 이름 (없으면 '') */
export function managerName(state) {
  return state?.team?.manager?.name || '';
}

/** 지금 쓰는 사람이 담당 매니저인지. 매니저는 자료를 직접 요청하지 않고 팀 전체를 본다. */
export function isManager(state) {
  const me = currentUser(state);
  return Boolean(me) && me === managerName(state);
}

/** 요청 감사인이 될 수 있는 팀원: 매니저를 뺀 실무진 */
export function requesterMembers(state) {
  const mgr = managerName(state);
  return teamMembers(state).filter((m) => m !== mgr);
}

/** 새 자료의 요청 감사인 기본값: 지금 쓰는 사람이 실무진이면 그 사람, 매니저면 비워 둔다 */
export function defaultRequester(state) {
  return isManager(state) ? '' : currentUser(state);
}

/**
 * 실무진 후보 중에서 고른 사람: 후보에 있으면 그대로, 아니면 지금 쓰는 사람(실무진일 때), 그것도 아니면 첫 실무진.
 * 팀 정보가 없으면 받은 이름을 그대로 둔다. (외부조회서 회신처 담당자 기본값 등에 쓴다)
 */
export function pickRequester(state, name) {
  const members = requesterMembers(state);
  if (!members.length) return name || '';
  if (members.includes(name)) return name;
  return defaultRequester(state) || members[0];
}

/** 다른 팀원으로 바꾼 새 state (팀원 목록에 있는 사람만) */
export function switchUser(state, name) {
  return teamMembers(state).includes(name) ? { ...state, team: { ...state.team, me: name } } : state;
}

/**
 * 요청 감사인으로 거르기.
 * who: 'all' | 'me' | 팀원 이름. 'me'는 지금 쓰는 사람.
 */
export function filterByRequester(items, who, me) {
  if (!who || who === 'all') return items;
  const name = who === 'me' ? me : who;
  return items.filter((x) => x.requester === name);
}

/**
 * 감사인별 현황 (주간 보고). 팀원 순서대로, 요청 감사인이 비어 있는 자료는 '미지정'으로.
 * @param rows 주간 보고 행(withDays가 적용된 상태·남은 날·위험도 포함) + requester
 */
export function requesterSummary(rows, members) {
  const names = [...members];
  if (rows.some((r) => !r.requester)) names.push('');
  return names.map((name) => {
    const mine = rows.filter((r) => (r.requester || '') === name);
    const open = mine.filter((r) => r.status !== 'done');
    const nearest = [...open].sort((a, b) => a.left - b.left)[0];
    return {
      name: name || '미지정',
      key: name,
      total: mine.length,
      open: open.length,
      urgent: open.filter((r) => r.risk === 'late' || r.risk === 'high').length,
      done: mine.length - open.length,
      nearest: nearest ? { neededOn: nearest.neededOn, left: nearest.left } : null,
    };
  }).filter((r) => r.total > 0 || r.key);
}

/** 메일 서명 '[이름] 드림'을 보내는 사람 이름으로. 이름이 없으면 그대로 둔다. */
export function signMail(mail, signer) {
  if (!signer) return mail;
  const sign = (segs) => segs?.map((s) => (s.text.includes('[이름]') ? { ...s, text: s.text.replaceAll('[이름]', signer) } : s));
  return {
    ...mail,
    ...(mail.segments && { segments: sign(mail.segments) }),
    ...(mail.intro && { intro: sign(mail.intro) }),
    ...(mail.outro && { outro: sign(mail.outro) }),
  };
}

/**
 * 일정 탭에 보일 범위. 회계사는 자기가 요청한(담당하는) 자료의 필요일과 자기 일정만,
 * 매니저(또는 팀 정보가 없는 예전 데이터)는 전체.
 * 사용자 일정: 만든 사람(by)이 나이거나, 내 자료에 연결된 일정이거나, 만든 사람이 없는 팀 공통 일정.
 * @returns {{ items, events, scope: 'all'|'mine', me }}
 */
export function calendarScope(state) {
  const me = currentUser(state);
  if (!me || isManager(state) || !teamMembers(state).length) {
    return { items: state.items, events: state.events || [], scope: 'all', me };
  }
  const items = state.items.filter((x) => x.requester === me);
  const mine = new Set(items.map((x) => x.id));
  const events = (state.events || []).filter((e) => !e.by || e.by === me || (e.itemId && mine.has(e.itemId)));
  return { items, events, scope: 'mine', me };
}
