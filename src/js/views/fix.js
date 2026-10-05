// 4. 보완 요청 — 레퍼런스 4 / 4-1
// 데스크톱은 대시보드 위 오른쪽 패널, 모바일(720px 이하)은 전체 화면.

import { formatMD, formatMDW } from '../lib/dates.js';
import { withDays, leftText } from '../lib/priority.js';
import { FIX_REASONS, fixReasonLabel, fixDetail, buildFixMail } from '../lib/fix.js';
import { signMail, currentUser } from '../lib/team.js';
import { esc, ICON, STATUS_LABEL } from './html.js';
import { mailDates } from '../lib/calendar.js';
import { mailField, mailDateDock } from './calendar.js';

/**
 * @param state 앱 상태
 * @param opts  { today, itemId, reason, copied, toast }
 */
export function renderFix(state, { today, itemId, reason, copied, toast }) {
  const item = withDays(state.items.find((x) => x.id === itemId), today);
  const person = state.people[item.owner] || {};
  const mail = signMail(buildFixMail({ item, person, client: state.client, today, reason }), currentUser(state));
  const dates = mailDates([item], today, { replyBy: false });
  const label = fixReasonLabel(reason);
  const lastFix = (item.fixes || [])[item.fixes?.length - 1];
  const nudges = (item.nudges || []).length;

  const flow = [
    `<span class="flow-chip">${formatMD(item.requestedOn)} 요청</span>`,
    nudges ? `<span class="flow-chip">독촉 ${nudges}회</span>` : '',
    item.received ? `<span class="flow-chip">${formatMD(item.received.on)} 파일 수령</span>` : '',
    lastFix ? `<span class="flow-chip is-fix">${formatMD(lastFix.on)} 보완 요청</span>` : '',
  ].filter(Boolean).join(`<span class="flow-arrow">${ICON.chevron}</span>`);

  const reasons = FIX_REASONS.map((r) => `
    <button type="button" class="reason-btn" data-action="set-reason" data-reason="${r.key}" aria-pressed="${r.key === reason}">
      <b>${r.label}</b><small>${r.hint}</small>
    </button>`).join('');

  const statusSeg = ['none', 'part', 'fix', 'done'].map((s) => `
    <span class="status-seg-item ${s === 'fix' ? 'is-current' : ''}">${ICON[s]}${STATUS_LABEL[s]}</span>`).join('');

  const body = mail.segments.map((s) => {
    if (s.kind === 'field') return mailField(s.text, dates);
    if (s.kind === 'reason') return `<span class="m-reason">${esc(s.text)}</span>`;
    return esc(s.text);
  }).join('');

  const footNote = copied && lastFix
    ? `${ICON.done}보완 요청 이력에 기록했어요 · ${formatMD(lastFix.on)} ${fixReasonLabel(lastFix.reason)}`
    : `<span>복사하면 보완 요청 이력에 <b>${label}</b>(으)로 기록돼요. 상태는 보완 요청 그대로예요.</span>`;

  return `
    <div class="drawer-dim" data-action="close-drawer"></div>
    <aside class="drawer fix" role="dialog" aria-modal="true" aria-labelledby="fix-title">
      <header class="m-header mobile-only">
        <button type="button" class="icon-btn" data-action="close-drawer" aria-label="뒤로">${ICON.back}</button>
        <div class="m-header-title">보완 요청</div>
      </header>

      <div class="drawer-body">
        <div class="compose-head">
          <div class="compose-who">
            <div class="eyebrow desktop-only">받은 자료 확인 · 감사에 그대로 쓸 수 있나요?</div>
            <h2 id="fix-title">${esc(item.name)}</h2>
            <div class="fix-sub">${esc(item.owner)}${person.dept ? ` · ${esc(person.dept)}` : ''} · ${formatMDW(item.neededOn)} 필요 · ${leftText(item.left)}</div>
          </div>
          <button type="button" class="icon-btn btn-sub desktop-only" data-action="close-drawer" aria-label="닫기">${ICON.close}</button>
        </div>

        <div class="flow">${flow}</div>

        <div class="fix-alert">
          <span class="fix-alert-icon">${ICON.fix}</span>
          <div><b>받았지만 그대로는 쓸 수 없는 자료예요</b>
            <small>수령으로 끝내지 않고, 사유를 골라 바로 쓸 수 있는 자료로 다시 받아요.</small></div>
        </div>

        <section class="fix-status">
          <div class="section-label">상태</div>
          <div class="status-seg" role="img" aria-label="현재 상태: 보완 요청">${statusSeg}</div>
        </section>

        <section class="fix-reason">
          <div class="section-label">무엇을 다시 받아야 하나요?</div>
          <div class="reason-grid" role="group" aria-label="보완 사유">${reasons}</div>
          ${reasonDetail(item, reason)}
        </section>

        <section class="preview">
          <div class="preview-head"><div class="preview-title">재요청 메일 미리보기</div></div>
          <div class="mail">
            <dl class="mail-head">
              <dt class="desktop-only">제목</dt><dd class="mail-subject">${esc(mail.subject)}</dd>
              <dt>받는 사람</dt><dd><span class="m-field">${esc(mail.to.name)}</span> <span class="desktop-only">${esc(mail.to.dept)}</span></dd>
            </dl>
            <div class="mail-body">${body}</div>
          </div>
        </section>
        ${mailDateDock(dates, state)}
      </div>

      <footer class="compose-foot">
        <div class="foot-note ${copied ? 'is-done' : ''}">${footNote}</div>
        <div class="foot-actions">
          <button type="button" class="btn btn-ghost" data-action="open-status" data-item="${esc(item.id)}">${ICON.done}수령 처리</button>
          <button type="button" class="btn btn-cta copy-btn" data-action="copy-fix">${ICON.copy}<span>재요청 메일 복사</span></button>
        </div>
      </footer>

      ${toast ? `
        <div class="compose-toast" role="status">
          <span class="toast-check">${ICON.done}</span>
          <span><b>메일을 복사했어요. 아웃룩에 붙여넣으세요.</b>
            <small>보완 요청 이력에 기록했어요<span class="desktop-only"> · 상태는 보완 요청 그대로예요</span></small></span>
        </div>` : ''}
    </aside>`;
}

// 선택한 사유의 구체적인 문제: 기준일 상이면 받은 기준일 → 필요한 기준일
function reasonDetail(item, reason) {
  if (reason === 'date') {
    const received = item.received?.basisDate;
    const required = item.fix?.requiredBasisDate;
    return `
      <div class="fix-detail basis">
        <span class="basis-box is-wrong"><small>받은 자료 기준일</small><b>${received ? received.replaceAll('-', '.') : '확인 필요'}</b></span>
        <span class="basis-arrow">${ICON.arrow}</span>
        <span class="basis-box is-right"><small>필요한 기준일</small><b>${required ? required.replaceAll('-', '.') : '확인 필요'}</b></span>
      </div>`;
  }
  const text = reason === 'file' ? '첨부 파일이 열리지 않거나 내용이 깨져 보임' : fixDetail(item, reason);
  return `<div class="fix-detail"><small>확인한 문제</small><b>${esc(text)}</b></div>`;
}
