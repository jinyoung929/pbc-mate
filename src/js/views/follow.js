// 외부조회 후속 절차 — 미회수 확정(대체적 절차 가이드) / 금액 차이(조정 기록)
// 데스크톱은 대시보드 위 오른쪽 패널, 모바일(720px 이하)은 전체 화면. 판단은 lib/followup.js.

import { formatMD } from '../lib/dates.js';
import {
  FOLLOW_TYPES, DIFF_CAUSES, DELIVERY_TERMS, noReplySteps, noReplyNotice, reconcile, reconConclusion, completeCheck,
} from '../lib/followup.js';
import { TRACK_LABEL } from '../lib/confirmation.js';
import { esc, ICON } from './html.js';

const won = (n) => Number(n || 0).toLocaleString('ko-KR');
const ROLE_LABEL = { alt: '대체적 절차', escalate: '회수 재시도·보고', support: '보조 증거' };
const RESULT_CLASS = { matched: 'is-ok', timing: 'is-ok', misstatement: 'is-bad', open: 'is-open' };

/**
 * @param state 앱 상태
 * @param opts  { today, itemId, owner, signoff, signoffErrors }
 *   owner: 증빙을 요청할 회사 담당자 · signoff: { preparer, completedOn, reviewer } 완료 기록 입력값
 */
export function renderFollow(state, { today, itemId, owner, signoff = {}, signoffErrors = {} }) {
  const item = state.items.find((x) => x.id === itemId);
  const f = item.follow;
  const check = completeCheck(item);
  const owners = [...new Set(state.items.filter((x) => x.kind !== 'confirmation').map((x) => x.owner))];

  const typeBtns = Object.values(FOLLOW_TYPES).map((t) => `
    <button type="button" class="reason-btn" data-action="start-follow" data-type="${t.key}" data-item="${esc(item.id)}" aria-pressed="${f.type === t.key}">
      <b>${t.label}</b><small>${t.hint}</small>
    </button>`).join('');

  return `
    <div class="drawer-dim" data-action="close-drawer"></div>
    <aside class="drawer follow" role="dialog" aria-modal="true" aria-labelledby="follow-title">
      <header class="m-header mobile-only">
        <button type="button" class="icon-btn" data-action="close-drawer" aria-label="뒤로">${ICON.back}</button>
        <div class="m-header-title">후속 절차</div>
      </header>

      <div class="drawer-body">
        <div class="compose-head">
          <div class="compose-who">
            <div class="eyebrow desktop-only">외부조회 후속 절차 · ${formatMD(f.startedOn)} 시작</div>
            <h2 id="follow-title">${esc(item.name)}</h2>
            <div class="fix-sub">${TRACK_LABEL[item.track] || ''}${item.bookAmount ? ` · 장부 ${won(item.bookAmount)}원` : ''} · 회신 기한 ${formatMD(item.neededOn)}</div>
          </div>
          <button type="button" class="icon-btn btn-sub desktop-only" data-action="close-drawer" aria-label="닫기">${ICON.close}</button>
        </div>

        <section class="fix-reason">
          <div class="section-label">회신 결과</div>
          <div class="reason-grid" role="group" aria-label="회신 결과">${typeBtns}</div>
        </section>

        ${f.type === 'noreply' ? noReplyBody(item, f) : diffBody(item, f)}

        ${evidenceBox(item, f, owner, owners)}

        ${signoffBox(signoff, signoffErrors)}
      </div>

      <footer class="compose-foot">
        <div class="foot-note ${check.ok ? 'is-done' : ''}">${check.ok
          ? `${ICON.done}완료할 수 있어요. 결론이 기록되고 대시보드에서 완료로 바뀌어요.`
          : esc(check.reason)}</div>
        <div class="foot-actions">
          <button type="button" class="btn btn-cta" data-action="complete-follow" ${check.ok ? '' : 'disabled'}>${ICON.done}<span>후속 절차 완료</span></button>
        </div>
      </footer>
    </aside>`;
}

// ---------- 완료 기록 (감사기준서 230: 수행자·완료일·검토자) ----------

function signoffBox(s, e) {
  const field = (label, name, value, { type = 'text', hint = '', placeholder = '' } = {}) => `
    <label class="f ${e[name] ? 'has-error' : ''}">
      <span class="f-label">${label}${hint ? ` <small>${hint}</small>` : ''}</span>
      <input type="${type}" data-action-input="follow-signoff" data-field="${name}" value="${esc(s[name] ?? '')}" placeholder="${esc(placeholder)}" autocomplete="off">
      ${e[name] ? `<span class="f-error">${esc(e[name])}</span>` : ''}
    </label>`;
  return `
    <section class="fu-signoff">
      <div class="section-label">완료 기록 <small class="fu-count">조서에 남길 수행자와 검토자</small></div>
      <div class="fu-signoff-grid">
        ${field('수행자', 'preparer', s.preparer, { placeholder: '예: 장재혁' })}
        ${field('완료일', 'completedOn', s.completedOn, { type: 'date' })}
        ${field('검토자', 'reviewer', s.reviewer, { hint: '선택 · 나중에 채워도 돼요', placeholder: '예: 이서연 매니저' })}
      </div>
    </section>`;
}

// ---------- 미회수 ----------

function noReplyBody(item, f) {
  const steps = noReplySteps(item).map((s) => `
    <label class="fu-step ${f.steps?.[s.key] ? 'is-done' : ''}">
      <input type="checkbox" data-action-change="follow-step" data-step="${s.key}" ${f.steps?.[s.key] ? 'checked' : ''}>
      <span class="fu-step-text">
        <b>${esc(s.label)} <span class="fu-role fu-role-${s.role}">${ROLE_LABEL[s.role]}</span></b>
        <small>${esc(s.detail)}</small>
      </span>
    </label>`).join('');

  const pct = item.bookAmount ? Math.round(((f.verified || 0) / item.bookAmount) * 100) : 0;
  const verified = item.track === 'coverage' ? `
    <section class="fu-verified">
      <label class="f">
        <span class="f-label">대체적 절차로 확인한 금액 <small>장부 ${won(item.bookAmount)}원 중</small></span>
        <input type="text" inputmode="numeric" data-action-change="follow-verified" value="${won(f.verified)}" autocomplete="off">
      </label>
      <div class="fu-meter" role="img" aria-label="확인 비율 ${pct}%"><span style="width:${pct}%"></span></div>
      <small class="need-note">${pct}% 확인 · 이 금액이 커버리지에 반영돼요</small>
    </section>` : '';

  return `
    <div class="fix-alert ${item.track === 'required' ? 'is-required' : ''}">
      <span class="fix-alert-icon">${item.track === 'required' ? ICON.high : ICON.help}</span>
      <div><b>${item.track === 'required' ? '대체적 절차로 끝낼 수 없는 조회예요' : item.track === 'general' ? '회신 대신 다른 경로로 소송·우발부채를 확인해요' : '회신 대신 다른 증거로 잔액을 확인해요'}</b>
        <small>${esc(noReplyNotice(item))}</small></div>
    </div>
    <section class="fix-status">
      <div class="section-label">진행할 절차 <small class="fu-count">${Object.values(f.steps || {}).filter(Boolean).length}/${noReplySteps(item).length} 완료</small></div>
      <div class="fu-steps">${steps}</div>
    </section>
    ${verified}`;
}

// ---------- 금액 차이 ----------

// 미착품은 인도조건에 따라 시점 차이(선적지 인도)인지 기간귀속 오류(도착지 인도)인지 갈린다.
function termsRow(l, i) {
  const picked = DELIVERY_TERMS.find((t) => t.key === l.terms);
  return `
    <div class="fu-terms ${l.terms ? '' : 'is-pending'} ${l.terms === 'destination' ? 'is-bad' : ''}">
      <span>인도조건 확인</span>
      <select data-action-change="follow-line" data-index="${i}" data-field="terms" aria-label="인도조건">
        <option value="">확인 전</option>
        ${DELIVERY_TERMS.map((t) => `<option value="${t.key}" ${t.key === l.terms ? 'selected' : ''}>${t.label}</option>`).join('')}
      </select>
      <small>${picked ? esc(picked.hint) : '계약서·거래명세서로 인도조건을 확인해 주세요. 도착지 인도면 회사의 기간귀속 오류예요.'}</small>
    </div>`;
}

function diffBody(item, f) {
  const recon = f.recon || { lines: [] };
  const r = reconcile(recon);
  const hasConfirmed = recon.confirmed !== null && recon.confirmed !== undefined && recon.confirmed !== '';

  const causeOptions = (selected) => [`<option value="">원인 선택</option>`,
    ...DIFF_CAUSES.map((c) => `<option value="${c.key}" ${c.key === selected ? 'selected' : ''}>${c.label}</option>`)].join('');

  const lines = (recon.lines || []).map((l, i) => `
    <div class="fu-line">
      <select data-action-change="follow-line" data-index="${i}" data-field="cause" aria-label="차이 원인">${causeOptions(l.cause)}</select>
      <input type="text" inputmode="numeric" data-action-change="follow-line" data-index="${i}" data-field="amount" value="${l.amount ? won(l.amount) : ''}" placeholder="금액" aria-label="금액">
      <input type="text" data-action-change="follow-line" data-index="${i}" data-field="note" value="${esc(l.note || '')}" placeholder="근거 (예: 1/3 입고분)" aria-label="근거">
      <button type="button" class="icon-btn btn-sub" data-action="follow-remove-line" data-index="${i}" aria-label="이 줄 삭제">${ICON.close}</button>
    </div>
    ${l.cause === 'goods' ? termsRow(l, i) : ''}`).join('');

  return `
    <section class="fu-recon">
      <div class="section-label">차이 조정표</div>
      <div class="fu-amounts">
        <label class="f"><span class="f-label">장부금액</span>
          <input type="text" inputmode="numeric" data-action-change="follow-amount" data-field="book" value="${won(recon.book)}" autocomplete="off"></label>
        <label class="f"><span class="f-label">회신금액</span>
          <input type="text" inputmode="numeric" data-action-change="follow-amount" data-field="confirmed" value="${hasConfirmed ? won(recon.confirmed) : ''}" placeholder="회신서의 금액" autocomplete="off"></label>
        <div class="fu-diff"><small>차이 (장부 − 회신)</small><b>${hasConfirmed ? `${won(r.diff)}원` : '—'}</b></div>
      </div>

      ${hasConfirmed && r.diff !== 0 ? `
        <div class="fu-lines">
          <div class="fu-line fu-line-head"><div>차이 원인</div><div>금액</div><div>근거</div><div></div></div>
          ${lines || '<div class="pp-empty">원인을 추가해 차이를 설명해 주세요.</div>'}
          <button type="button" class="btn btn-sub fu-add" data-action="follow-add-line">${ICON.plus}원인 추가</button>
        </div>
        <dl class="fu-sum">
          <div><dt>설명된 금액</dt><dd>${won(r.explained)}원</dd></div>
          <div class="${r.unexplained ? 'is-open' : ''}"><dt>설명되지 않은 차이</dt><dd>${won(r.unexplained)}원</dd></div>
          <div class="${r.misstatement ? 'is-bad' : ''}"><dt>왜곡표시 후보</dt><dd>${won(r.misstatement)}원</dd></div>
        </dl>` : ''}

      ${hasConfirmed ? `<div class="fu-result ${RESULT_CLASS[r.result]}"><small>조서 결론</small><b>${esc(reconConclusion(r))}</b></div>` : ''}
    </section>`;
}

// ---------- 회사에 증빙 요청 (기존 자료 요청으로 연결) ----------

function evidenceBox(item, f, owner, owners) {
  const requested = new Set(f.requested || []);
  let rows;
  if (f.type === 'diff') {
    rows = [{ key: 'diff', label: `차이 소명 자료 (${item.counterparty})` }];
  } else {
    rows = noReplySteps(item).filter((s) => s.evidence).map((s) => ({ key: s.key, label: s.evidence }));
  }
  if (!rows.length) return '';

  return `
    <section class="fu-evidence">
      <div class="section-label">회사에 요청할 증빙 <small class="fu-count">자료 요청 목록에 추가돼 독촉까지 이어져요</small></div>
      <label class="f fu-owner">
        <span class="f-label">회사 담당자</span>
        <input type="text" data-action-input="follow-owner" value="${esc(owner || '')}" placeholder="예: 김민지 대리" list="follow-owners" autocomplete="off">
        <datalist id="follow-owners">${owners.map((o) => `<option value="${esc(o)}">`).join('')}</datalist>
      </label>
      <div class="fu-ev-list">
        ${rows.map((r) => `
          <div class="fu-ev">
            <span>${esc(r.label)}</span>
            ${requested.has(r.key)
              ? `<span class="status status-done">${ICON.done}요청함</span>`
              : `<button type="button" class="btn btn-sub" data-action="follow-request" data-key="${r.key}">자료 요청 만들기</button>`}
          </div>`).join('')}
      </div>
    </section>`;
}
