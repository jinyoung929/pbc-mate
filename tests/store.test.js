import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordNudge } from '../src/js/store.js';
import { sampleState } from './fixtures.js';

test('예시 자료에 기존 독촉 이력과 매니저가 들어 있다', () => {
  const s = sampleState();
  assert.deepEqual(s.items.find((x) => x.id === 'i1').nudges, [{ on: '2026-09-30', tone: 'angel' }]);
  assert.deepEqual(s.team.manager, { name: '이서연 매니저', dept: '감사팀' });
});

test('recordNudge: 자료 이력에 날짜·톤 추가, 담당자 독촉 횟수 갱신', () => {
  const before = sampleState();
  const after = recordNudge(before, 'i1', 'polite', '2026-10-01');

  assert.deepEqual(after.items.find((x) => x.id === 'i1').nudges, [
    { on: '2026-09-30', tone: 'angel' },
    { on: '2026-10-01', tone: 'polite' },
  ]);
  assert.equal(after.people['박준호 과장'].nudges, 2);
  assert.equal(after.people['박준호 과장'].lastNudgedOn, '2026-10-01');
  assert.equal(after.people['박준호 과장'].dept, '재무팀');

  // 다른 자료·원래 state는 그대로
  assert.deepEqual(after.items.find((x) => x.id === 'i3'), before.items.find((x) => x.id === 'i3'));
  assert.equal(before.items.find((x) => x.id === 'i1').nudges.length, 1);
  assert.equal(before.people['박준호 과장'].nudges, 1);
});

test('recordNudge: 이력 필드가 없던 예전 자료도 기록된다', () => {
  const s = { people: {}, items: [{ id: 'x', owner: '홍길동 대리' }] };
  const after = recordNudge(s, 'x', 'firm', '2026-10-01');
  assert.deepEqual(after.items[0].nudges, [{ on: '2026-10-01', tone: 'firm' }]);
  assert.equal(after.people['홍길동 대리'].nudges, 1);
});

test('앱 예시 데이터에는 은행조회서가 PBC 자료로 들어가 있지 않다', async () => {
  const { sampleState: appSample } = await import('../src/js/store.js');
  const s = appSample();
  const pbc = s.items.filter((x) => x.kind !== 'confirmation');
  assert.equal(pbc.some((x) => x.name.includes('은행조회서')), false, '은행조회서는 PBC 자료가 아님');
  assert.equal(pbc.length, 5);
  assert.equal(s.people['박준호 과장'].nudges, 0, '독촉 이력도 함께 정리');
});

test('앱 예시 데이터: 외부조회 건은 네 종류와 여러 상태가 섞여 있고 조회처가 담당자', async () => {
  const { sampleState: appSample } = await import('../src/js/store.js');
  const s = appSample();
  const conf = s.items.filter((x) => x.kind === 'confirmation');
  assert.deepEqual([...new Set(conf.map((x) => x.confType))].sort(), ['arap', 'bank', 'inventory', 'legal']);
  assert.deepEqual([...new Set(conf.map((x) => x.status))].sort(), ['done', 'follow', 'none']);
  assert.ok(conf.some((x) => x.follow?.type === 'diff') && conf.some((x) => x.follow?.type === 'noreply'));
  for (const x of conf) {
    assert.equal(x.owner, x.counterparty);
    assert.ok(s.people[x.owner], `${x.owner} 담당자 정보`);
  }
  assert.equal(new Set(s.items.map((x) => x.id)).size, s.items.length, 'id 중복 없음');
  assert.equal(s.confirmSetup.companyName, s.client.name);
});
