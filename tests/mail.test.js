import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMail, mailBody, mailToText, clientShortName } from '../src/js/lib/mail.js';
import { sampleState, DEMO_DATE } from './fixtures.js';

const state = sampleState();
const bank = state.items.find((x) => x.id === 'i1');
const mailFor = (tone, item = bank, today = DEMO_DATE) => buildMail({
  item, person: state.people[item.owner], client: state.client,
  manager: state.team.manager, today, tone,
});

test('clientShortName', () => {
  assert.equal(clientShortName('㈜한빛전자'), '한빛전자');
  assert.equal(clientShortName('(주)삼일상사'), '삼일상사');
});

test('정중: 레퍼런스와 같은 제목·본문 흐름', () => {
  const m = mailFor('polite');
  assert.equal(m.subject, '[한빛전자 감사] 은행조회서 회신 요청 (10/2 필요)');
  assert.equal(mailBody(m),
    '박준호 과장님, 안녕하세요.\n\n9월 28일 요청드린 은행조회서 회신 건 확인 부탁드립니다. '
    + '감사 일정상 내일(10/2) 은행 조회 절차를 시작해야 해서, 오늘 중 회신 여부만이라도 알려주시면 큰 도움이 되겠습니다.'
    + '\n\n감사합니다.\n[이름] 드림');
  assert.equal(m.cc, null);
  assert.deepEqual(m.to, { name: '박준호 과장', dept: '재무팀' });
});

test('톤마다 제목과 본문이 실제로 달라진다', () => {
  const tones = ['angel', 'polite', 'firm', 'cc'];
  const subjects = new Set(tones.map((t) => mailFor(t).subject));
  const bodies = new Set(tones.map((t) => mailBody(mailFor(t))));
  assert.equal(subjects.size, 4);
  assert.equal(bodies.size, 4);
  assert.equal(mailFor('firm').subject, '[한빛전자 감사] 은행조회서 회신 요청 — 오늘 18시까지');
  assert.match(mailBody(mailFor('firm')), /은행조회서 회신이 아직 확인되지 않았습니다/);
  assert.match(mailBody(mailFor('angel')), /편하실 때/);
});

test('매니저 참조 단계에서만 CC가 생기고 관련 문구가 들어간다', () => {
  const m = mailFor('cc');
  assert.deepEqual(m.cc, { name: '이서연 매니저', dept: '감사팀' });
  assert.equal(m.subject, '[한빛전자 감사] 은행조회서 회신 일정 협의 요청');
  assert.match(mailBody(m), /매니저님을 참조로 함께 드립니다/);
  for (const t of ['angel', 'polite', 'firm']) assert.equal(mailFor(t).cc, null);
});

test('모든 톤에 필요일 기반 일정 근거 문장이 들어간다', () => {
  for (const t of ['angel', 'polite', 'firm', 'cc']) {
    const reason = mailFor(t).segments.filter((s) => s.kind === 'reason').map((s) => s.text).join('');
    assert.match(reason, /감사 일정상/, t);
    assert.match(reason, /은행 조회 절차/, t);
  }
});

test('필요일이 멀면 회신 기한을 필요일 2일 전으로 잡는다', () => {
  const ar = state.items.find((x) => x.id === 'i5'); // 필요일 10/20
  assert.equal(mailFor('firm', ar).subject, '[한빛전자 감사] 매출채권 연령분석표 요청 — 10/18까지');
  assert.match(mailBody(mailFor('polite', ar)), /감사 일정상 10월 20일 채권 평가 절차를 시작해야 해서, 10\/18까지/);
});

test('필요일이 지나면 늦어지고 있다는 근거로 바뀐다', () => {
  const m = mailFor('polite', bank, '2026-10-04');
  assert.match(mailBody(m), /10월 2일에 시작했어야 할 은행 조회 절차가 늦어지고 있어서, 오늘 중/);
});

test('일부 수령 자료는 남은 자료 기준으로 쓴다', () => {
  const rp = state.items.find((x) => x.id === 'i4');
  assert.match(mailBody(mailFor('firm', rp)), /특수관계자 거래내역 중 아직 받지 못한 자료가 있습니다/);
});

test('mailToText: 제목·받는 사람·참조를 맨 위에, 발송 표현 없음', () => {
  const text = mailToText(mailFor('cc'));
  assert.ok(text.startsWith('제목: [한빛전자 감사] 은행조회서 회신 일정 협의 요청\n받는 사람: 박준호 과장\n참조: 이서연 매니저\n\n박준호 과장님'));
  assert.ok(!mailToText(mailFor('polite')).includes('참조:'));
});
