import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PBC_TEMPLATES, TEMPLATE_ORDER, templateForName, templateOf, defaultBasisDate,
  requestSheetTsv, requestNote, receiptSuggestion,
} from '../src/js/lib/pbcTemplate.js';

const BASIS = '2026-12-31';

test('양식 4종: 이름·필수 컬럼·작성 예시 칸 수가 맞다', () => {
  assert.deepEqual(TEMPLATE_ORDER.map((k) => PBC_TEMPLATES[k].name),
    ['유형자산 증감내역', '재고실사 결과표', '특수관계자 거래내역', '매출채권 연령분석표']);
  for (const k of TEMPLATE_ORDER) {
    const t = PBC_TEMPLATES[k];
    assert.equal(t.example.length, t.columns.length, k);
    assert.ok(t.checks.length > 0, k);
  }
});

test('자료명으로 양식 찾기: 띄어쓰기·뒤에 붙은 말 허용, 외부조회 건은 제외', () => {
  assert.equal(templateForName('유형자산증감내역').key, 'ppe');
  assert.equal(templateForName('매출채권 연령분석표 (12월말)').key, 'aging');
  assert.equal(templateForName('법인세 신고서 사본'), null);
  assert.equal(templateForName(''), null);
  assert.equal(templateOf({ name: '재고실사 결과표' }).key, 'inventory');
  assert.equal(templateOf({ name: '아무 자료', template: 'related' }).key, 'related');
  assert.equal(templateOf({ kind: 'confirmation', name: '재고실사 결과표' }), null);
});

test('기준일 기본값: 외부조회서 공통 정보 → 없으면 그 해 12/31', () => {
  assert.equal(defaultBasisDate({ confirmSetup: { baseDate: '2026-06-30' } }, '2026-10-01'), '2026-06-30');
  assert.equal(defaultBasisDate({}, '2026-10-01'), '2026-12-31');
});

test('요청 양식: 엑셀에 붙일 3행 표와 메일 한 줄 안내', () => {
  const tsv = requestSheetTsv(PBC_TEMPLATES.ppe, BASIS);
  const rows = tsv.split('\n').map((r) => r.split('\t'));
  assert.equal(rows.length, 3);
  assert.equal(rows[0][0], '유형자산 증감내역 · 기준일 2026-12-31 · 담당 임원 확인란 서명 필요');
  assert.deepEqual(rows[1], PBC_TEMPLATES.ppe.columns);
  assert.equal(rows[2][0], '(예시) 건물');
  assert.match(requestNote(PBC_TEMPLATES.aging, BASIS), /^12월 31일 기준으로, 거래처 · 기말잔액/);
  assert.doesNotMatch(requestNote(PBC_TEMPLATES.aging, BASIS), /서명/, '서명 없는 양식');
});

test('받은 자료 점검: 기준일 상이 > 항목 누락 > 서명 누락 순서로 보완 사유 추천', () => {
  const t = PBC_TEMPLATES.ppe;
  assert.deepEqual(receiptSuggestion(t, { basisOk: false, missing: ['대체'], signOk: false }, BASIS),
    { status: 'fix', reason: 'date', requiredBasisDate: BASIS, summary: '기준일이 12/31이 아니에요. 기준일 상이로 재요청해요.' });
  const miss = receiptSuggestion(t, { basisOk: true, missing: ['대체', '감가상각비'], signOk: false }, BASIS);
  assert.equal(miss.reason, 'missing');
  assert.equal(miss.detail, '대체, 감가상각비');
  const sign = receiptSuggestion(t, { basisOk: true, missing: [], signOk: false }, BASIS);
  assert.deepEqual([sign.status, sign.reason, sign.detail], ['fix', 'sign', '담당 임원 확인란']);
  assert.equal(receiptSuggestion(t, { basisOk: true, missing: [], signOk: true }, BASIS).status, 'done');
});

test('받은 자료 점검: 다 확인하기 전에는 추천하지 않음, 서명 없는 양식은 서명 확인 불필요', () => {
  assert.equal(receiptSuggestion(PBC_TEMPLATES.ppe, { basisOk: true, missing: [], signOk: null }, BASIS).status, null);
  assert.equal(receiptSuggestion(PBC_TEMPLATES.ppe, { basisOk: null, missing: [] }, BASIS).status, null);
  assert.equal(receiptSuggestion(PBC_TEMPLATES.aging, { basisOk: true, missing: [] }, BASIS).status, 'done');
});
