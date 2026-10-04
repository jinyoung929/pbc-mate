// 6. 자료 추가 — 레퍼런스 6 / 6-1
// 데스크톱은 가운데 모달, 모바일(720px 이하)은 전체 화면.

import { formatMD, formatMDW, daysBetween } from '../lib/dates.js';
import { riskOf, leftText } from '../lib/priority.js';
import { parsePaste, markDuplicates, rowErrorText, leftOf, normalizeDate } from '../lib/add.js';
import { PBC_TEMPLATES, TEMPLATE_ORDER, templateForName, defaultBasisDate } from '../lib/pbcTemplate.js';
import { esc, ICON, RISK_LABEL } from './html.js';

export const PASTE_EXAMPLE = [
  '자료명\t담당자\t요청일\t필요일\t감사절차',
  '재고수불부\t김민지 대리\t2026-09-30\t2026-10-07\t재고 실증',
  '매입채무 명세서\t박준호 과장\t2026-09-29\t2026-10-09\t매입채무 검증',
].join('\n');

/**
 * @param state 앱 상태
 * @param opts  { today, tab: 'single'|'paste', form, errors, pasteText, source }
 *   source: 외부조회 후속 절차에서 연 경우 { itemId, key, counterparty } — 값이 미리 채워져 있다
 */
export function renderAdd(state, { today, tab, form, errors, pasteText, source }) {
  const parsed = markDuplicates(parsePaste(pasteText, today), state.items);
  return `
    <div class="drawer-dim" data-action="close-drawer"></div>
    <div class="modal add" role="dialog" aria-modal="true" aria-labelledby="add-title">
      <header class="m-header mobile-only">
        <button type="button" class="icon-btn" data-action="close-drawer" aria-label="뒤로">${ICON.back}</button>
        <div class="m-header-title">자료 추가</div>
      </header>

      <div class="modal-body">
        <div class="modal-head desktop-only">
          <h2 id="add-title">자료 추가</h2>
          <button type="button" class="icon-btn btn-sub" data-action="close-drawer" aria-label="닫기">${ICON.close}</button>
        </div>

        <div class="segmented add-tabs" role="tablist">
          <button type="button" role="tab" data-action="add-tab" data-tab="single" aria-pressed="${tab === 'single'}">한 건씩 입력</button>
          <button type="button" role="tab" data-action="add-tab" data-tab="paste" aria-pressed="${tab === 'paste'}">여러 건 붙여넣기 (엑셀)</button>
        </div>

        ${source ? `<div class="add-source">${ICON.follow}<span><b>외부조회 후속 절차에서 요청하는 증빙이에요</b>
          <small>${esc(source.counterparty)} · 값이 미리 채워져 있어요. 확인하고 필요한 곳만 고쳐 주세요.</small></span></div>` : ''}
        ${tab === 'single' ? singleForm(state, today, form, errors) : pasteForm(state, today, pasteText, parsed)}
      </div>

      <footer class="modal-foot">
        <button type="button" class="btn btn-sub" data-action="close-drawer">취소</button>
        ${tab === 'single'
          ? `<button type="submit" form="add-form" class="btn btn-cta">추가하기</button>`
          : pasteSubmit(parsed)}
      </footer>
    </div>`;
}

function field(label, name, value, { type = 'text', placeholder = '', error = '', hint = '', list = '' } = {}) {
  return `
    <label class="f ${error ? 'has-error' : ''}">
      <span class="f-label">${label}${hint ? ` <small>${hint}</small>` : ''}</span>
      <input type="${type}" name="${name}" value="${esc(value ?? '')}" placeholder="${esc(placeholder)}" ${list ? `list="${list}"` : ''} autocomplete="off">
      ${error ? `<span class="f-error">${esc(error)}</span>` : ''}
    </label>`;
}

function singleForm(state, today, form, errors) {
  // 자료 요청은 회사 담당자에게 한다. 외부조회의 조회처(은행·거래처 등)는 최근 담당자에서 뺀다.
  const counterparties = new Set(state.items.filter((x) => x.kind === 'confirmation').map((x) => x.owner));
  const owners = Object.keys(state.people).filter((o) => !counterparties.has(o));
  const chips = owners.map((o) => `
    <button type="button" class="owner-chip" data-action="pick-owner" data-owner="${esc(o)}" data-dept="${esc(state.people[o].dept || '')}">${esc(o)}</button>`).join('');
  const procedures = [...new Set(state.items.map((x) => x.procedure).filter(Boolean))];

  return `
    <form id="add-form" class="add-single" data-action-submit="add-single" novalidate>
      <div class="add-col">
        ${templatePicker(form)}
        ${field('자료명', 'name', form.name, { placeholder: '예: 차입금 약정서 사본', error: errors.name })}
        ${templatePreview(state, today, form, errors)}
        <div class="f-group">
          <span class="f-label">담당자</span>
          <div class="owner-grid">
            ${field('이름', 'ownerName', form.ownerName, { placeholder: '박준호', error: errors.ownerName })}
            ${field('직함', 'ownerTitle', form.ownerTitle, { placeholder: '과장', hint: '선택' })}
            ${field('부서', 'dept', form.dept, { placeholder: '재무팀', hint: '선택' })}
          </div>
          ${owners.length ? `<div class="recent-owners"><span>최근 담당자</span>${chips}</div>` : ''}
        </div>
        ${field('요청일', 'requestedOn', form.requestedOn ?? today, { type: 'date', error: errors.requestedOn })}
        <div class="need-note">새 자료는 ‘미회신’으로 시작해요. 받은 뒤에는 자료 화면에서 상태를 바꿔요.</div>
      </div>

      <div class="add-col need-panel">
        ${field('이 자료를 쓰는 감사 절차', 'procedure', form.procedure, { placeholder: '예: 차입금 실증', hint: '선택 · 독촉 메일의 일정 근거에 들어가요', list: 'procedure-list' })}
        <datalist id="procedure-list">${procedures.map((p) => `<option value="${esc(p)}">`).join('')}</datalist>
        ${field('필요일', 'neededOn', form.neededOn, { type: 'date', error: errors.neededOn, hint: '감사 절차를 시작하는 날' })}
        ${needPreview(form.neededOn, today)}
        <div class="need-note">필요일을 기준으로 남은 날·위험도·우선순위가 대시보드에서 자동으로 계산돼요.</div>
      </div>
    </form>`;
}

// ---------- 표준 양식 ----------
// 고르면 자료명·감사 절차가 채워지고, 기준일과 필수 컬럼이 박힌 요청 양식을 복사할 수 있다.

function currentTemplate(form) {
  return PBC_TEMPLATES[form.template] || templateForName(form.name);
}

function templatePicker(form) {
  const picked = currentTemplate(form)?.key;
  return `
    <div class="tpl-picker">
      <span class="f-label">표준 양식 <small>선택 · 기준일과 필수 항목을 정해서 요청해요</small></span>
      <div class="tpl-chips">
        ${TEMPLATE_ORDER.map((k) => `<button type="button" class="owner-chip" data-action="pick-template" data-template="${k}" aria-pressed="${picked === k}">${PBC_TEMPLATES[k].name}</button>`).join('')}
      </div>
      <input type="hidden" name="template" value="${esc(picked || '')}">
    </div>`;
}

function templatePreview(state, today, form, errors) {
  const t = currentTemplate(form);
  if (!t) return '';
  const basis = form.basisDate || defaultBasisDate(state, today);
  return `
    <div class="tpl-preview">
      ${field('자료 기준일', 'basisDate', basis, { type: 'date', error: errors.basisDate, hint: '받은 자료를 이 기준일로 점검해요' })}
      <div class="tpl-cols"><span>필수 항목</span>${t.columns.map((c) => `<i>${esc(c)}</i>`).join('')}</div>
      ${t.sign ? `<div class="tpl-line"><span>서명</span>${esc(t.sign)}</div>` : ''}
      <div class="tpl-line"><span>확인 포인트</span>${t.checks.map(esc).join(' · ')}</div>
      <button type="button" class="btn btn-sub tpl-copy" data-action="copy-template">${ICON.copy}엑셀용 요청 양식 복사</button>
    </div>`;
}

// 필요일을 고르면 남은 날과 위험도를 미리 보여준다.
function needPreview(neededOn, today) {
  const iso = normalizeDate(neededOn, today);
  if (!iso) {
    return `<div class="need-preview is-empty"><span>필요일을 고르면 남은 날과 위험도를 미리 보여드려요.</span></div>`;
  }
  const left = daysBetween(today, iso);
  const risk = riskOf(left);
  return `
    <div class="need-preview">
      <div><small>필요일</small><b>${formatMDW(iso)} <span>· ${leftText(left)}</span></b></div>
      <span class="risk risk-${risk}">${ICON[risk]}${RISK_LABEL[risk]}</span>
    </div>`;
}

function pasteForm(state, today, pasteText, parsed) {
  return `
    <div class="add-paste">
      <label class="f">
        <span class="f-label">엑셀에서 복사한 행을 붙여넣으세요
          <small>열 순서: 자료명 · 담당자 · 요청일 · 필요일 · 감사절차(선택) — 첫 줄이 제목이면 자동으로 빼요</small></span>
        <textarea name="paste" rows="5" data-action-input="paste" placeholder="${esc(PASTE_EXAMPLE)}" spellcheck="false">${esc(pasteText)}</textarea>
      </label>
      <div class="paste-preview">${pastePreview(parsed, today)}</div>
      <div class="need-note">담당자는 기존 목록과 이름이 같으면 자동으로 묶여요 · 모두 ‘미회신’으로 시작해요</div>
    </div>`;
}

/** textarea 입력 중에 미리보기만 다시 그릴 때도 쓴다. */
export function pastePreview(parsed, today) {
  const { rows, headerSkipped, errorCount } = parsed;
  if (!rows.length) {
    return `<div class="pp-empty">붙여넣은 내용이 없어요. 엑셀에서 행을 복사해 위에 붙여넣어 주세요.</div>`;
  }
  const summary = `${rows.length}건 인식${errorCount ? ` · <b class="pp-warn">${errorCount}건 확인 필요</b>` : ''}`;
  const sorted = [...rows].sort((a, b) => {
    if (!a.value || !b.value) return (a.value ? 1 : 0) - (b.value ? 1 : 0);
    return leftOf(a.value, today) - leftOf(b.value, today);
  });
  const body = sorted.map((r) => {
    if (!r.value) {
      return `
        <div class="pp-row is-error">
          <div class="pp-name">${esc(r.cells[0] || '(자료명 없음)')}</div>
          <div class="pp-owner">${esc(r.cells[1] || '')}</div>
          <div class="pp-date">${esc(r.cells[2] || '')}</div>
          <div class="pp-date">${esc(r.cells[3] || '')}</div>
          <div class="pp-left"><span class="pp-err">${ICON.high}${rowErrorText(r.errors)}</span></div>
        </div>`;
    }
    const left = leftOf(r.value, today);
    const risk = riskOf(left);
    return `
      <div class="pp-row">
        <div class="pp-name">${esc(r.value.item.name)}${r.value.item.procedure ? `<small>${esc(r.value.item.procedure)}</small>` : ''}</div>
        <div class="pp-owner">${esc(r.value.item.owner)}</div>
        <div class="pp-date">${formatMD(r.value.item.requestedOn)}</div>
        <div class="pp-date">${formatMD(r.value.item.neededOn)}</div>
        <div class="pp-left"><b>${leftText(left)}</b><span class="risk risk-${risk}">${ICON[risk]}${RISK_LABEL[risk]}</span></div>
      </div>`;
  }).join('');

  return `
    <div class="pp-summary">${summary}${headerSkipped ? ' <span>· 첫 줄은 제목으로 보고 뺐어요</span>' : ''}<span class="desktop-only"> · 필요일이 가까운 순</span></div>
    <div class="pp-table">
      <div class="pp-row pp-head"><div>자료명</div><div>담당자</div><div>요청일</div><div>필요일</div><div>남은 날</div></div>
      ${body}
    </div>`;
}

export function pasteSubmit(parsed) {
  const ok = parsed.rows.length > 0 && parsed.errorCount === 0;
  return `<button type="button" class="btn btn-cta" data-action="add-paste" ${ok ? '' : 'disabled'}>${parsed.rows.length ? `${parsed.rows.length}건 추가하기` : '추가하기'}</button>`;
}
