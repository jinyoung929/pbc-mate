// 일정 탭: 월 달력 + 선택한 날의 일정. 자료 필요일은 자동, 사용자 일정은 추가/삭제/이동.
// 데스크톱은 드래그로 날짜 이동, 모바일은 날짜 입력칸으로 이동.

import { formatMD, formatMDW } from '../lib/dates.js';
import { leftText } from '../lib/priority.js';
import { monthGrid, monthLabel, calendarEntries, entriesOn, matchMailDate, PROGRESS, progressLabel, countByProgress } from '../lib/calendar.js';
import { esc, ICON, STATUS_LABEL } from './html.js';
import { topbar } from './dashboard.js';

const DOW = ['일', '월', '화', '수', '목', '금', '토'];

/**
 * @param state 앱 상태
 * @param opts  { today, isDemo, month: 'YYYY-MM', selected: 'YYYY-MM-DD', form: { title, errors }, filter: 'all'|'done'|'doing'|'planned', scopeNote }
 *   scopeNote: 누구의 일정을 보여주는지 (회계사는 자기 자료만, 매니저는 전체)
 */
export function renderCalendar(state, { today, isDemo, month, selected, form, filter = 'all', scopeNote = '' }) {
  const all = calendarEntries(state, today);
  const entries = filter === 'all' ? all : all.filter((e) => e.progress === filter);
  const grid = monthGrid(month);
  const inMonth = all.filter((e) => e.date.startsWith(month));
  const counts = countByProgress(inMonth);

  const cells = grid.map((c) => {
    const list = entriesOn(entries, c.date);
    const chips = list.slice(0, 3).map((e) => entryChip(e)).join('');
    const more = list.length > 3 ? `<span class="cal-more">+${list.length - 3}</span>` : '';
    return `
      <div class="cal-cell ${c.inMonth ? '' : 'is-out'} ${c.date === today ? 'is-today' : ''} ${c.date === selected ? 'is-selected' : ''} ${c.dow === 0 || c.dow === 6 ? 'is-weekend' : ''}"
           data-action="cal-select" data-date="${c.date}" data-drop="${c.date}">
        <div class="cal-day">${Number(c.date.slice(8))}</div>
        <div class="cal-chips">${chips}${more}</div>
      </div>`;
  }).join('');

  return `
    <div class="page calendar">
      ${topbar(state.client, today, isDemo, 'calendar', state.team)}

      <section class="cal-head">
        <div>
          <h1>${monthLabel(month)}</h1>
          ${scopeNote ? `<div class="cal-scope">${ICON.help}${esc(scopeNote)}</div>` : ''}
          <p class="cal-sub">이번 달 필요일 ${inMonth.filter((e) => e.kind === 'need').length}건 · 일정 ${inMonth.filter((e) => e.kind === 'event').length}건 · 항목을 끌어 다른 날에 놓으면 날짜가 바뀌어요</p>
        </div>
        <div class="cal-nav">
          <button type="button" class="btn btn-sub" data-action="cal-month" data-delta="-1" aria-label="이전 달">${ICON.back}</button>
          <button type="button" class="btn btn-sub" data-action="cal-today">오늘</button>
          <button type="button" class="btn btn-sub" data-action="cal-month" data-delta="1" aria-label="다음 달">${ICON.chevron}</button>
        </div>
      </section>

      <div class="progress-bar" role="group" aria-label="할 일 구분">
        <button type="button" class="progress-tab" data-action="cal-filter" data-filter="all" aria-pressed="${filter === 'all'}">전체 <b>${inMonth.length}</b></button>
        ${PROGRESS.map((p) => `
          <button type="button" class="progress-tab is-${p.key}" data-action="cal-filter" data-filter="${p.key}" aria-pressed="${filter === p.key}">
            <i></i>${p.label} <b>${counts[p.key]}</b>
          </button>`).join('')}
        <span class="progress-hint">이번 달 기준 · 자료 필요일은 상태에 따라 자동 분류, 직접 만든 일정은 아래에서 바꿀 수 있어요</span>
      </div>

      <div class="cal-grid-wrap">
        <div class="cal-grid">
          <div class="cal-dow">${DOW.map((d, i) => `<div class="${i === 0 || i === 6 ? 'is-weekend' : ''}">${d}</div>`).join('')}</div>
          <div class="cal-cells">${cells}</div>
        </div>
        ${dayPanel(state, entries, selected, today, form)}
      </div>
    </div>`;
}

function entryChip(e) {
  const cls = `${e.kind === 'need' ? `is-need risk-${e.risk}` : 'is-event'} p-${e.progress}`;
  return `<span class="cal-chip ${cls}" draggable="true" data-drag-entry="${e.id}" title="${esc(e.title)} · ${progressLabel(e.progress)}">${esc(e.title)}</span>`;
}

// 사용자 일정의 진행 구분 전환
function progressSwitch(e) {
  return `
    <span class="progress-switch" role="group" aria-label="진행 구분">
      ${PROGRESS.map((p) => `<button type="button" data-action="cal-progress" data-event="${e.eventId}" data-progress="${p.key}" aria-pressed="${e.progress === p.key}">${p.label}</button>`).join('')}
    </span>`;
}

// 오른쪽: 선택한 날의 일정 목록 + 일정 추가
function dayPanel(state, entries, selected, today, form) {
  const list = entriesOn(entries, selected);
  const rows = list.map((e) => {
    const detail = e.kind === 'need'
      ? `<span class="status status-${e.status}">${ICON[e.status]}${STATUS_LABEL[e.status]}</span>
         <span>${esc(e.sub)}${e.status !== 'done' ? ` · ${leftText(e.left)}` : ''}</span>`
      : `<span class="cal-tag">일정</span><span>${esc(e.sub || '')}</span>`;
    const progress = e.kind === 'event'
      ? progressSwitch(e)
      : `<span class="progress-pill is-${e.progress}"><i></i>${progressLabel(e.progress)}</span>`;
    const link = e.kind === 'need' && e.status !== 'done'
      ? `<a class="link" href="${e.status === 'fix' ? `#/fix/${e.itemId}` : e.status === 'follow' ? `#/follow/${e.itemId}` : `#/compose/${e.itemId}`}">열기</a>` : '';
    const remove = e.kind === 'event'
      ? `<button type="button" class="link cal-remove" data-action="cal-remove-event" data-event="${e.eventId}">삭제</button>` : '';
    return `
      <div class="cal-item ${e.kind === 'need' ? `is-need risk-${e.risk}` : 'is-event'} p-${e.progress}" draggable="true" data-drag-entry="${e.id}">
        <div class="cal-item-main">
          <b>${esc(e.title)}</b>
          <div class="cal-item-meta">${detail}</div>
          <div class="cal-item-progress">${progress}</div>
        </div>
        <div class="cal-item-actions">
          ${link}${remove}
          <label class="cal-move">날짜<input type="date" value="${e.date}" data-action-change="cal-move" data-entry="${e.id}"></label>
        </div>
      </div>`;
  }).join('');

  return `
    <aside class="cal-panel" data-drop="${selected}">
      <div class="cal-panel-head">
        <h2>${formatMDW(selected)}${selected === today ? ' <span>· 오늘</span>' : ''}</h2>
        <span class="cal-count">${list.length ? `${list.length}건` : '일정 없음'}</span>
      </div>
      <div class="cal-items">${rows || '<div class="cal-empty">이 날에는 일정이 없어요. 아래에서 추가하거나 달력 항목을 끌어다 놓으세요.</div>'}</div>
      <form class="cal-add" data-action-submit="cal-add-event" novalidate>
        <label class="f ${form.errors?.title ? 'has-error' : ''}">
          <span class="f-label">일정 추가 <small>${formatMD(selected)}</small></span>
          <input type="text" name="title" value="${esc(form.title || '')}" placeholder="예: 재고실사 결과 검토 시작" autocomplete="off">
          ${form.errors?.title ? `<span class="f-error">${esc(form.errors.title)}</span>` : ''}
        </label>
        <button type="submit" class="btn btn-cta">추가</button>
      </form>
    </aside>`;
}

/** 메일 본문의 값 칩. 일정 후보와 맞으면 끌어서 캘린더에 넣을 수 있게 표시한다. */
export function mailField(text, dates) {
  const d = dates ? matchMailDate(text, dates) : null;
  if (!d) return `<span class="m-field">${esc(text)}</span>`;
  return `<span class="m-field is-draggable" draggable="true" data-drag-date="${d.key}" data-date="${d.date}" data-title="${esc(d.title)}" data-item="${esc(d.itemId)}" title="끌어서 캘린더에 추가">${esc(text)}</span>`;
}

/**
 * 메일 패널 하단 '캘린더에 추가' 영역: 메일에 나오는 날짜 칩 + 드롭 영역.
 * dates: mailDates() 결과, existing: 이미 추가된 일정(event) 목록
 */
export function mailDateDock(dates, state) {
  const events = state.events || [];
  const chips = dates.map((d) => {
    const added = events.some((e) => e.title === d.title && e.date === d.date && (e.itemId || null) === d.itemId);
    return `
      <span class="dock-chip ${added ? 'is-added' : ''}" draggable="${added ? 'false' : 'true'}"
            data-drag-date="${d.key}" data-date="${d.date}" data-title="${esc(d.title)}" data-item="${esc(d.itemId)}">
        ${ICON.clock}${d.label}
        ${added ? `<i>${ICON.done}</i>` : `<button type="button" class="dock-add" data-action="add-mail-date" data-key="${d.key}" aria-label="${esc(d.title)} 일정으로 추가">+</button>`}
      </span>`;
  }).join('');
  return `
    <div class="cal-dock" data-drop="dock">
      <div class="dock-head"><b>캘린더에 추가</b><small>날짜 칩을 여기로 끌어오거나 + 를 누르세요</small></div>
      <div class="dock-chips">${chips}</div>
      <a class="link" href="#/calendar">일정 탭 열기</a>
    </div>`;
}
