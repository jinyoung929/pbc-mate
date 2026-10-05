import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ENGAGEMENTS, searchEngagements, engagementById, validateStart, teamFromEngagement } from '../src/js/lib/engagements.js';

test('클라이언트명 조회: 일부만, ㈜·띄어쓰기 무시', () => {
  assert.deepEqual(searchEngagements('한빛').map((e) => e.id), ['e1', 'e2']);
  assert.deepEqual(searchEngagements('(주)한빛 전자').map((e) => e.id), ['e1', 'e2']);
  assert.deepEqual(searchEngagements('동해에너지').map((e) => e.engagement), ['2026 기말감사']);
  assert.deepEqual(searchEngagements(''), []);
  assert.deepEqual(searchEngagements('없는회사'), []);
});

test('시작 검증: 계약 선택과 내 이름', () => {
  const e = validateStart({ selectedId: null, myName: '' });
  assert.ok(e.client && e.myName);
  assert.deepEqual(validateStart({ selectedId: 'e1', myName: '장재혁' }), {});
});

test('팀 구성: 팀원에 있으면 그 사람, 이름만 넣어도 찾고, 없으면 맨 앞에 더함', () => {
  const e1 = engagementById('e1');
  assert.deepEqual(teamFromEngagement(e1, '장재혁', '회계사'), {
    manager: { name: '이서연 매니저', dept: '감사팀' },
    members: ['장재혁 회계사', '김서윤 회계사', '이서연 매니저'],
    me: '장재혁 회계사',
  });
  assert.equal(teamFromEngagement(e1, '김서윤', '').me, '김서윤 회계사', '이름만 넣어도 팀원으로');
  assert.equal(teamFromEngagement(e1, '이서연', '매니저').me, '이서연 매니저', '매니저 본인');
  const newbie = teamFromEngagement(e1, '홍길동', '수습회계사');
  assert.equal(newbie.me, '홍길동 수습회계사');
  assert.deepEqual(newbie.members, ['홍길동 수습회계사', '장재혁 회계사', '김서윤 회계사', '이서연 매니저']);
  assert.ok(ENGAGEMENTS.every((x) => x.client && x.engagement && x.manager && x.members.length));
});
