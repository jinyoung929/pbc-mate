// 담당자 상세 — 주간 보고의 담당자별 현황에서 담당자를 누르면 연다 (#/owner/<담당자>).
// 이 담당자에게 요청한 자료, 바로 할 일(독촉·보완·후속 절차), 독촉·수령 이력을 한 화면에.

import { formatMD, formatMDW } from '../lib/dates.js';
import { leftText } from '../lib/priority.js';
import { esc, ICON, STATUS_LABEL } from './html.js';
import { topbar } from './dashboard.js';
import { attachCell } from './attach.js';

const won = (n) => `${Number(n).toLocaleString('ko-KR')}원`;
const HISTORY_ICON = { nudge: 'mail', fix: 'fix', received: 'done', closed: 'done' };

/**
 * @param state  앱 상태
 * @param detail ownerDetail() 결과
 * @param opts   { today, isDemo }
 */
export function renderOwner(state, detail, { today, isDemo }) {
  const d = detail;
  const back = `#/owner/${encodeURIComponent(d.owner)}`; // 패널을 닫으면 이 화면으로 돌아온다
  const bundle = d.bundlable > 1
    ? `<a class="btn btn-cta" href="#/bundle/${encodeURIComponent(d.owner)}" data-return="${esc(back)}">${ICON.mail}${d.bundlable}건 묶어서 독촉</a>` : '';

  return `
    <div class="page report owner-page">
      ${topbar(state.client, today, isDemo, 'report', state.team)}

      <section class="report-head">
        <div>
          <a class="owner-back" href="#/report">${ICON.back}주간 보고</a>
          <h1>${esc(d.owner)} <span>· ${esc(d.dept || (d.isCounterparty ? '조회처' : '담당자'))}${d.isCounterparty ? ' · 외부조회 조회처' : ''}</span></h1>
        </div>
        ${bundle ? `<div class="report-actions">${bundle}</div>` : ''}
      </section>

      <div class="report-grid">
        <aside class="report-side">
          <div class="stat-grid">
            ${stat('미완료', `${d.counts.open}건`, `전체 ${d.counts.total}건`)}
            ${stat('긴급·지연', `${d.counts.urgent}건`, '지연 · 2일 이내', d.counts.urgent ? 'is-late' : '')}
            ${stat('완료', `${d.counts.done}건`, '')}
            ${stat('독촉', `${d.nudges}회`, d.lastNudgedOn ? `마지막 ${formatMD(d.lastNudgedOn)}` : '아직 없음')}
          </div>
          <div class="report-block owner-history">
            <h2>이력 <span>· 최근 순</span></h2>
            ${d.history.length ? `<ol class="oh-list">${d.history.map((h) => `
              <li class="oh-${h.kind}">
                <span class="oh-date">${formatMD(h.on)}</span>
                <span class="oh-icon">${ICON[HISTORY_ICON[h.kind]]}</span>
                <span class="oh-text"><b>${esc(h.text)}</b><small>${esc(h.itemName)}</small></span>
              </li>`).join('')}</ol>` : '<p class="pp-empty">아직 기록된 이력이 없어요.</p>'}
          </div>
        </aside>

        <section class="report-main">
          <div class="report-block">
            <h2>요청한 자료 <span>· 필요일이 가까운 순 · 완료는 맨 아래</span></h2>
            <div class="item-table owner-items">
              <div class="it-row it-head"><div>자료명</div><div>상태</div><div>필요일</div><div>남은 날</div><div>독촉</div><div>첨부자료</div><div></div></div>
              ${d.rows.map((r) => `
                <div class="it-row ${r.status === 'done' ? 'is-done' : ''}">
                  <div class="it-name">${esc(r.name)}<small>${esc(r.kindLabel)}${r.bookAmount ? ` · 장부 ${won(r.bookAmount)}` : ''}${r.fixReason ? ` · ${esc(r.fixReason)}` : ''}</small>${r.signoff ? `<small>${esc(r.signoff)}</small>` : ''}</div>
                  <div><span class="status status-${r.status}">${ICON[r.status]}${STATUS_LABEL[r.status]}</span></div>
                  <div>${formatMDW(r.neededOn)}</div>
                  <div class="it-left">${r.status === 'done' ? '—' : `<b>${leftText(r.left)}</b><span class="risk risk-${r.risk}">${ICON[r.risk]}${r.riskLabel}</span>`}</div>
                  <div>${r.nudgeCount ? `${r.nudgeCount}회` : '—'}${r.lastNudgedOn ? `<small class="muted-text"> · ${formatMD(r.lastNudgedOn)}</small>` : ''}</div>
                  <div class="it-att">${attachCell(r)}</div>
                  <div class="it-go">${rowAction(r, back)}</div>
                </div>`).join('')}
            </div>
          </div>
        </section>
      </div>
    </div>`;
}

function rowAction(r, back) {
  const id = encodeURIComponent(r.id);
  if (r.status === 'done') return '';
  if (r.status === 'fix') return `<a class="btn btn-sub" href="#/fix/${id}" data-return="${esc(back)}">보완 재요청</a>`;
  if (r.status === 'follow') return `<a class="btn btn-sub" href="#/follow/${id}" data-return="${esc(back)}">후속 절차</a>`;
  return `<a class="btn btn-sub" href="#/compose/${id}" data-return="${esc(back)}">독촉하기</a>`;
}

function stat(label, value, sub, cls = '') {
  return `
    <div class="stat ${cls}">
      <div class="stat-label">${label}</div>
      <div class="stat-value">${value}</div>
      ${sub ? `<div class="stat-sub">${sub}</div>` : ''}
    </div>`;
}
