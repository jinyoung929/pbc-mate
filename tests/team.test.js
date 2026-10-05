import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  memberLabel, parseMembers, validateTeam, buildTeam, teamMembers, currentUser, switchUser,
  filterByRequester, requesterSummary, signMail, requesterMembers, isManager, defaultRequester, pickRequester,
} from '../src/js/lib/team.js';
import { sampleState, createEmptyState } from '../src/js/store.js';
import { buildMail } from '../src/js/lib/mail.js';
import { withDays } from '../src/js/lib/priority.js';
import { buildReport } from '../src/js/lib/report.js';

const TODAY = '2026-10-01';

test('팀원 입력: 이름+직급, 쉼표·줄바꿈 구분, 중복 제거', () => {
  assert.equal(memberLabel(' 장재혁 ', '회계사'), '장재혁 회계사');
  assert.equal(memberLabel('장재혁', ''), '장재혁');
  assert.deepEqual(parseMembers('김서윤 회계사, 이서연  매니저\n김서윤 회계사,'), ['김서윤 회계사', '이서연 매니저']);
  assert.ok(validateTeam({ myName: ' ' }).myName);
  assert.deepEqual(validateTeam({ myName: '장재혁' }), {});
});

test('buildTeam: 나는 맨 앞, 매니저는 팀원에도 포함', () => {
  const t = buildTeam({ myName: '장재혁', myTitle: '회계사', members: '김서윤 회계사', manager: '이서연 매니저' });
  assert.equal(t.me, '장재혁 회계사');
  assert.deepEqual(t.members, ['장재혁 회계사', '김서윤 회계사', '이서연 매니저']);
  assert.deepEqual(t.manager, { name: '이서연 매니저', dept: '감사팀' });
  assert.equal(buildTeam({ myName: '장재혁' }).manager, null);
  const s = createEmptyState({ clientName: '㈜테스트', engagement: '2026 기말감사', team: t });
  assert.equal(currentUser(s), '장재혁 회계사');
});

test('예전 데이터(팀 정보 없음)도 깨지지 않는다', () => {
  const old = createEmptyState({ clientName: '㈜테스트', engagement: '2026 기말감사' });
  assert.deepEqual(teamMembers(old), []);
  assert.equal(currentUser(old), '');
  assert.equal(switchUser(old, '누구'), old);
});

test('예시 자료: 팀원 3명, 모든 자료에 요청 감사인', () => {
  const s = sampleState();
  assert.deepEqual(teamMembers(s), ['장재혁 회계사', '김서윤 회계사', '이서연 매니저']);
  assert.equal(currentUser(s), '장재혁 회계사');
  assert.ok(s.items.every((x) => teamMembers(s).includes(x.requester)), '요청 감사인이 모두 팀원');
  assert.equal(currentUser(switchUser(s, '김서윤 회계사')), '김서윤 회계사');
  assert.equal(currentUser(switchUser(s, '외부인')), '장재혁 회계사');
});

test('요청 감사인 필터: 전체 / 내 요청 / 팀원', () => {
  const s = sampleState();
  const me = currentUser(s);
  assert.equal(filterByRequester(s.items, 'all', me).length, s.items.length);
  const mine = filterByRequester(s.items, 'me', me);
  assert.ok(mine.length > 0 && mine.every((x) => x.requester === me));
  assert.deepEqual(filterByRequester(s.items, '이서연 매니저', me), [], '매니저는 요청하지 않는다');
});

test('감사인별 현황: 팀원 순서, 미완료·긴급·완료, 미지정은 따로', () => {
  const s = sampleState();
  const rows = buildReport(s, TODAY).rows.map((r) => ({ ...r, requester: s.items.find((x) => x.id === r.id).requester }));
  const sum = requesterSummary(rows, requesterMembers(s));
  assert.deepEqual(sum.map((r) => r.name), ['장재혁 회계사', '김서윤 회계사'], '매니저는 감사인별 현황에서 빠짐');
  const total = sum.reduce((n, r) => n + r.total, 0);
  assert.equal(total, s.items.length);
  const withUnassigned = requesterSummary([...rows, { ...rows[0], id: 'x', requester: undefined }], requesterMembers(s));
  assert.equal(withUnassigned.at(-1).name, '미지정');
});

test('메일 서명: [이름]을 보내는 사람으로, 이름이 없으면 그대로', () => {
  const s = sampleState();
  const item = withDays(s.items.find((x) => x.id === 'i3'), TODAY);
  const mail = buildMail({ item, person: s.people[item.owner], client: s.client, today: TODAY, tone: 'polite' });
  const signed = signMail(mail, '장재혁 회계사');
  const text = signed.segments.map((x) => x.text).join('');
  assert.match(text, /장재혁 회계사 드림$/);
  assert.doesNotMatch(text, /\[이름\]/);
  assert.equal(signMail(mail, ''), mail);
  assert.match(mail.segments.map((x) => x.text).join(''), /\[이름\] 드림$/, '원래 메일은 그대로');
  const bundle = signMail({ intro: [{ text: 'a' }], rows: [], outro: [{ text: '감사합니다.\n[이름] 드림' }] }, '김서윤 회계사');
  assert.equal(bundle.outro[0].text, '감사합니다.\n김서윤 회계사 드림');
});

test('매니저: 요청 감사인에서 빠지고, 매니저로 바꾸면 새 요청의 감사인은 비워 둔다', () => {
  const s = sampleState();
  assert.deepEqual(requesterMembers(s), ['장재혁 회계사', '김서윤 회계사']);
  assert.equal(isManager(s), false);
  assert.equal(defaultRequester(s), '장재혁 회계사');
  const mgr = switchUser(s, '이서연 매니저');
  assert.equal(isManager(mgr), true);
  assert.equal(defaultRequester(mgr), '');
  assert.ok(s.items.every((x) => x.requester !== '이서연 매니저'), '예시에 매니저가 요청한 자료 없음');
});

test('일정 범위: 회계사는 자기 자료·자기 일정·팀 공통 일정만, 매니저는 전체', async () => {
  const { calendarScope } = await import('../src/js/lib/team.js');
  const s = sampleState();
  const me = calendarScope(s);
  assert.equal(me.scope, 'mine');
  assert.ok(me.items.length > 0 && me.items.every((x) => x.requester === '장재혁 회계사'));
  assert.deepEqual(me.events.map((e) => e.id), ['e1', 'e2', 'e3'], '김서윤의 e4는 빠지고 공통 e2는 보임');
  const kim = calendarScope(switchUser(s, '김서윤 회계사'));
  assert.deepEqual(kim.events.map((e) => e.id), ['e2', 'e4']);
  assert.ok(kim.items.every((x) => x.requester === '김서윤 회계사'));
  const mgr = calendarScope(switchUser(s, '이서연 매니저'));
  assert.equal(mgr.scope, 'all');
  assert.equal(mgr.items.length, s.items.length);
  assert.equal(mgr.events.length, s.events.length);
  // 팀 정보 없는 예전 데이터는 전체
  assert.equal(calendarScope({ items: s.items, events: [] }).scope, 'all');
});

test('실무진 후보에서 고르기: 후보에 있으면 그대로, 없으면 지금 쓰는 사람 → 첫 실무진', () => {
  const s = sampleState();
  assert.equal(pickRequester(s, '김서윤 회계사'), '김서윤 회계사');
  assert.equal(pickRequester(s, '이서연 매니저'), '장재혁 회계사', '매니저는 후보가 아님');
  assert.equal(pickRequester(s, ''), '장재혁 회계사');
  const asMgr = switchUser(s, '이서연 매니저');
  assert.equal(pickRequester(asMgr, '박모르는 회계사'), requesterMembers(asMgr)[0]);
  assert.equal(pickRequester({ items: [] }, '홍길동'), '홍길동', '팀 정보 없으면 그대로');
});
