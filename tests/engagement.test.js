import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateEngagement } from '../src/js/lib/engagement.js';
import { createEmptyState, baseDateOf, addItems } from '../src/js/store.js';
import { validateItem, parsePaste } from '../src/js/lib/add.js';
import { buildMail } from '../src/js/lib/mail.js';
import { withDays } from '../src/js/lib/priority.js';
import { buildReport, summaryLines } from '../src/js/lib/report.js';

test('필수값 누락 검증', () => {
  assert.deepEqual(validateEngagement({ clientName: '', engagement: '' }),
    { clientName: '클라이언트명을 입력해 주세요.', engagement: '감사명을 입력해 주세요.' });
  assert.deepEqual(validateEngagement({ clientName: ' ㈜한빛전자 ', engagement: '2026 기말감사' }), {});
  assert.equal(Object.keys(validateEngagement({ clientName: '㈜한빛전자', engagement: '  ' })).join(), 'engagement');
});

test('빈 state: client·engagement 저장, demoDate 없음, 기존 구조와 호환', () => {
  const s = createEmptyState({ clientName: ' ㈜한빛전자 ', engagement: '2026 기말감사' });
  assert.deepEqual(s.client, { name: '㈜한빛전자', engagement: '2026 기말감사' });
  assert.deepEqual(s.people, {});
  assert.deepEqual(s.items, []);
  assert.equal('demoDate' in s, false);
  assert.equal(s.team.manager, null);
  // 실제 오늘(또는 ?today=) 기준
  assert.equal(baseDateOf(s, null, '2026-10-03'), '2026-10-03');
  assert.equal(baseDateOf(s, '2026-10-05', '2026-10-03'), '2026-10-05');
  // 빈 상태에서 주간 현황·요약이 깨지지 않는다
  assert.deepEqual(summaryLines(buildReport(s, '2026-10-03')), ['아직 집계할 자료가 없어요.']);
});

test('직접 추가 경로: 빈 state에 한 건 추가 → 매니저 없이도 메일 생성', () => {
  const s = createEmptyState({ clientName: '㈜테스트', engagement: '2026 반기검토' });
  const { value } = validateItem({
    name: '매출 명세서', ownerName: '이수진', ownerTitle: '사원', requestedOn: '2026-10-03', neededOn: '2026-10-10',
  }, '2026-10-03');
  const after = addItems(s, [value]);
  assert.equal(after.items.length, 1);
  assert.equal(after.items[0].id, 'i1');
  assert.equal(after.items[0].status, 'none');
  const mail = buildMail({ item: withDays(after.items[0], '2026-10-03'), person: after.people['이수진 사원'], client: s.client, manager: s.team.manager, today: '2026-10-03', tone: 'cc' });
  assert.equal(mail.cc.name, '[매니저]');
  assert.match(mail.subject, /^\[테스트 감사\]/);
});

test('붙여넣기 경로: 빈 state에 여러 건 추가', () => {
  const s = createEmptyState({ clientName: '㈜테스트', engagement: '2026 반기검토' });
  const parsed = parsePaste('재고수불부\t김민지 대리\t2026-10-01\t2026-10-08\n매입채무 명세서\t박준호 과장\t2026-10-01\t2026-10-09', '2026-10-03');
  assert.equal(parsed.errorCount, 0);
  const after = addItems(s, parsed.rows.map((r) => r.value));
  assert.equal(after.items.length, 2);
  assert.deepEqual(Object.keys(after.people), ['김민지 대리', '박준호 과장']);
  assert.ok(after.items.every((x) => x.status === 'none'));
});
