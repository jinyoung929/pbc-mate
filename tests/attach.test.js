import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatSize, checkFiles, addAttachments, removeAttachment, newFileId, MAX_FILE_BYTES } from '../src/js/lib/attach.js';

test('formatSize', () => {
  assert.equal(formatSize(512), '512B');
  assert.equal(formatSize(1536), '1.5KB');
  assert.equal(formatSize(204800), '200KB');
  assert.equal(formatSize(3 * 1024 * 1024), '3.0MB');
});

test('checkFiles: 빈 파일·용량 초과·같은 이름은 뺀다', () => {
  const existing = [{ id: 'f1', name: '회신서.pdf' }];
  const { ok, rejected } = checkFiles([
    { name: '재고실사표.xlsx', size: 2048 },
    { name: '빈파일.txt', size: 0 },
    { name: '큰파일.zip', size: MAX_FILE_BYTES + 1 },
    { name: '회신서.pdf', size: 100 },
    { name: '재고실사표.xlsx', size: 4096 },
  ], existing);
  assert.deepEqual(ok.map((f) => f.name), ['재고실사표.xlsx']);
  assert.deepEqual(rejected.map((r) => [r.name, r.reason]), [
    ['빈파일.txt', '빈 파일'], ['큰파일.zip', '20.0MB 초과'], ['회신서.pdf', '이미 첨부한 파일'], ['재고실사표.xlsx', '이미 첨부한 파일'],
  ]);
});

test('첨부 목록 더하기·빼기는 원래 자료를 바꾸지 않는다', () => {
  const item = { id: 'i3', name: '재고실사 결과표' };
  const a = addAttachments(item, [{ id: 'f1', name: 'a.pdf' }, { id: 'f2', name: 'b.xlsx' }]);
  assert.equal(item.attachments, undefined);
  assert.deepEqual(a.attachments.map((x) => x.id), ['f1', 'f2']);
  assert.deepEqual(removeAttachment(a, 'f1').attachments.map((x) => x.id), ['f2']);
  assert.deepEqual(removeAttachment(item, 'f1').attachments, []);
});

test('newFileId: 같은 시각이어도 순번으로 구분', () => {
  assert.notEqual(newFileId(1000, 0), newFileId(1000, 1));
  assert.match(newFileId(), /^f[0-9a-z]+$/);
});

test('previewKind: 이미지·PDF·텍스트는 미리보기, 엑셀·워드는 지원 안 함', async () => {
  const { previewKind } = await import('../src/js/lib/attach.js');
  assert.equal(previewKind('서명본.PDF'), 'pdf');
  assert.equal(previewKind('scan.jpg'), 'image');
  assert.equal(previewKind('x', 'image/png'), 'image');
  assert.equal(previewKind('회신(예시).txt'), 'text');
  assert.equal(previewKind('목록.csv'), 'text');
  assert.equal(previewKind('연령분석표.xlsx'), 'none');
  assert.equal(previewKind('계약서.docx'), 'none');
});
