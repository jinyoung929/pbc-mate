import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CONF_TYPES, TYPE_ORDER, defaultSetup, validateSetup, parseAmount, formatAmount,
  parseConfirmations, buildLetters, toRegistryValues, nextDocNo, isConfirmation, longKoreanDate,
} from '../src/js/lib/confirmation.js';
import { addItems } from '../src/js/store.js';
import { sampleState } from './fixtures.js';
import { withDays, groupByOwner, sortItems } from '../src/js/lib/priority.js';
import { buildMail } from '../src/js/lib/mail.js';

const TODAY = '2026-10-04';
const SETUP = {
  companyName: '㈜한빛전자', ceoName: '정한빛', companyAddress: '경기도 성남시 분당구 판교역로 1',
  auditorName: '삼일회계법인', auditorAddress: '서울특별시 용산구 한강대로 100',
  contactName: '장재혁 회계사', contactPhone: '02-0000-0000', contactEmail: '',
  baseDate: '2026-12-31', issuedOn: '2027-01-05', replyBy: '2027-01-19',
};
const valid = () => validateSetup(SETUP, TODAY).value;

test('공통 정보: 기본값은 클라이언트명·올해 결산일·발송 14일 뒤 회신 기한', () => {
  const s = defaultSetup({ name: '㈜한빛전자' }, TODAY);
  assert.equal(s.companyName, '㈜한빛전자');
  assert.equal(s.baseDate, '2026-12-31');
  assert.equal(s.issuedOn, TODAY);
  assert.equal(s.replyBy, '2026-10-18');
  // 1~3월에 열면 직전 연도 결산일
  assert.equal(defaultSetup({}, '2027-02-10').baseDate, '2026-12-31');
});

test('공통 정보: 필수값·연락처·날짜 검증', () => {
  assert.deepEqual(validateSetup(SETUP, TODAY).errors, {});
  const { errors, value } = validateSetup({ ...SETUP, ceoName: ' ', contactPhone: '', replyBy: '2027-01-05' }, TODAY);
  assert.equal(value, null);
  assert.ok(errors.ceoName);
  assert.ok(errors.contactPhone, '전화·이메일 둘 다 없으면 오류');
  assert.equal(errors.replyBy, '회신 기한은 발송일 뒤여야 해요.');
  assert.ok(validateSetup({ ...SETUP, contactEmail: 'abc' }, TODAY).errors.contactEmail);
  assert.ok(validateSetup({ ...SETUP, baseDate: '2026-13-01' }, TODAY).errors.baseDate);
  assert.equal(validateSetup({ ...SETUP, baseDate: '2026.12.31' }, TODAY).value.baseDate, '2026-12-31');
});

test('parseAmount: 콤마·원 허용, 빈칸 null, 문자는 NaN', () => {
  assert.equal(parseAmount('1,250,000,000'), 1250000000);
  assert.equal(parseAmount('3000원'), 3000);
  assert.equal(parseAmount(''), null);
  assert.equal(parseAmount('-'), null);
  assert.ok(Number.isNaN(parseAmount('12억')));
  assert.ok(Number.isNaN(parseAmount('-500')), '음수는 받지 않는다');
  assert.equal(formatAmount(1250000000), '1,250,000,000');
});

test('예시 데이터는 세 종류 모두 오류 없이 읽힌다', () => {
  for (const type of TYPE_ORDER) {
    const parsed = parseConfirmations(type, CONF_TYPES[type].example);
    assert.equal(parsed.errorCount, 0, type);
    assert.equal(parsed.headerSkipped, true, type);
  }
});

test('은행: 금융기관+지점으로 묶어 1곳당 1장', () => {
  const parsed = parseConfirmations('bank', CONF_TYPES.bank.example);
  assert.equal(parsed.rows.length, 4);
  assert.equal(parsed.parties.length, 2);
  const [hanbit] = parsed.parties;
  assert.equal(hanbit.name, '한빛은행');
  assert.equal(hanbit.branch, '여의도지점');
  assert.deepEqual(hanbit.lines, [1, 2, 3]);
  assert.equal(hanbit.entries[2].bookAmount, null, '약정 한도는 금액 없이 허용');
});

test('은행: 구분 오류·주소 누락·주소 불일치', () => {
  const text = [
    '가나은행\t\t서울\t적립식펀드\t1\t100',
    '다라은행\t\t\t예금\t2\t100',
    '마바은행\t본점\t서울 A\t예금\t3\t100',
    '마바은행\t본점\t서울 B\t차입금\t4\t200',
  ].join('\n');
  const parsed = parseConfirmations('bank', text);
  assert.ok(parsed.rows[0].errors.category);
  const byName = Object.fromEntries(parsed.parties.map((p) => [p.name, p]));
  assert.equal(byName['다라은행'].errors.address, '주소 없음');
  assert.equal(byName['마바은행'].errors.address, '같은 조회처에 주소가 여러 개');
  assert.equal(parsed.errorCount, 3);
});

test('채권채무: 거래처 1곳당 1장, 형식 기재/공란, 중복 거래처는 오류', () => {
  const parsed = parseConfirmations('arap', CONF_TYPES.arap.example);
  assert.equal(parsed.parties.length, 3);
  assert.equal(parsed.parties[0].blank, false);
  assert.equal(parsed.parties[2].blank, true);
  assert.equal(parsed.parties[1].payable, 120000000);

  const dup = parseConfirmations('arap', '가\t서울\t100\t\n가\t부산\t200\t\n나\t\t\t\n다\t서울\t1\t2\t보류');
  assert.equal(dup.parties[1].errors.duplicate, '1행과 거래처 중복');
  assert.ok(dup.rows[2].errors.address);
  assert.equal(dup.rows[2].errors.amount, '채권·채무 금액 없음');
  assert.ok(dup.rows[3].errors.form);
  assert.equal(dup.errorCount, 3);
});

test('변호사: 법무법인별로 사건 묶음, 사건 없이도 조회 가능', () => {
  const parsed = parseConfirmations('legal', CONF_TYPES.legal.example);
  assert.equal(parsed.parties.length, 2);
  assert.equal(parsed.parties[0].matters.length, 2);
  assert.equal(parsed.parties[0].lawyer, '김정의 변호사');
  assert.deepEqual(parsed.parties[1].matters, []);
});

test('빈 입력', () => {
  const parsed = parseConfirmations('arap', '  \n');
  assert.equal(parsed.rows.length, 0);
  assert.equal(parsed.parties.length, 0);
  assert.equal(parsed.errorCount, 0);
});

test('조회서: 회사 명의 발신, 감사인 회신처, 문서번호 연번', () => {
  const parties = parseConfirmations('arap', CONF_TYPES.arap.example).parties;
  const letters = buildLetters('arap', parties, valid(), { startNo: 4 });
  assert.deepEqual(letters.map((l) => l.docNo), ['AR-004', 'AR-005', 'AR-006']);
  const [l] = letters;
  assert.equal(l.from.company, '㈜한빛전자');
  assert.equal(l.from.ceo, '정한빛');
  assert.equal(l.replyTo.auditor, '삼일회계법인');
  assert.equal(l.to.name, '㈜대한부품');
  assert.equal(l.replyBy, '2027년 1월 19일');
  assert.ok(l.paragraphs.join(' ').includes('2026년 12월 31일 현재'));
  assert.ok(l.paragraphs.join(' ').includes('회신처(당사 감사인)로 직접 회신'));
  assert.ok(l.notes.some((n) => n.includes('청구나 지급 요청이 아니며')));
});

test('조회서: 공란형에는 장부금액이 들어가지 않는다', () => {
  const parties = parseConfirmations('arap', CONF_TYPES.arap.example).parties;
  const [filled, , blank] = buildLetters('arap', parties, valid());
  assert.ok(filled.table.rows.flat().includes('842,000,000'));
  assert.equal(blank.blank, true);
  assert.ok(!blank.table.rows.flat().some((c) => /\d/.test(c)), '공란형 표에 숫자 없음');
  assert.ok(!JSON.stringify(blank.paragraphs).includes('96,300,000'));

  const bankParties = parseConfirmations('bank', CONF_TYPES.bank.example).parties;
  const [bankBlank] = buildLetters('bank', bankParties, valid(), { bankBlank: true });
  assert.equal(bankBlank.table.columns.length, 3);
  assert.ok(!bankBlank.table.rows.flat().includes('1,250,000,000'));
  const [bankFilled] = buildLetters('bank', bankParties, valid());
  assert.ok(bankFilled.table.rows.flat().includes('1,250,000,000'));
  assert.equal(bankFilled.to.name, '한빛은행 여의도지점');
  assert.ok(bankFilled.notes[0].includes('기재되지 않은'));
});

test('조회서: 변호사 조회는 사건 표와 기본 조회 항목', () => {
  const parties = parseConfirmations('legal', CONF_TYPES.legal.example).parties;
  const [withMatters, without] = buildLetters('legal', parties, valid());
  assert.equal(withMatters.table.rows.length, 2);
  assert.equal(withMatters.to.attn, '김정의 변호사');
  assert.equal(withMatters.requests.length, 3);
  assert.equal(without.table, null);
  assert.ok(without.notes[0].includes('해당 없음'));
});

test('등록: 조회처가 담당자, 발송일→요청일, 회신 기한→필요일, 트랙 지정', () => {
  const setup = valid();
  const bank = buildLetters('bank', parseConfirmations('bank', CONF_TYPES.bank.example).parties, setup);
  const arap = buildLetters('arap', parseConfirmations('arap', CONF_TYPES.arap.example).parties, setup);
  const values = toRegistryValues([...bank, ...arap], setup);
  const [b] = values;
  assert.equal(b.item.kind, 'confirmation');
  assert.equal(b.item.owner, '한빛은행 여의도지점');
  assert.equal(b.item.requestedOn, '2027-01-05');
  assert.equal(b.item.neededOn, '2027-01-19');
  assert.equal(b.item.track, 'required');
  assert.equal(b.item.bookAmount, 4250000000);
  assert.equal(b.item.status, 'none');
  assert.equal(b.person.dept, '금융기관');
  const a = values[2];
  assert.equal(a.item.track, 'coverage');
  assert.equal(a.item.receivable, 842000000);
});

test('등록 후 기존 기능과 함께 동작: 문서번호 이어서, 대시보드 정렬·묶음, 독촉 메일', () => {
  const setup = { ...valid(), issuedOn: '2026-09-28', replyBy: '2026-10-08' };
  let state = sampleState();
  const letters = buildLetters('arap', parseConfirmations('arap', CONF_TYPES.arap.example).parties, setup,
    { startNo: nextDocNo(state.items, 'arap') });
  state = addItems(state, toRegistryValues(letters, setup));
  assert.equal(nextDocNo(state.items, 'arap'), 4);
  assert.equal(nextDocNo(state.items, 'bank'), 1);

  const conf = state.items.filter(isConfirmation);
  assert.equal(conf.length, 3);
  assert.equal(state.items.filter((x) => !isConfirmation(x)).length, 6, '기존 자료는 PBC로 남는다');
  assert.equal(state.people['㈜대한부품'].dept, '거래처');

  const today = '2026-10-01';
  const sorted = sortItems(state.items.map((x) => withDays(x, today)).filter((x) => x.status !== 'done'), 'need');
  assert.ok(groupByOwner(sorted).some((g) => g.owner === '세진물산㈜'));

  const item = withDays(conf[0], today);
  const mail = buildMail({ item, person: state.people[item.owner], client: state.client, today, tone: 'polite' });
  assert.ok(mail.subject.includes('채권채무조회서'));
});

test('longKoreanDate', () => {
  assert.equal(longKoreanDate('2027-01-05'), '2027년 1월 5일');
});

test('재고: 보관처+창고로 묶어 1장, 수량을 확인받고 금액은 적지 않는다', () => {
  const parsed = parseConfirmations('inventory', CONF_TYPES.inventory.example);
  assert.equal(parsed.errorCount, 0);
  assert.equal(parsed.parties.length, 2);
  const [hk] = parsed.parties;
  assert.equal(hk.branch, '평택센터');
  assert.deepEqual(hk.goods.map((g) => g.quantity), [12400, 85000]);

  const [letter] = buildLetters('inventory', parsed.parties, valid());
  assert.equal(letter.docNo, 'IV-001');
  assert.equal(letter.to.name, '㈜한결물류 평택센터');
  assert.deepEqual(letter.table.columns, ['품목', '단위', '당사 장부수량', '귀사 확인수량']);
  assert.ok(letter.table.rows.flat().includes('12,400'));
  assert.ok(!JSON.stringify(letter).includes('1,488,000,000'), '보관처에는 금액을 보내지 않는다');
  assert.ok(letter.reply.statements.some((s) => s.includes('제3자의 권리')));

  const [reg] = toRegistryValues([letter], valid());
  assert.equal(reg.item.track, 'coverage');
  assert.equal(reg.item.bookAmount, 1913000000);
  assert.equal(reg.person.dept, '보관처');
});

test('재고: 품목·수량 누락과 형식 오류', () => {
  const parsed = parseConfirmations('inventory', '가물류\t\t서울\t\t\n나물류\t\t부산\t부품\t열개\n다물류\t\t대구\t부품\t10\tEA\t1억');
  assert.equal(parsed.rows[0].errors.category, '품목 없음');
  assert.equal(parsed.rows[0].errors.amount, '수량 없음');
  assert.equal(parsed.rows[1].errors.amount, '수량 형식 오류');
  assert.equal(parsed.rows[2].errors.amount, '금액 형식 오류');
});

test('트랙: 은행은 필수 회수, 변호사는 일반, 채권채무·재고는 커버리지', () => {
  assert.equal(CONF_TYPES.bank.track, 'required');
  assert.equal(CONF_TYPES.legal.track, 'general');
  assert.equal(CONF_TYPES.arap.track, 'coverage');
  assert.equal(CONF_TYPES.inventory.track, 'coverage');
});
