import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sampleDoc, corporateTax } from '../src/js/lib/sampleDocs.js';
import { sampleState, SAMPLE_FILES } from '../src/js/store.js';

const s = sampleState();
const item = (id) => s.items.find((x) => x.id === id);
const doc = (f) => sampleDoc(f.id, item(f.itemId), { ...s.confirmSetup, contactName: item(f.itemId).requester });

test('예시 첨부 3건 모두 문서 내용이 있고, 첨부 정보는 PNG 이미지', () => {
  for (const f of SAMPLE_FILES) {
    assert.ok(doc(f), f.id);
    const meta = item(f.itemId).attachments.find((a) => a.id === f.id);
    assert.equal(meta.name, f.name);
    assert.equal(meta.type, 'image/png');
  }
});

test('은행 회신 예금 합계 = 장부 금액 (회수 완료 건이라 차이 없음)', () => {
  const d = doc(SAMPLE_FILES[0]);
  assert.equal(d.total, item('c2').bookAmount);
  assert.match(d.to, /장재혁 회계사/);
});

test('재고 회신은 수량만, 통지 수량과 보관 수량 일치 · 담당은 요청 감사인', () => {
  const d = doc(SAMPLE_FILES[1]);
  assert.ok(d.lines.every(([, , , a, b]) => a === b));
  assert.doesNotMatch(d.sections[0].cols.join(), /금액/);
  assert.match(d.to, /김서윤 회계사/);
});

test('법인세: 과세표준 → 9%/19% 누진 산출세액 → 차감 납부세액', () => {
  const t = corporateTax({ net: 3120000000, add: 410000000, deduct: 185000000, credit: 42000000, prepaid: 280000000 });
  assert.equal(t.base, 3345000000);
  assert.equal(t.computed, 18000000 + 597550000);
  assert.equal(t.due, 615550000 - 42000000 - 280000000);
  assert.deepEqual(doc(SAMPLE_FILES[2]).tax, t);
});
