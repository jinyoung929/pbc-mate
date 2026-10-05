// 1. 대시보드 — 레퍼런스 1 / 1-1 / 1-M

import { addDays, formatMD, formatKoreanDay } from '../lib/dates.js';
import {
  withDays, isOpen, sortItems, groupByOwner, summarize, insight, leftText,
} from '../lib/priority.js';
import { isBundleEligible } from '../lib/bundle.js';
import { currentUser, requesterMembers, isManager, filterByRequester } from '../lib/team.js';
import { esc, ICON, RISK_LABEL, RISK_SHORT, STATUS_LABEL } from './html.js';
import { termsOf } from '../lib/terms.js';
import { josa } from '../lib/korean.js';

const MODE_TEXT = {
  need: {
    hint: (t) => `${t.schedule}에 영향이 큰 자료부터 보여드려요.`,
    group: '가장 급한 자료가 있는 담당자부터',
    top: '가장 급함',
  },
  elapsed: {
    hint: () => '요청한 지 오래된 자료부터 보여드려요.',
    group: '가장 오래 기다린 자료가 있는 담당자부터',
    top: '가장 오래됨',
  },
};

export function renderDashboard(state, { today, mode, isDemo, who = 'all' }) {
  // 매니저는 자료를 직접 요청하지 않으므로 '내 요청' 없이 전체 / 실무진별로 거른다 (기본은 전체)
  const manager = isManager(state);
  const me = manager ? '' : currentUser(state);
  const members = requesterMembers(state);
  const scope = members.length && !(manager && who === 'me') ? who : 'all';
  const everyOpen = state.items.filter((x) => x.status !== 'done');
  const all = filterByRequester(state.items, scope, me).map((x) => withDays(x, today));
  const sorted = sortItems(all.filter(isOpen), mode);
  const done = all.filter((x) => !isOpen(x));
  const text = MODE_TEXT[mode];
  const t = termsOf(state.client.service);
  const filter = members.length ? requesterFilter(scope, members, me, everyOpen) : '';

  if (!sorted.length && scope !== 'all' && everyOpen.length) {
    return `
      <div class="page dashboard">
        ${topbar(state.client, today, isDemo, 'dashboard', state.team)}
        ${filter}
        <section class="all-done">${ICON.done}<h1>${scope === 'me' ? '내가 요청 중인 자료가 없어요' : `${esc(scope)}님이 요청 중인 자료가 없어요`}</h1>
          <p>‘전체’를 누르면 팀 전체 자료를 볼 수 있어요.</p></section>
      </div>`;
  }

  return `
    <div class="page dashboard">
      ${topbar(state.client, today, isDemo, 'dashboard', state.team)}
      ${sorted.length ? `
        ${insightSection(insight(sorted[0], mode, t.schedule), summarize(all), t)}
        ${filter}
        ${modeToggle(mode, text.hint(t), t)}
        ${timeline(sorted, today)}
        ${ownerCards(groupByOwner(sorted), state.people, done, text)}
        ${mobileList(sorted, text.top)}
      ` : allDone()}
    </div>`;
}

/** 상단바. active: 'dashboard' | 'report' — 주간 보고 화면도 같은 상단바를 쓴다. team이 있으면 지금 쓰는 사람을 고를 수 있다. */
export function topbar(client, today, isDemo, active, team) {
  return `
    <header class="topbar">
      <a class="brand" href="#" title="대시보드로">PBC Mate<span class="brand-mark" aria-hidden="true"></span></a>
      <span class="chip">${esc(client.name)} · ${esc(client.engagement)}</span>
      <nav class="tabs">
        <a class="tab ${active === 'dashboard' ? 'is-active' : ''}" href="#">대시보드</a>
        <a class="tab" href="#/add">자료 요청</a> <!-- 자료 추가 창은 이 탭으로 연다 (+ 자료 추가 버튼은 같은 기능이라 뺐다) -->
        <a class="tab ${active === 'confirm' ? 'is-active' : ''}" href="#/confirm">외부조회서</a>
        <a class="tab ${active === 'calendar' ? 'is-active' : ''}" href="#/calendar">일정</a>
        <a class="tab ${active === 'report' ? 'is-active' : ''}" href="#/report">주간 보고</a>
      </nav>
      ${isDemo ? `<span class="demo-date">시연 기준일 ${today.replaceAll('-', '.')}</span>` : ''}
      <div class="topbar-end">
        ${userPicker(team)}
        <img class="org-logo desktop-only" src="assets/samil-logo.png" alt="삼일회계법인" width="150" height="29">
        <span class="today">${formatKoreanDay(today)}</span>
      </div>
    </header>`;
}

// 지금 쓰는 사람: 팀원끼리 같은 화면에서 바꿔 쓸 수 있다 (데이터는 브라우저마다 따로 저장)
function userPicker(team) {
  const members = team?.members?.length ? team.members : team?.me ? [team.me] : [];
  if (!members.length) return '';
  return `
    <label class="me-picker" title="지금 쓰는 사람 · 요청 감사인과 메일 서명에 들어가요">
      <span class="me-dot" aria-hidden="true">${esc((team.me || members[0]).slice(0, 1))}</span>
      <select data-action-change="switch-user" aria-label="지금 쓰는 사람">
        ${members.map((m) => `<option value="${esc(m)}" ${m === team.me ? 'selected' : ''}>${esc(m)}</option>`).join('')}
      </select>
    </label>`;
}

function insightSection(ins, sum, t) {
  const headline = sum.urgent
    ? `오늘 먼저 챙길 자료가 ${sum.urgent}건 있어요`
    : '오늘 당장 급한 자료는 없어요';
  return `
    <section class="hero">
      <div class="hero-text">
        <h1>${headline}</h1>
        <p class="hero-sub">${t.heroSub}</p>
        <div class="hero-insight"><span class="eyebrow">${ins.eyebrow}</span><b>${esc(ins.title)}</b><span>${ins.sub}</span></div>
      </div>
      <div class="hero-deco" aria-hidden="true"><span></span><span></span></div>
    </section>
    <dl class="summary">
        <div class="${sum.urgent ? 'is-alert' : ''}">
          <dt>${sum.urgent ? ICON.high : ''}긴급 자료</dt><dd>${sum.urgent}건</dd>
          <span class="kpi-note desktop-only">지연 · 2일 이내</span>
        </div>
        <div><dt>7일 이내<span class="desktop-only">&nbsp;필요</span></dt><dd>${sum.dueWeek}건</dd></div>
        <div><dt>보완 요청</dt><dd>${sum.needsFix}건</dd></div>
        <div><dt>미완료</dt><dd>${sum.open}건 <small>/ ${sum.total}</small></dd></div>
    </dl>`;
}

// 요청 감사인 필터: 전체 / 내 요청 / 팀원. 건수는 미완료 기준.
function requesterFilter(who, members, me, openItems) {
  const count = (name) => openItems.filter((x) => x.requester === name).length;
  const btn = (value, caption, label) => `
    <button type="button" data-action="set-who" data-who="${esc(value)}" aria-pressed="${who === value}">
      <span class="seg-caption">${caption}</span><span class="seg-label">${label}</span>
    </button>`;
  const others = members.filter((m) => m !== me);
  return `
    <section class="mode-bar who-bar">
      <div class="mode-title">요청 감사인</div>
      <div class="segmented" role="group" aria-label="요청 감사인">
        ${btn('all', '팀 전체', `전체 ${openItems.length}`)}
        ${me ? btn('me', esc(me), `내 요청 ${count(me)}`) : ''}
        ${others.map((m) => btn(m, '팀원', `${esc(m)} ${count(m)}`)).join('')}
      </div>
      <div class="mode-hint">${who === 'all' ? '팀 전체가 요청 중인 자료예요.' : '고른 감사인이 요청한 자료만 보여요.'}</div>
    </section>`;
}

function modeToggle(mode, hint, t) {
  const btn = (value, caption, label) => `
    <button type="button" data-action="set-mode" data-mode="${value}" aria-pressed="${mode === value}">
      <span class="seg-caption">${caption}</span><span class="seg-label">${label}</span>
    </button>`;
  return `
    <section class="mode-bar">
      <div class="mode-title">우선순위 기준</div>
      <div class="segmented" role="group" aria-label="우선순위 기준">
        ${btn('need', `${t.schedule} 기준`, '필요일순')}
        ${btn('elapsed', '요청 경과 기준', '경과일순')}
      </div>
      <div class="mode-hint">${hint}</div>
      <span class="tip">
        <button type="button" class="tip-btn">${ICON.help}필요일이란?</button>
        <span class="tip-box" role="tooltip"><b>필요일</b> = ${t.needDef}<br>
          <span class="muted">자료를 추가할 때 ${t.procedure}${josa(t.procedure, '을', '를')} 적어 두면 메일 근거 문장에 들어가요.</span></span>
      </span>
      <div class="mode-def mobile-only">필요일 = ${t.needDef}</div>
    </section>`;
}

// 필요일 타임라인: 오늘(0일)부터 가장 먼 필요일까지. 최소 15일 폭으로 그린다.
function timeline(sorted, today) {
  const span = Math.max(15, Math.max(...sorted.map((x) => x.left)) + 1);
  const pct = (days) => `${(Math.max(0, days) / span) * 100}%`;

  const byLeft = [...sorted].sort((a, b) => a.left - b.left);
  const marks = byLeft.map((x, i) => {
    const pos = Math.max(0, x.left) / span;
    const side = i % 2 === 0 ? 'above' : 'below';
    const anchor = pos > 0.85 ? 'end' : 'start';
    const extra = x.status === 'fix' ? ' · 보완 요청' : x.status === 'follow' ? ' · 후속 절차' : '';
    return `
      <div class="tl-mark risk-${x.risk} ${side} anchor-${anchor}" style="left:${pct(x.left)}">
        <span class="tl-stem"></span><span class="tl-dot"></span>
        <a class="tl-label ${x.risk === 'high' || x.risk === 'late' ? 'is-urgent' : ''} ${x.status === 'fix' ? 'is-fix' : ''}" href="${itemHref(x)}" title="${esc(x.name)} · ${esc(x.owner)} — 눌러서 열기">
          <b>${esc(x.name)}</b><span>${formatMD(x.neededOn)} · ${leftText(x.left)}${extra}</span>
        </a>
      </div>`;
  }).join('');

  const ticks = tickDays(today, span).map((d) =>
    `<span class="tl-tick" style="left:${pct(d)}">${formatMD(addDays(today, d))}</span>`).join('');

  return `
    <section class="timeline desktop-only">
      <div class="tl-head">
        <div class="tl-title">필요일 타임라인 <span>· 오늘부터 각 자료의 필요일까지</span></div>
        <div class="tl-legend">
          <span class="risk-high">${ICON.high}<i>2일 이내</i></span>
          <span class="risk-mid">${ICON.mid}<i>3~7일</i></span>
          <span class="risk-low">${ICON.low}<i>8일 이상</i></span>
        </div>
      </div>
      <div class="tl-track">
        <div class="tl-seg risk-high" style="left:0;width:${pct(Math.min(2, span))}"></div>
        <div class="tl-seg risk-mid" style="left:${pct(2)};width:${pct(Math.min(5, span - 2))}"></div>
        <div class="tl-seg risk-low" style="left:${pct(7)};right:0"></div>
        <span class="tl-now"></span>
        <span class="tl-tick is-today" style="left:0">오늘 ${formatMD(today)}</span>
        ${ticks}
        ${marks}
      </div>
    </section>`;
}

// 날짜 눈금: 5의 배수 날짜(5, 10, 15 …)에 표시하되 오늘 라벨과 겹치지 않게 3일 이후부터.
function tickDays(today, span) {
  const days = [];
  for (let d = 3; d < span; d++) {
    if (Number(addDays(today, d).slice(8)) % 5 === 0) days.push(d);
  }
  return days;
}

function composeHref(item) {
  return `#/compose/${encodeURIComponent(item.id)}`;
}

function bundleHref(owner) {
  return `#/bundle/${encodeURIComponent(owner)}`;
}

function fixHref(item) {
  return `#/fix/${encodeURIComponent(item.id)}`;
}

// 자료를 눌렀을 때: 보완 요청 자료는 보완 요청 화면, 나머지는 단건 독촉
function followHref(item) {
  return `#/follow/${encodeURIComponent(item.id)}`;
}

function itemHref(x) {
  if (x.status === 'follow') return followHref(x);
  return x.status === 'fix' ? fixHref(x) : composeHref(x);
}

function nameLink(x) {
  return `<a class="row-name" href="${itemHref(x)}">${esc(x.name)}</a>`;
}

function statusBadge(status) {
  return `<span class="status status-${status}">${ICON[status]}${STATUS_LABEL[status]}</span>`;
}

function riskBadge(risk, short = false) {
  return `<span class="risk risk-${risk}">${ICON[risk]}${short ? RISK_SHORT[risk] : RISK_LABEL[risk]}</span>`;
}

function itemMeta(x) {
  if (x.status === 'fix') return x.reason || '보완 요청';
  if (x.status === 'follow') return x.follow?.type === 'diff' ? '회신 금액 차이 · 조정 중' : '미회수 확정 · 대체적 절차 진행 중';
  return `${formatMD(x.neededOn)} 필요 · 요청 ${formatMD(x.requestedOn)} · D+${x.elapsed}`;
}

function rowActionLabel(x) {
  if (x.status === 'fix') return '보완 재요청 메일 쓰기';
  if (x.status === 'follow') return '후속 절차 열기';
  return '이 자료만 따로 독촉';
}

function leftBig(left) {
  if (left === 0) return `<b>오늘</b>`;
  return `<b>${Math.abs(left)}</b><span>${left > 0 ? '일 남음' : '일 지남'}</span>`;
}

function ownerCards(groups, people, done, text) {
  const topId = groups[0].items[0].id;

  const cards = groups.map((g, i) => {
    const person = people[g.owner] || {};
    const doneHere = done.filter((x) => x.owner === g.owner);
    const nudged = person.nudges
      ? `마지막 독촉 ${formatMD(person.lastNudgedOn)} · 독촉 ${person.nudges}회`
      : '아직 독촉하지 않았어요';

    // 묶음 독촉 대상이 2건 이상인 카드: 항목마다 따로 보내는 경우를 위한 버튼을 붙인다.
    const bundlable = g.items.filter(isBundleEligible);
    const perItem = bundlable.length > 1;

    const rows = g.items.map((x) => `
      <div class="row ${x.id === topId ? 'is-top' : ''}">
        <div class="row-main">
          <div class="row-title">
            ${nameLink(x)}
            ${x.id === topId ? `<span class="top-badge">${text.top}</span>` : ''}
          </div>
          <div class="row-meta">${statusBadge(x.status)}<span class="ellipsis">${esc(itemMeta(x))}</span></div>
          ${perItem ? `<a class="row-action" href="${itemHref(x)}">${ICON.mail}${rowActionLabel(x)}</a>` : ''}
        </div>
        <div class="row-left">
          <div class="left-big">${leftBig(x.left)}</div>
          ${riskBadge(x.risk)}
        </div>
      </div>`).join('');

    const doneLine = doneHere.length
      ? `<div class="done-line">${ICON.done}완료 ${doneHere.length}건 · ${doneHere.map((x) => esc(x.name)).join(', ')}</div>`
      : '';

    // 버튼 건수는 묶음 독촉 화면과 같은 기준(보완 요청 제외)으로 센다. (bundlable은 위에서 계산)
    let cta;
    if (bundlable.length > 1) {
      cta = `<a class="btn btn-cta" href="${bundleHref(g.owner)}">
        ${bundlable.length}건 묶어서 독촉 <span class="cta-sub">· 메일 1통</span></a>`;
    } else if (bundlable.length === 1) {
      cta = `<a class="btn btn-sub" href="${composeHref(bundlable[0])}">${esc(bundlable[0].name)} 독촉하기</a>`;
    } else {
      cta = g.items[0].status === 'follow'
        ? `<a class="btn btn-sub" href="${followHref(g.items[0])}">후속 절차 열기</a>`
        : `<a class="btn btn-sub" href="${fixHref(g.items[0])}">보완 재요청 메일 쓰기</a>`;
    }

    return `
      <div class="card">
        <div class="card-head">
          <div class="rank">${i + 1}</div>
          <div class="card-who">
            <div class="card-name">${esc(g.owner)} <span>${esc(person.dept || '')}</span></div>
            <div class="card-nudge">${nudged}</div>
          </div>
          <div class="card-count"><span>미완료</span><b>${g.items.length}건</b></div>
        </div>
        ${rows}
        ${doneLine}
        ${cta}
      </div>`;
  }).join('');

  return `
    <section class="owners desktop-only">
      <div class="section-head">
        <h2>담당자별(거래처별)로 묶어 재촉하기</h2>
        <div class="section-hint">같은 담당자에게는 메일 한 통으로 · ${text.group}</div>
      </div>
      <div class="cards">${cards}</div>
    </section>`;
}

// 모바일(레퍼런스 1-M): 담당자 묶음 대신 한 줄 목록 + 가장 많이 밀린 담당자 묶음 버튼
function mobileList(sorted, topLabel) {
  // 보완 요청 자료는 단건 독촉 대신 보완 요청 화면으로 연결한다.
  const rows = sorted.map((x, i) => `
    <a href="${itemHref(x)}" class="m-row ${i === 0 ? 'is-top' : ''}">
      <span class="m-left">
        <span class="m-days">${x.left === 0 ? '오늘' : `${Math.abs(x.left)}<small>일${x.left < 0 ? ' 지남' : ''}</small>`}</span>
        ${riskBadge(x.risk, true)}
      </span>
      <span class="m-main">
        <span class="row-title"><span class="row-name">${esc(x.name)}</span>${i === 0 ? `<span class="top-badge">${topLabel}</span>` : ''}</span>
        <span class="row-meta">${statusBadge(x.status)}<span class="ellipsis">${esc(x.status === 'fix' ? (x.reason || '보완 요청') : `${x.owner} · D+${x.elapsed}`)}</span></span>
      </span>
    </a>`).join('');

  const biggest = groupByOwner(sorted.filter(isBundleEligible))
    .reduce((a, b) => (b.items.length > a.items.length ? b : a), { items: [] });
  const bundle = biggest.items.length > 1 ? `
    <a class="m-bundle" href="${bundleHref(biggest.owner)}">
      <span><b>${esc(biggest.owner)} ${biggest.items.length}건 묶어서 독촉</b><small>개별 메일 ${biggest.items.length}통 대신 1통</small></span>
      ${ICON.chevron}
    </a>` : '';

  return `<section class="m-list mobile-only">${rows}</section>${bundle ? `<div class="mobile-only">${bundle}</div>` : ''}`;
}

function allDone() {
  return `
    <section class="all-done">
      ${ICON.done}
      <h1>요청한 자료를 모두 받았어요</h1>
      <p>새로 요청할 자료가 생기면 추가해 주세요.</p>
    </section>`;
}
