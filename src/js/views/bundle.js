// 3. 묶음 독촉 — 레퍼런스 3
// 데스크톱은 대시보드 위 오른쪽 패널, 모바일(720px 이하)은 전체 화면.

import { formatMD } from '../lib/dates.js';
import { leftText } from '../lib/priority.js';
import { TONES, toneIndex } from '../lib/tone.js';
import { buildBundleMail } from '../lib/bundle.js';
import { signMail, currentUser } from '../lib/team.js';
import { sendTiming } from '../lib/timing.js';
import { timingChip, timingBanner } from './timing.js';
import { mailDates } from '../lib/calendar.js';
import { mailField, mailDateDock } from './calendar.js';
import { esc, ICON, RISK_LABEL, STATUS_LABEL } from './html.js';

/**
 * @param state 앱 상태
 * @param opts  { sorted: bundleItems() 결과, clock, tone, copied, toast }
 */
export function renderBundle(state, { sorted, clock, tone, copied, toast }) {
  const top = sorted[0];
  const owner = top.owner;
  const person = state.people[owner] || {};
  const count = sorted.length;
  const t = TONES[toneIndex(tone)];
  const mail = signMail(buildBundleMail({ sorted, person, client: state.client, manager: state.team?.manager, tone }), currentUser(state));
  const timing = sendTiming(clock, top.neededOn);
  const dates = mailDates(sorted, clock.date);
  const nudged = person.nudges
    ? `마지막 독촉 ${formatMD(person.lastNudgedOn)} · 독촉 ${person.nudges}회`
    : '아직 독촉하지 않았어요';

  const rows = sorted.map((x, i) => `
    <div class="b-row ${i === 0 ? 'is-top' : ''}">
      <span class="b-no">${i + 1}</span>
      <span class="b-main">
        <span class="row-title"><span class="row-name">${esc(x.name)}</span>${i === 0 ? '<span class="top-badge">가장 급함</span>' : ''}</span>
        <span class="row-meta">
          <span class="status status-${x.status}">${ICON[x.status]}${STATUS_LABEL[x.status]}</span>
          <span class="ellipsis">${formatMD(x.neededOn)} 필요 · 요청 ${formatMD(x.requestedOn)} · D+${x.elapsed}</span>
        </span>
      </span>
      <span class="b-left">
        <span class="risk risk-${x.risk}">${ICON[x.risk]}${RISK_LABEL[x.risk]}</span>
        <span class="b-days">${x.left === 0 ? '오늘' : `${Math.abs(x.left)}<small>일${x.left < 0 ? ' 지남' : ''}</small>`}</span>
      </span>
    </div>`).join('');

  const seg = (segments) => segments.map((s) => {
    if (s.kind === 'field') return mailField(s.text, dates);
    if (s.kind === 'reason') return `<span class="m-reason">${esc(s.text)}</span>`;
    return esc(s.text);
  }).join('');

  const tableRows = mail.rows.map((r) => `
    <tr>
      <td class="t-no">${r.no}</td>
      <td><span class="m-field">${esc(r.name)}</span></td>
      <td>${esc(r.status)}${r.isTop ? ' <b class="t-top">(가장 급함)</b>' : ''}</td>
      <td>${mailField(r.need, dates)}</td>
    </tr>`).join('');

  const cc = mail.cc
    ? `<span class="m-cc">${esc(mail.cc.name)}<span class="desktop-only">${mail.cc.dept ? ` (${esc(mail.cc.dept)})` : ''}</span></span>`
    : '<span class="muted-text">없음</span>';

  const footNote = copied
    ? `${ICON.done}${count}건 모두 독촉 이력에 기록했어요`
    : `복사하면 ${count}건 모두 독촉 이력에 기록돼요. 발송은 아웃룩에서 해주세요.`;

  return `
    <div class="drawer-dim" data-action="close-drawer"></div>
    <aside class="drawer bundle" role="dialog" aria-modal="true" aria-labelledby="bundle-title">
      <header class="m-header mobile-only">
        <button type="button" class="icon-btn" data-action="close-drawer" aria-label="뒤로">${ICON.back}</button>
        <div class="m-header-title">묶음 독촉</div>
        ${timingChip(timing)}
      </header>

      <div class="drawer-body">
        <div class="bundle-head">
          <div class="compose-who">
            <div class="eyebrow desktop-only">묶음 독촉 ${timingChip(timing)}</div>
            <h2 id="bundle-title">${esc(owner)} <span>${esc(person.dept || '')}</span></h2>
            <div class="bundle-sub">미완료 ${count}건 · ${nudged}</div>
          </div>
          <div class="value-chip">
            <span class="value-icons" aria-hidden="true"><span>${ICON.mail}${ICON.mail}${ICON.mail}</span>${ICON.arrow}${ICON.mail}</span>
            <span><b>요청 ${count}건 → 메일 1통</b><small>개별 메일 ${count}통 대신 한 통으로 정리</small></span>
          </div>
          <button type="button" class="icon-btn btn-sub desktop-only" data-action="close-drawer" aria-label="닫기">${ICON.close}</button>
        </div>

        ${timingBanner(timing)}

        <section class="b-list">
          ${rows}
          <dl class="b-why">
            <dt>순서</dt><dd>필요일이 가까운 자료부터 메일에 넣었어요.</dd>
            <dt>말투</dt><dd>가장 급한 <b>${esc(top.name)}</b>(${leftText(top.left)})에 맞춰 <b>${t.name} ${t.emoji}</b></dd>
          </dl>
        </section>

        <section class="preview">
          <div class="preview-head"><div class="preview-title">메일 미리보기</div></div>
          <div class="mail">
            <dl class="mail-head">
              <dt class="desktop-only">제목</dt><dd class="mail-subject">${esc(mail.subject)}</dd>
              <dt>받는 사람</dt><dd><span class="m-field">${esc(mail.to.name)}</span> <span class="desktop-only">${esc(mail.to.dept)}</span></dd>
              <dt>참조</dt><dd>${cc}</dd>
            </dl>
            <div class="mail-body bundle-body">
              <div>${seg(mail.intro)}</div>
              <table class="b-table">
                <thead><tr><th class="t-no">순서</th><th>자료</th><th>현재 상태</th><th>필요일</th></tr></thead>
                <tbody>${tableRows}</tbody>
              </table>
              <div>${seg(mail.outro)}</div>
            </div>
          </div>
        </section>
        ${mailDateDock(dates, state)}
      </div>

      <footer class="compose-foot">
        <div class="foot-note ${copied ? 'is-done' : ''}">${footNote}</div>
        <button type="button" class="btn btn-cta copy-btn" data-action="copy-bundle">${ICON.copy}<span>${count}건 한 통으로 복사</span></button>
      </footer>

      ${toast ? `
        <div class="compose-toast" role="status">
          <span class="toast-check">${ICON.done}</span>
          <span><b>메일을 복사했어요. 아웃룩에 붙여넣으세요.</b>
            <small>${count}건 모두 독촉 이력에 기록했어요<span class="desktop-only"> · 발송은 아웃룩에서 직접 해주세요</span></small></span>
        </div>` : ''}
    </aside>`;
}
