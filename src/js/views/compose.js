// 2. 단건 독촉 — 레퍼런스 2 / 2-1 / 2-2 / 2-3 / 2-M
// 데스크톱은 대시보드 위 오른쪽 패널, 모바일(720px 이하)은 전체 화면.

import { formatMD, formatMDW } from '../lib/dates.js';
import { withDays, leftText } from '../lib/priority.js';
import { TONES, toneIndex, toneName, recommendTone, recommendBasis } from '../lib/tone.js';
import { buildMail } from '../lib/mail.js';
import { sendTiming } from '../lib/timing.js';
import { timingChip, timingBanner } from './timing.js';
import { mailDates } from '../lib/calendar.js';
import { mailField, mailDateDock } from './calendar.js';
import { templateOf } from '../lib/pbcTemplate.js';
import { signMail, currentUser } from '../lib/team.js';
import { esc, ICON, RISK_LABEL, STATUS_LABEL } from './html.js';

/**
 * @param state 앱 상태
 * @param opts  { today, clock, itemId, tone, copied, toast }
 */
export function renderCompose(state, { today, clock, itemId, tone, copied, toast }) {
  const item = withDays(state.items.find((x) => x.id === itemId), today);
  const person = state.people[item.owner] || {};
  const history = item.nudges || [];
  const last = history[history.length - 1];
  const recommended = recommendTone(item);
  const mail = signMail(buildMail({ item, person, client: state.client, manager: state.team?.manager, today, tone }), currentUser(state));
  const timing = sendTiming(clock, item.neededOn);
  const dates = mailDates([item], today);

  const footNote = copied && last
    ? `${ICON.done}독촉 이력에 기록했어요 · ${formatMD(last.on)} ${toneName(last.tone)} 단계로 복사`
    : '복사하면 독촉 이력에 자동으로 기록돼요. 발송은 아웃룩에서 해주세요.';

  return `
    <div class="drawer-dim" data-action="close-compose"></div>
    <aside class="drawer compose" role="dialog" aria-modal="true" aria-labelledby="compose-title">
      <header class="m-header mobile-only">
        <button type="button" class="icon-btn" data-action="close-compose" aria-label="뒤로">${ICON.back}</button>
        <div class="m-header-title">독촉 메일</div>
        ${timingChip(timing)}
      </header>

      <div class="drawer-body">
        <div class="compose-head">
          <div class="compose-who">
            <div class="eyebrow desktop-only">단건 독촉 ${timingChip(timing)}</div>
            <h2 id="compose-title">${esc(item.name)}</h2>
            <div class="compose-owner desktop-only">${esc(item.owner)}${person.dept ? ` · ${esc(person.dept)}` : ''}</div>
          </div>
          <button type="button" class="icon-btn btn-sub desktop-only" data-action="close-compose" aria-label="닫기">${ICON.close}</button>
        </div>

        ${timingBanner(timing)}
        ${facts(item, history, last)}
        ${mobileChips(item, history, last)}
        ${toneSlider(tone, recommended, item)}
        ${preview(mail, dates)}
        ${item.kind === 'confirmation' ? followEntry(item) : templateNote(item)}
        ${mailDateDock(dates, state)}
      </div>

      <footer class="compose-foot">
        <div class="foot-note ${copied ? 'is-done' : ''}">${footNote}</div>
        <div class="foot-actions">
          <button type="button" class="btn btn-ghost" data-action="open-status" data-item="${esc(item.id)}">${ICON.fix}자료 상태 변경</button>
          <button type="button" class="btn btn-cta copy-btn" data-action="copy-mail">${ICON.copy}<span>복사하기</span></button>
        </div>
      </footer>

      ${toast ? `
        <div class="compose-toast" role="status">
          <span class="toast-check">${ICON.done}</span>
          <span><b>메일을 복사했어요. 아웃룩에 붙여넣으세요.</b>
            <small>독촉 이력에 기록했어요<span class="desktop-only"> · 발송은 아웃룩에서 직접 해주세요</span></small></span>
        </div>` : ''}
    </aside>`;
}

// 표준 양식으로 요청한 자료: 독촉하면서 양식을 다시 보낼 수 있게
function templateNote(item) {
  const t = templateOf(item);
  if (!t) return '';
  return `
    <section class="tpl-note">
      <div class="section-label">요청 양식 <small class="fu-count">${item.basisDate ? `${formatMD(item.basisDate)} 기준 · ` : ''}${t.columns.length}개 항목${t.sign ? ' · 서명 필요' : ''}</small></div>
      <div class="tpl-cols">${t.columns.map((c) => `<i>${esc(c)}</i>`).join('')}</div>
      <button type="button" class="btn btn-sub tpl-copy" data-action="copy-template" data-item="${esc(item.id)}">${ICON.copy}엑셀용 요청 양식 다시 복사</button>
    </section>`;
}

// 외부조회 건: 독촉을 마치고도 회신이 없거나, 회신 금액이 다르면 후속 절차로 넘어간다.
function followEntry(item) {
  return `
    <section class="follow-entry">
      <div class="section-label">회신 결과가 나왔나요?</div>
      <div class="follow-entry-btns">
        <button type="button" class="btn btn-sub" data-action="start-follow" data-type="noreply" data-item="${esc(item.id)}">
          ${ICON.follow}<span><b>미회수로 확정</b><small>대체적 절차 가이드로</small></span></button>
        <button type="button" class="btn btn-sub" data-action="start-follow" data-type="diff" data-item="${esc(item.id)}">
          ${ICON.follow}<span><b>회신 받음 · 금액 차이</b><small>차이 조정표로</small></span></button>
      </div>
    </section>`;
}

// 데스크톱 상단 4칸: 필요일 / 남은 날 / 요청 후 / 독촉 이력
function facts(item, history, last) {
  const leftValue = item.left === 0 ? '오늘' : item.left > 0 ? `${item.left}일` : `${-item.left}일 지남`;
  return `
    <div class="facts desktop-only">
      <div class="fact">
        <div class="fact-label">필요일</div>
        <div class="fact-value">${formatMDW(item.neededOn)}</div>
        <div class="fact-sub">${esc(item.procedure || '감사')} 절차 시작</div>
      </div>
      <div class="fact fact-risk risk-${item.risk}">
        <div class="fact-label">남은 날</div>
        <div class="fact-value">${leftValue}</div>
        <div class="fact-sub">${ICON[item.risk]}${RISK_LABEL[item.risk]}</div>
      </div>
      <div class="fact">
        <div class="fact-label">요청 후</div>
        <div class="fact-value">D+${item.elapsed}</div>
        <div class="fact-sub">${formatMD(item.requestedOn)} 요청 · ${STATUS_LABEL[item.status]}</div>
      </div>
      <div class="fact">
        <div class="fact-label">독촉 이력</div>
        <div class="fact-value">${history.length}회</div>
        <div class="fact-sub">${last ? `최근 ${formatMD(last.on)} · ${toneName(last.tone)}` : '아직 없음'}</div>
      </div>
    </div>`;
}

// 모바일(2-M): 한 줄 칩
function mobileChips(item, history, last) {
  return `
    <div class="chips mobile-only">
      <span class="chip-pill risk-${item.risk}">${ICON[item.risk]}${formatMD(item.neededOn)} 필요 · ${leftText(item.left)}</span>
      <span class="chip-pill">${formatMD(item.requestedOn)} 요청 · D+${item.elapsed}</span>
      <span class="chip-pill">${last ? `독촉 ${history.length}회 · ${formatMD(last.on)}` : '독촉 이력 없음'}</span>
    </div>`;
}

function toneSlider(tone, recommended, item) {
  const active = toneIndex(tone);
  const recName = toneName(recommended);

  const stops = TONES.map((t, i) => `
    <button type="button" class="tone-stop" data-action="set-tone" data-tone="${t.key}" aria-pressed="${i === active}">
      <span class="tone-dot"><span></span></span>
      <span class="tone-label">${t.name} ${t.emoji}</span>
      ${t.key === recommended ? '<span class="tone-rec">추천</span>' : ''}
    </button>`).join('');

  const segs = TONES.map((t, i) => `
    <button type="button" data-action="set-tone" data-tone="${t.key}" aria-pressed="${i === active}">
      <span class="seg-emoji">${t.emoji}</span>${t.name}
    </button>`).join('');

  return `
    <section class="tone">
      <div class="tone-head">
        <div class="tone-title">공손함 <span><span class="desktop-only">· 지금 추천: ${recName} (${recommendBasis(item)})</span><span class="mobile-only">· 추천: ${recName}</span></span></div>
        <div class="tone-desc">남은 일수와 요청 후 경과일을 기준으로 기본 단계를 추천해요.</div>
      </div>
      <div class="tone-slider desktop-only" role="group" aria-label="메일 톤">
        <div class="tone-track"></div>
        <div class="tone-fill" style="width:${active * 25}%"></div>
        <div class="tone-stops">${stops}</div>
      </div>
      <div class="tone-seg mobile-only" role="group" aria-label="메일 톤">${segs}</div>
    </section>`;
}

function preview(mail, dates) {
  const body = mail.segments.map((s) => {
    if (s.kind === 'field') return mailField(s.text, dates);
    if (s.kind === 'reason') return `<span class="m-reason">${esc(s.text)}</span>`;
    return esc(s.text);
  }).join('');

  const cc = mail.cc
    ? `<span class="m-cc">${esc(mail.cc.name)}<span class="desktop-only">${mail.cc.dept ? ` (${esc(mail.cc.dept)})` : ''}</span></span>
       <span class="m-cc-note desktop-only">· 매니저 참조 단계라 담당 매니저를 함께 넣었어요</span>`
    : '<span class="muted-text">없음</span>';

  return `
    <section class="preview">
      <div class="preview-head desktop-only">
        <div class="preview-title">메일 미리보기</div>
        <div class="preview-legend">
          <span><i class="lg-field"></i>자동으로 들어간 값</span>
          <span><i class="lg-reason"></i>일정 근거 문장</span>
        </div>
      </div>
      <div class="mail">
        <dl class="mail-head">
          <dt class="desktop-only">제목</dt><dd class="mail-subject">${esc(mail.subject)}</dd>
          <dt>받는 사람</dt><dd><span class="m-field">${esc(mail.to.name)}</span> <span class="desktop-only">${esc(mail.to.dept)}</span></dd>
          <dt>참조</dt><dd>${cc}</dd>
        </dl>
        <div class="mail-body">${body}</div>
      </div>
    </section>`;
}
