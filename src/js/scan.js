// 예시 첨부 문서를 스캔본처럼 그려 PNG Blob으로 만든다 (브라우저 전용, canvas).
// 내용은 lib/sampleDocs.js. 미리 만든 이미지를 넣지 않아 배포 파일이 커지지 않는다.

const W = 1240;           // A4 150dpi 폭
const H = 1754;
const M = 110;            // 좌우 여백
const INK = '#23262b';
const SERIF = "'Noto Serif KR', 'Noto Serif CJK KR', 'Batang', 'AppleMyungjo', serif";
const SANS = "'Noto Sans KR', 'Noto Sans CJK KR', 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif";

// 같은 결과가 나오게 고정 시드 난수 (스캔 얼룩·점)
function rng(seed) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

function font(px, { bold = false, serif = true } = {}) {
  return `${bold ? '700' : '400'} ${px}px ${serif ? SERIF : SANS}`;
}

function text(ctx, str, x, y, { px = 22, bold = false, align = 'left', color = INK, serif = true } = {}) {
  ctx.font = font(px, { bold, serif });
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(str, x, y);
}

// 칸 폭을 글자 길이에 맞춰 나눈다 (금액 칸은 오른쪽 정렬)
function table(ctx, { cols, rows, total }, y) {
  const all = [cols, ...rows, ...(total ? [total] : [])];
  ctx.font = font(20);
  const need = cols.map((_, i) => Math.max(...all.map((r) => ctx.measureText(String(r[i] ?? '')).width)) + 28);
  const sum = need.reduce((a, b) => a + b, 0);
  const width = W - M * 2;
  const widths = need.map((n) => (n / sum) * width);
  const rowH = 44;
  const isNum = (v) => /^-?[\d,]+$/.test(String(v)) || /%$/.test(String(v));
  ctx.strokeStyle = '#4b4f55';
  ctx.lineWidth = 1.2;
  all.forEach((r, ri) => {
    const top = y + ri * rowH;
    const head = ri === 0;
    const foot = total && ri === all.length - 1;
    if (head || foot) { ctx.fillStyle = 'rgba(60,64,70,0.07)'; ctx.fillRect(M, top, width, rowH); }
    let x = M;
    r.forEach((v, ci) => {
      const s = String(v ?? '');
      const right = !head && ci > 0 && isNum(s);
      text(ctx, s, right ? x + widths[ci] - 14 : (head ? x + widths[ci] / 2 : x + 14), top + rowH / 2,
        { px: 20, bold: head || foot, align: right ? 'right' : (head ? 'center' : 'left') });
      ctx.strokeRect(x, top, widths[ci], rowH);
      x += widths[ci];
    });
  });
  ctx.lineWidth = 2;
  ctx.strokeRect(M, y, width, all.length * rowH);
  return y + all.length * rowH;
}

// 붉은 원형 직인
function stamp(ctx, lines, cx, cy, r = 66) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.12);
  ctx.globalAlpha = 0.78;
  ctx.strokeStyle = '#c8322b';
  ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, r - 9, 0, Math.PI * 2); ctx.stroke();
  const step = 25;
  lines.forEach((l, i) => text(ctx, l, 0, (i - (lines.length - 1) / 2) * step, { px: l.length > 3 ? 18 : 21, bold: true, align: 'center', color: '#c8322b' }));
  ctx.restore();
}

// 전자신고 접수 도장 (사각)
function receipt(ctx, lines, x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(0.04);
  ctx.globalAlpha = 0.75;
  ctx.strokeStyle = '#2f55a4';
  ctx.lineWidth = 3;
  ctx.strokeRect(0, 0, 300, 112);
  lines.forEach((l, i) => text(ctx, l, 150, 26 + i * 32, { px: i === 0 ? 24 : 18, bold: i === 0, align: 'center', color: '#2f55a4', serif: false }));
  ctx.restore();
}

function drawDoc(ctx, doc) {
  let y = 120;
  if (doc.docNo) text(ctx, `No. ${doc.docNo}`, W - M, y - 30, { px: 18, align: 'right', color: '#5b6068', serif: false });
  text(ctx, doc.title, W / 2, y + 20, { px: 40, bold: true, align: 'center' });
  y += 70;
  ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(M, y); ctx.lineTo(W - M, y); ctx.stroke();
  y += 46;
  if (doc.to) { text(ctx, doc.to, M, y, { px: 23, bold: true }); y += 50; }
  for (const [k, v] of doc.meta) {
    text(ctx, k, M + 6, y, { px: 21, color: '#4b4f55' });
    text(ctx, `:  ${v}`, M + 210, y, { px: 21 });
    y += 38;
  }
  y += 14;
  if (doc.lead) { text(ctx, doc.lead, M, y, { px: 21 }); y += 52; }
  for (const s of doc.sections) {
    text(ctx, s.heading, M, y, { px: 22, bold: true });
    y = table(ctx, s, y + 24) + 44;
  }
  if (doc.remark) { text(ctx, doc.remark, M, y, { px: 20, color: '#3a3e44' }); y += 70; }
  const sy = Math.min(y + 90, H - 330);
  text(ctx, doc.signed.date, W / 2, sy, { px: 23, align: 'center' });
  text(ctx, doc.signed.org, W - M - 180, sy + 80, { px: 23, align: 'right', bold: true });
  text(ctx, doc.signed.person, W - M - 180, sy + 124, { px: 22, align: 'right' });
  if (doc.signed.stamp) stamp(ctx, doc.signed.stamp, W - M - 110, sy + 106);
  if (doc.receipt) receipt(ctx, doc.receipt, W - M - 300, 210);
}

// 스캔 느낌: 누런 종이, 약간 기울어짐, 가장자리 그림자, 잡점
function scanEffect(ctx, draw, seed) {
  const rand = rng(seed);
  ctx.fillStyle = '#f7f5ef';
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate((rand() - 0.5) * 0.012);
  ctx.translate(-W / 2, -H / 2);
  draw();
  ctx.restore();
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = `rgba(40,40,40,${rand() * 0.18})`;
    ctx.fillRect(rand() * W, rand() * H, rand() * 1.8 + 0.4, rand() * 1.8 + 0.4);
  }
  const g = ctx.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, 'rgba(0,0,0,0.10)'); g.addColorStop(0.04, 'rgba(0,0,0,0)');
  g.addColorStop(0.96, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.08)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // 시연용 표시 (작게)
  text(ctx, 'PwC Mate 시연용 예시 문서 · 가공의 자료', W / 2, H - 34, { px: 15, align: 'center', color: 'rgba(90,90,90,0.75)', serif: false });
}

/** 문서 내용 → PNG Blob */
export async function renderScan(doc, seed = 7) {
  try { await document.fonts?.ready; } catch { /* 글꼴 대기 실패는 무시 */ }
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  scanEffect(ctx, () => drawDoc(ctx, doc), seed);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'));
}
