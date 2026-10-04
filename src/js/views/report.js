// 7. 주간 현황 보고 — 레퍼런스 7
// 대시보드와 같은 상단바 아래에 요약 카드(왼쪽)와 담당자별 현황·자료 목록(오른쪽)을 보여준다.

import { formatMD, formatMDW } from '../lib/dates.js';
import { leftText } from '../lib/priority.js';
import { weekLabel, summaryLines } from '../lib/report.js';
import { esc, ICON, STATUS_LABEL } from './html.js';
import { topbar } from './dashboard.js';
import { confirmOverview } from './overview.js';
import { trackOverview } from '../lib/followup.js';

/**
 * @param state  앱 상태
 * @param report buildReport() 결과
 * @param opts   { today, isDemo }
 */
export function renderReport(state, report, { today, isDemo }) {
  const { counts, received, owners, rows } = report;
  const lines = summaryLines(report);

  return `
    <div class="page report">
      ${topbar(state.client, today, isDemo, 'report')}

      <section class="report-head">
        <div>
          <div class="report-week">${weekLabel(report.week)}</div>
          <h1>주간 현황 보고 <span>· 받은 것 · 남은 것 · 지연을 감사팀 안에서 공유해요</span></h1>
        </div>
        ${counts.total ? `
          <div class="report-actions">
            <button type="button" class="btn btn-sub" data-action="download-csv">${ICON.download}CSV로 내려받기</button>
            <button type="button" class="btn btn-cta" data-action="copy-report">${ICON.copy}현황 복사</button>
          </div>` : ''}
      </section>

      ${counts.total ? body(report, lines, state) : empty()}
    </div>`;
}

function body(report, lines, state) {
  const { counts, received, owners, rows } = report;
  return `
    <div class="report-grid">
      <aside class="report-side">
        <div class="stat-grid">
          ${stat('전체 자료', counts.total, `완료 ${counts.done} · 미완료 ${counts.open}`)}
          ${stat('완료', counts.done, '')}
          ${stat('미회신', counts.none, '')}
          ${stat('일부 수령', counts.part, '')}
          ${stat('보완 요청', counts.fix, '', counts.fix ? 'is-fix' : '')}
          ${counts.follow ? stat('후속 절차', counts.follow, '외부조회 미회수·차이', 'is-follow') : ''}
          ${stat('지연', counts.late, counts.urgent ? `2일 이내 포함 ${counts.urgent}건` : '', `${counts.late ? 'is-late' : ''} ${counts.follow ? 'stat-span' : ''}`)}
        </div>
        <div class="stat stat-wide">
          <div class="stat-label">이번 주 수령</div>
          <div class="stat-value">${received.count}건</div>
          <div class="stat-sub">${received.items.length
            ? received.items.map((x) => `${esc(x.name)} (${formatMD(x.received.on)})`).join(' · ')
            : '수령일이 기록된 자료가 없어요'}${received.missingDates ? ` · 수령일 없는 ${received.missingDates}건은 제외` : ''}</div>
        </div>
        <div class="report-summary">${lines.map((l) => `<p>${esc(l)}</p>`).join('')}</div>
      </aside>

      <section class="report-main">
        ${confirmOverview(trackOverview(state.items, state.materiality?.performance), state.materiality)}

        <div class="report-block">
          <h2>담당자별 현황</h2>
          <div class="owner-table">
            <div class="ot-row ot-head"><div>담당자</div><div>미완료</div><div>긴급·지연</div><div>가장 가까운 필요일</div><div>최근 독촉</div></div>
            ${owners.map((o) => `
              <div class="ot-row">
                <div class="ot-owner"><b>${esc(o.owner)}</b>${o.dept ? `<small>${esc(o.dept)}</small>` : ''}</div>
                <div><b>${o.open}건</b></div>
                <div class="${o.urgent ? 'is-urgent' : ''}">${o.urgent ? `${o.urgent}건` : '—'}</div>
                <div>${formatMDW(o.nearest)} <small>· ${leftText(o.nearestLeft)}</small></div>
                <div>${o.lastNudgedOn ? formatMD(o.lastNudgedOn) : '—'}</div>
              </div>`).join('')}
          </div>
        </div>

        <div class="report-block">
          <h2>자료 목록 <span>· 필요일이 가까운 순 · 완료는 맨 아래</span></h2>
          <div class="item-table">
            <div class="it-row it-head"><div>자료명</div><div>담당자</div><div>상태</div><div>필요일</div><div>남은 날</div><div>최근 독촉</div></div>
            ${rows.map((r) => `
              <div class="it-row ${r.status === 'done' ? 'is-done' : ''}">
                <div class="it-name">${esc(r.name)}${r.fixReason ? `<small>${esc(r.fixReason)}</small>` : ''}${r.signoff ? `<small>${esc(r.signoff)}</small>` : ''}</div>
                <div>${esc(r.owner)}</div>
                <div><span class="status status-${r.status}">${ICON[r.status]}${STATUS_LABEL[r.status]}</span></div>
                <div>${formatMD(r.neededOn)}</div>
                <div class="it-left">${r.status === 'done' ? '—' : `<b>${leftText(r.left)}</b><span class="risk risk-${r.risk}">${ICON[r.risk]}${r.riskLabel}</span>`}</div>
                <div>${r.lastNudgedOn ? formatMD(r.lastNudgedOn) : '—'}</div>
              </div>`).join('')}
          </div>
        </div>
      </section>
    </div>`;
}

function stat(label, value, sub, cls = '') {
  return `
    <div class="stat ${cls}">
      <div class="stat-label">${label}</div>
      <div class="stat-value">${value}건</div>
      ${sub ? `<div class="stat-sub">${sub}</div>` : ''}
    </div>`;
}

function empty() {
  return `
    <section class="report-empty">
      <p>아직 집계할 자료가 없어요.</p>
      <div>
        <a class="btn btn-cta" href="#/add">자료 추가</a>
        <a class="btn btn-sub" href="#">대시보드로</a>
      </div>
    </section>`;
}
