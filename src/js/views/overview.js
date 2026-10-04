// 외부조회 현황 (주간 보고 화면)

import { esc, ICON } from './html.js';

// ---------- 외부조회 현황: 트랙별로 다른 기준 ----------
// 주간 보고 화면 맨 위에 둔다. 은행(필수 회수)은 건수, 채권채무·재고(커버리지)는 미확인 잔액을 수행중요성과 비교, 변호사(일반)는 회신 여부.

const eok = (n) => {
  const v = Math.abs(n) / 100000000;
  return `${n < 0 ? '−' : ''}${v >= 10 ? v.toFixed(0) : v.toFixed(1)}억원`;
};

export function confirmOverview(o, materiality) {
  if (!o.any) return '';
  const c = o.coverage;
  const pct = (n) => (c.total ? Math.round((n / c.total) * 1000) / 10 : 0);
  const pending = (list) => list.map((p) => `<a class="co-chip" href="#/compose/${encodeURIComponent(p.id)}">${esc(p.name)}</a>`).join('');
  const reqDone = o.required.total > 0 && o.required.received === o.required.total;

  const perf = c.performance
    ? `<div class="co-verdict ${c.exceeds ? 'is-bad' : 'is-ok'}">
         ${c.exceeds ? ICON.high : ICON.done}
         <span>미확인 잔액 <b>${eok(c.uncovered)}</b>이 수행중요성 ${eok(c.performance)}을
         ${c.exceeds ? `<b>${eok(c.gap)} 넘어요</b>. 회신 독촉이나 대체적 절차가 더 필요해요.` : '넘지 않아요.'}</span>
       </div>`
    : '<div class="co-verdict is-open">수행중요성을 입력하면 미확인 잔액과 비교해 드려요.</div>';

  return `
    <section class="confirm-overview" aria-label="외부조회 현황">
      <div class="co-head">
        <h2>외부조회 현황 <span>· 조회서 성격에 따라 다른 기준으로 봐요</span></h2>
        <label class="co-perf">
          <span>수행중요성</span>
          <input type="text" inputmode="numeric" data-action-change="set-performance" value="${c.performance ? c.performance.toLocaleString('ko-KR') : ''}" placeholder="예: 180,000,000" aria-label="수행중요성(원)">
          <span>원</span>
        </label>
      </div>
      ${materiality?.basis ? `<p class="co-basis">${esc(materiality.basis)}${materiality.overall ? ` · 전체 중요성 ${eok(materiality.overall)}` : ''}</p>` : ''}

      <div class="co-grid">
        <div class="co-card ${reqDone ? 'is-ok' : 'is-required'}">
          <div class="co-label">필수 회수 · 은행</div>
          <div class="co-big">${o.required.received}<small> / ${o.required.total}건 회수</small></div>
          <div class="co-sub">금액과 상관없이 전부 회수해야 해요.</div>
          ${o.required.pending.length ? `<div class="co-chips"><span>남은 곳</span>${pending(o.required.pending)}</div>` : ''}
        </div>

        <div class="co-card co-wide">
          <div class="co-label">커버리지 · 채권채무 · 재고</div>
          <div class="co-big">${pct(c.covered)}%<small> 확인 · ${eok(c.covered)} / ${eok(c.total)}</small></div>
          <div class="co-bar" role="img" aria-label="회신 확인 ${pct(c.confirmed)}%, 대체적 절차 ${pct(c.alternative)}%, 미확인 ${pct(c.uncovered)}%">
            <span class="co-seg is-confirmed" style="width:${pct(c.confirmed)}%"></span>
            <span class="co-seg is-alt" style="width:${pct(c.alternative)}%"></span>
          </div>
          <div class="co-legend">
            <span><i class="is-confirmed"></i>회신 확인 ${eok(c.confirmed)}</span>
            <span><i class="is-alt"></i>대체적 절차 ${eok(c.alternative)}</span>
            <span><i></i>미확인 ${eok(c.uncovered)}</span>
          </div>
          ${perf}
        </div>

        <div class="co-card">
          <div class="co-label">일반 · 변호사</div>
          <div class="co-big">${o.general.received}<small> / ${o.general.total}건 회신</small></div>
          <div class="co-sub">회신이 없으면 경영진 질문·의사록 검토로 확인해요.</div>
          ${o.general.pending.length ? `<div class="co-chips"><span>남은 곳</span>${pending(o.general.pending)}</div>` : ''}
        </div>
      </div>
    </section>`;
}
