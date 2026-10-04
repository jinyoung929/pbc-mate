import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeDate, ownerName, validateItem, parsePaste, rowErrorText,
} from '../src/js/lib/add.js';
import { addItems, baseDateOf, DEMO_DATE } from '../src/js/store.js';
import { sampleState } from './fixtures.js';
import { withDays, isOpen, sortItems, groupByOwner, riskOf } from '../src/js/lib/priority.js';
import { buildMail } from '../src/js/lib/mail.js';

const BASE = '2026-10-01';
const good = {
  name: '재고수불부', ownerName: '김민지', ownerTitle: '대리', dept: '재무팀',
  requestedOn: '2026-09-30', neededOn: '2026-10-07', procedure: '재고 실증', status: 'none',
};

test('normalizeDate: 여러 형식 허용, 잘못된 날짜는 null', () => {
  assert.equal(normalizeDate('2026-09-30', BASE), '2026-09-30');
  assert.equal(normalizeDate('2026.9.30', BASE), '2026-09-30');
  assert.equal(normalizeDate('2026. 9. 30.', BASE), '2026-09-30');
  assert.equal(normalizeDate('2026/09/30', BASE), '2026-09-30');
  assert.equal(normalizeDate('9/30', BASE), '2026-09-30');
  assert.equal(normalizeDate('2026-02-30', BASE), null);
  assert.equal(normalizeDate('어제', BASE), null);
  assert.equal(normalizeDate('', BASE), null);
});

test('ownerName: 이름 + 직함', () => {
  assert.equal(ownerName('김민지', '대리'), '김민지 대리');
  assert.equal(ownerName(' 박준호 ', ''), '박준호');
});

test('한 건 저장값 생성', () => {
  const { errors, value } = validateItem(good, BASE);
  assert.deepEqual(errors, {});
  assert.deepEqual(value.item, {
    name: '재고수불부', owner: '김민지 대리', requestedOn: '2026-09-30', neededOn: '2026-10-07',
    status: 'none', procedure: '재고 실증', nudges: [],
  });
  assert.deepEqual(value.person, { owner: '김민지 대리', dept: '재무팀' });
});

test('필수값 누락·형식 오류는 저장 불가', () => {
  const missing = validateItem({ ...good, name: ' ', ownerName: '', requestedOn: '', neededOn: '' }, BASE);
  assert.equal(missing.value, null);
  assert.deepEqual(Object.keys(missing.errors).sort(), ['name', 'neededOn', 'ownerName', 'requestedOn']);
  const badDate = validateItem({ ...good, requestedOn: '2026-13-01', neededOn: '내일' }, BASE);
  assert.equal(badDate.value, null);
  assert.match(badDate.errors.requestedOn, /형식/);
  assert.match(badDate.errors.neededOn, /형식/);
});

test('새 자료는 항상 미회신으로 시작, 감사 절차는 선택', () => {
  const { value } = validateItem({ ...good, status: undefined, procedure: '' }, BASE);
  assert.equal(value.item.status, 'none');
  assert.equal('procedure' in value.item, false);
  // 상태를 넘겨도 무시한다 (상태는 이후 상태 변경 기능으로)
  assert.equal(validateItem({ ...good, status: 'done' }, BASE).value.item.status, 'none');
});

test('감사 절차가 없으면 메일 근거 문장에 기본 문구를 쓴다', () => {
  const state = sampleState();
  const { value } = validateItem({ ...good, procedure: '' }, BASE);
  const item = withDays({ id: 'x', ...value.item }, BASE);
  const mail = buildMail({ item, person: {}, client: state.client, today: BASE, tone: 'polite' });
  assert.match(mail.segments.map((s) => s.text).join(''), /관련 감사 절차를 시작해야 해서/);
});

test('저장 후 대시보드 반영: 자료 수 증가, 필요일순 정렬, 위험도 계산', () => {
  const before = sampleState();
  const after = addItems(before, [validateItem(good, BASE).value]);
  assert.equal(after.items.length, before.items.length + 1);
  assert.equal(before.items.length, 6, '원래 state는 그대로');

  const added = after.items.at(-1);
  assert.equal(added.id, 'i7');
  const open = sortItems(after.items.map((x) => withDays(x, BASE)).filter(isOpen), 'need');
  assert.deepEqual(open.map((x) => x.name).slice(0, 4),
    ['은행조회서 회신', '재고실사 결과표', '재고수불부', '유형자산 증감내역']);
  const row = open.find((x) => x.id === 'i7');
  assert.equal(row.left, 6);
  assert.equal(row.risk, riskOf(6));
});

test('기존 담당자와 이름이 같으면 같은 카드로 묶인다', () => {
  const after = addItems(sampleState(), [validateItem(good, BASE).value]);
  assert.equal(after.people['김민지 대리'].nudges, 2, '기존 담당자 정보 유지');
  assert.equal(after.people['김민지 대리'].dept, '재무팀');
  const groups = groupByOwner(sortItems(after.items.map((x) => withDays(x, BASE)).filter(isOpen), 'need'));
  assert.equal(groups.find((g) => g.owner === '김민지 대리').items.length, 4);
  assert.equal(groups.length, 3, '담당자 카드 수는 그대로');
});

test('새 담당자는 people에 추가된다', () => {
  const after = addItems(sampleState(), [validateItem({ ...good, ownerName: '이수진', ownerTitle: '사원', dept: '회계팀' }, BASE).value]);
  assert.deepEqual(after.people['이수진 사원'], { dept: '회계팀', nudges: 0, lastNudgedOn: null });
});

test('시연 세션에서는 새 자료도 2026-10-01 기준으로 계산', () => {
  const demo = addItems(sampleState(), [validateItem(good, DEMO_DATE).value]);
  const today = baseDateOf(demo, null, '2026-10-03'); // 실제 날짜가 10/3이어도
  assert.equal(today, DEMO_DATE);
  assert.equal(withDays(demo.items.at(-1), today).left, 6);
  assert.equal(withDays(demo.items[0], today).left, 1, '예시 자료와 같은 기준일');
});

test('일반 세션에서는 실제(또는 주입된) 오늘 기준으로 계산', () => {
  const plain = addItems({ client: { name: 'X' }, people: {}, items: [] }, [validateItem(good, '2026-10-03').value]);
  assert.equal(baseDateOf(plain, null, '2026-10-03'), '2026-10-03');
  assert.equal(withDays(plain.items[0], '2026-10-03').left, 4);
  assert.equal(baseDateOf(plain, '2026-10-05', '2026-10-03'), '2026-10-05', '?today= 우선');
});

const PASTE = [
  '자료명\t담당자\t요청일\t필요일\t감사절차',
  '재고수불부\t김민지 대리\t2026-09-30\t2026-10-07\t재고 실증',
  '매입채무 명세서\t박준호 과장\t2026-09-29\t2026-10-09\t매입채무 검증',
].join('\n');

test('엑셀 붙여넣기: 탭 구분 + 헤더 제거 + 여러 행', () => {
  const p = parsePaste(PASTE, BASE);
  assert.equal(p.headerSkipped, true);
  assert.equal(p.rows.length, 2);
  assert.equal(p.errorCount, 0);
  assert.deepEqual(p.rows.map((r) => r.value.item.name), ['재고수불부', '매입채무 명세서']);
  assert.deepEqual(p.rows[1].value.item, {
    name: '매입채무 명세서', owner: '박준호 과장', requestedOn: '2026-09-29', neededOn: '2026-10-09',
    status: 'none', procedure: '매입채무 검증', nudges: [],
  });
});

test('헤더가 없으면 첫 줄도 자료로 읽는다 · 감사절차 열은 선택', () => {
  const p = parsePaste('재고수불부\t김민지 대리\t9/30\t10/7', BASE);
  assert.equal(p.headerSkipped, false);
  assert.equal(p.rows.length, 1);
  assert.equal(p.rows[0].value.item.neededOn, '2026-10-07');
  assert.equal('procedure' in p.rows[0].value.item, false);
});

test('필수값 누락·형식 오류 행은 오류로 표시', () => {
  const p = parsePaste([
    '재고수불부\t김민지 대리\t2026-09-30\t2026-10-07',
    '\t박준호 과장\t2026-09-29\t2026-10-09',
    '리스 계약 목록\t최도윤 차장\t2026-09-29\t내일',
    '현금 명세서\t이수진 사원',
  ].join('\n'), BASE);
  assert.equal(p.rows.length, 4);
  assert.equal(p.errorCount, 3);
  assert.equal(rowErrorText(p.rows[1].errors), '자료명 없음');
  assert.equal(rowErrorText(p.rows[2].errors), '필요일 형식 오류');
  assert.equal(rowErrorText(p.rows[3].errors), '요청일 없음 · 필요일 없음');
  assert.equal(p.rows[0].value.item.name, '재고수불부');
});

test('빈 줄은 무시한다', () => {
  assert.equal(parsePaste('\n재고수불부\t김민지 대리\t9/30\t10/7\n\n', BASE).rows.length, 1);
  assert.equal(parsePaste('', BASE).rows.length, 0);
});

test('일괄 저장 후 자료 수 증가, 담당자 묶임', () => {
  const p = parsePaste(PASTE, BASE);
  const after = addItems(sampleState(), p.rows.map((r) => r.value));
  assert.equal(after.items.length, 8);
  assert.deepEqual(after.items.slice(-2).map((x) => x.id), ['i7', 'i8']);
  assert.equal(Object.keys(after.people).length, 3, '기존 담당자 2명에게 묶임');
  const groups = groupByOwner(sortItems(after.items.map((x) => withDays(x, BASE)).filter(isOpen), 'need'));
  assert.equal(groups.find((g) => g.owner === '박준호 과장').items.length, 2);
});

test('중복 요청: 자료명이 대시보드와 같으면(띄어쓰기·대소문자 무시) 막는다', async () => {
  const { findExisting, duplicateMessage, markDuplicates } = await import('../src/js/lib/add.js');
  const items = sampleState().items;
  assert.equal(findExisting(items, ' 재고실사  결과표 ').id, 'i3');
  assert.equal(duplicateMessage(items, '재고실사결과표'), '이미 대시보드에 있는 자료예요 (김민지 대리 · 미회신)');
  assert.equal(duplicateMessage(items, '차입금 약정서 사본'), null);
  assert.equal(findExisting(items, ''), undefined);

  const text = ['재고실사 결과표\t김민지 대리\t2026-09-30\t2026-10-07',
    '차입금 약정서\t박준호 과장\t2026-09-30\t2026-10-08',
    '차입금  약정서\t박준호 과장\t2026-09-30\t2026-10-09'].join('\n');
  const parsed = markDuplicates(parsePaste(text, BASE), items);
  assert.equal(parsed.rows[0].value, null);
  assert.equal(parsed.rows[0].errors.duplicate, '이미 있는 자료');
  assert.ok(parsed.rows[1].value, '새 자료는 그대로');
  assert.equal(parsed.rows[2].errors.duplicate, '2행과 중복');
  assert.equal(parsed.errorCount, 2);
  assert.equal(rowErrorText(parsed.rows[0].errors), '이미 있는 자료');
});
