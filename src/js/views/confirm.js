// 외부조회서 작성 — 공통 정보 → 종류 선택 → 선정된 조회처 붙여넣기 → 검증 → 조회서 미리보기·인쇄 → 조회 목록 등록
// 판단(검증·묶기·문안)은 lib/confirmation.js가 하고, 여기서는 그리기만 한다.

import {
  CONF_TYPES, TYPE_ORDER, TRACK_LABEL, validateSetup, parseConfirmations, buildLetters, formatAmount, nextDocNo,
} from '../lib/confirmation.js';
import { esc, ICON } from './html.js';
import { topbar } from './dashboard.js';
import { requesterMembers } from '../lib/team.js';

/**
 * @param state 앱 상태
 * @param opts  { today, isDemo, type, setup, setupErrors, pasteText, bankBlank, resetArmed }
 *   resetArmed: 초기화를 한 번 눌러 확인을 기다리는 중 (브라우저 확인창 대신 버튼을 두 번 누르게 한다)
 */
export function renderConfirm(state, { today, isDemo, type, setup, setupErrors, pasteText, bankBlank, resetArmed }) {
  const t = CONF_TYPES[type];
  return `
    <div class="page confirm">
      ${topbar(state.client, today, isDemo, 'confirm', state.team)}

      <section class="report-head confirm-head">
        <div>
          <h1>외부조회서 작성 <span>· 선정된 조회처 목록으로 표준 조회서를 만들고 조회 목록에 등록해요</span></h1>
        </div>
        <div class="report-actions">
          <button type="button" class="btn ${resetArmed ? 'btn-danger' : 'btn-sub'}" data-action="conf-reset">${resetArmed
            ? '한 번 더 누르면 모두 지워져요'
            : `${ICON.fix}초기화`}</button>
        </div>
      </section>

      <div class="confirm-grid">
        <aside class="confirm-side">
          ${setupForm(setup, setupErrors, requesterMembers(state))}
        </aside>

        <section class="confirm-main">
          <div class="report-block">
            <h2>조회서 종류</h2>
            <div class="segmented conf-types" role="tablist">
              ${TYPE_ORDER.map((k) => `
                <button type="button" role="tab" data-action="conf-type" data-type="${k}" aria-pressed="${k === type}">
                  <span class="seg-label">${CONF_TYPES[k].label}</span>
                  <span class="seg-caption">${TRACK_LABEL[CONF_TYPES[k].track]}</span>
                </button>`).join('')}
            </div>
            ${type === 'bank' ? `
              <label class="conf-check">
                <input type="checkbox" data-action-change="conf-bank-blank" ${bankBlank ? 'checked' : ''}>
                장부금액을 적지 않고 보내기 (공란형) <small>금융기관이 직접 금액을 기재해요</small>
              </label>` : ''}
          </div>

          <div class="report-block">
            <h2>선정된 ${t.unit} 목록 <span>· 엑셀에서 복사해 붙여넣기</span></h2>
            <label class="f">
              <span class="f-label">열 순서: ${t.columns.join(' · ')}
                <small>첫 줄이 제목이면 자동으로 빼요${type === 'arap' ? '' : ` · 같은 ${t.unit}의 여러 행은 한 장으로 묶어요`}</small></span>
              <textarea name="conf-paste" rows="6" data-action-input="conf-paste" placeholder="${esc(t.example)}" spellcheck="false">${esc(pasteText)}</textarea>
            </label>
            <div class="conf-paste-actions">
              <button type="button" class="btn btn-sub" data-action="conf-example">예시 데이터 넣기</button>
              ${pasteText ? '<button type="button" class="btn btn-sub" data-action="conf-clear">지우기</button>' : ''}
            </div>
            <div class="conf-preview">${partiesPreview(type, parseConfirmations(type, pasteText))}</div>
          </div>

          <div class="conf-output">${outputSection(state, { today, type, setup, pasteText, bankBlank })}</div>
        </section>
      </div>
    </div>`;
}

// ---------- 공통 정보 ----------

function field(label, name, value, { type = 'text', placeholder = '', error = '', hint = '' } = {}) {
  return `
    <label class="f ${error ? 'has-error' : ''}">
      <span class="f-label">${label}${hint ? ` <small>${hint}</small>` : ''}</span>
      <input type="${type}" name="${name}" value="${esc(value ?? '')}" placeholder="${esc(placeholder)}" autocomplete="off">
      ${error ? `<span class="f-error">${esc(error)}</span>` : ''}
    </label>`;
}

// 회신처 담당자: 자료 요청의 요청 감사인과 같은 후보(실무진) 중에서 고른다. 팀 정보가 없으면 직접 입력.
function contactField(s, e, members) {
  if (!members.length) return field('담당자', 'contactName', s.contactName, { placeholder: '장재혁 회계사', error: e.contactName });
  return `
    <label class="f ${e.contactName ? 'has-error' : ''}">
      <span class="f-label">담당자 <small>실무진 중에서 · 등록한 조회서의 요청 감사인이 돼요</small></span>
      <select name="contactName">${members.map((m) => `<option value="${esc(m)}" ${m === s.contactName ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select>
      ${e.contactName ? `<span class="f-error">${esc(e.contactName)}</span>` : ''}
    </label>`;
}

function setupForm(s, e, members = []) {
  return `
    <form id="conf-setup" class="conf-setup" novalidate>
      <div class="report-block">
        <h2>발신 회사 <span>· 조회서는 회사 명의로 나가요</span></h2>
        ${field('회사명', 'companyName', s.companyName, { error: e.companyName })}
        ${field('대표이사', 'ceoName', s.ceoName, { placeholder: '정한빛', error: e.ceoName })}
        ${field('회사 주소', 'companyAddress', s.companyAddress, { placeholder: '경기도 성남시 분당구 판교역로 1', error: e.companyAddress })}
      </div>
      <div class="report-block">
        <h2>회신처 <span>· 회신은 감사인에게 직접 와야 해요</span></h2>
        ${field('감사인', 'auditorName', s.auditorName, { error: e.auditorName })}
        ${field('감사인 주소', 'auditorAddress', s.auditorAddress, { error: e.auditorAddress })}
        ${contactField(s, e, members)}
        <div class="owner-grid conf-two">
          ${field('전화', 'contactPhone', s.contactPhone, { placeholder: '02-0000-0000', error: e.contactPhone })}
          ${field('이메일', 'contactEmail', s.contactEmail, { type: 'email', hint: '선택', error: e.contactEmail })}
        </div>
      </div>
      <div class="report-block">
        <h2>일정</h2>
        ${field('조회 기준일', 'baseDate', s.baseDate, { type: 'date', hint: '보통 결산일', error: e.baseDate })}
        <div class="owner-grid conf-two">
          ${field('발송일', 'issuedOn', s.issuedOn, { type: 'date', error: e.issuedOn })}
          ${field('회신 기한', 'replyBy', s.replyBy, { type: 'date', error: e.replyBy })}
        </div>
        <div class="need-note">발송일은 조회 목록의 요청일, 회신 기한은 필요일이 돼요.</div>
      </div>
    </form>`;
}

// ---------- 붙여넣기 미리보기 ----------

const ERR_ORDER = ['name', 'address', 'category', 'amount', 'form', 'duplicate'];
const errText = (errors) => ERR_ORDER.filter((k) => errors[k]).map((k) => errors[k]).join(' · ');

/** textarea 입력 중에 미리보기만 다시 그릴 때도 쓴다. */
export function partiesPreview(type, parsed) {
  const { rows, parties, headerSkipped, errorCount } = parsed;
  if (!rows.length) {
    return `<div class="pp-empty">붙여넣은 내용이 없어요. 표본 선정이 끝난 ${CONF_TYPES[type].unit} 목록을 붙여넣어 주세요.</div>`;
  }
  const badRows = rows.filter((r) => Object.keys(r.errors).length);
  const summary = `${rows.length}행 → 조회서 <b>${parties.length}장</b>${errorCount ? ` · <b class="pp-warn">${errorCount}건 확인 필요</b>` : ''}`;

  const rowErrors = badRows.length ? `
    <div class="conf-row-errors">
      ${badRows.map((r) => `<div><span class="pp-err">${ICON.high}${r.line}행</span> ${esc(r.cells[0] || '(이름 없음)')} — ${esc(errText(r.errors))}</div>`).join('')}
    </div>` : '';

  return `
    <div class="pp-summary">${summary}${headerSkipped ? ' <span>· 첫 줄은 제목으로 보고 뺐어요</span>' : ''}</div>
    ${rowErrors}
    <div class="pp-table conf-table">
      <div class="pp-row pp-head"><div>${CONF_TYPES[type].unit}</div><div>주소</div><div>조회 내용</div><div>행</div></div>
      ${parties.map((p) => partyRow(type, p)).join('')}
    </div>`;
}

function partyRow(type, p) {
  const bad = Object.keys(p.errors).length;
  let content;
  if (type === 'bank') {
    const total = p.entries.reduce((s, e) => s + (e.bookAmount || 0), 0);
    content = `${p.entries.map((e) => esc(e.category)).join(' · ')}<small>${p.entries.length}개 항목 · 장부 ${formatAmount(total)}원</small>`;
  } else if (type === 'inventory') {
    const total = p.goods.reduce((s, g) => s + (g.bookAmount || 0), 0);
    content = `${p.goods.map((g) => esc(g.item)).join(' · ')}<small>${p.goods.length}개 품목${total ? ` · 장부 ${formatAmount(total)}원` : ''}</small>`;
  } else if (type === 'arap') {
    content = `채권 ${formatAmount(p.receivable)} · 채무 ${formatAmount(p.payable)}<small>${p.blank ? '공란형 (금액 미기재)' : '금액 기재형'}</small>`;
  } else {
    content = p.matters.length ? `${p.matters.length}건<small>${esc(p.matters[0])}${p.matters.length > 1 ? ' 외' : ''}</small>` : '사건 미기재<small>전체 조회</small>';
  }
  const name = (type === 'bank' || type === 'inventory') && p.branch ? `${p.name} ${p.branch}` : p.name;
  return `
    <div class="pp-row ${bad ? 'is-error' : ''}">
      <div class="pp-name">${esc(name)}${type === 'legal' && p.lawyer ? `<small>${esc(p.lawyer)}</small>` : ''}</div>
      <div class="conf-addr">${bad && p.errors.address ? `<span class="pp-err">${ICON.high}${esc(p.errors.address)}</span>` : esc(p.address)}${p.errors.duplicate ? `<span class="pp-err">${ICON.high}${esc(p.errors.duplicate)}</span>` : ''}</div>
      <div class="conf-content">${content}</div>
      <div class="pp-date">${p.lines.join(', ')}</div>
    </div>`;
}

// ---------- 결과: 조회서 미리보기 + 등록 ----------

/** 입력이 바뀔 때 이 영역만 다시 그린다. */
export function outputSection(state, { today, type, setup, pasteText, bankBlank }) {
  const parsed = parseConfirmations(type, pasteText);
  const { errors, value } = validateSetup(setup, today);
  const missing = [];
  if (!value) missing.push(`공통 정보 ${Object.keys(errors).length}곳`);
  if (!parsed.parties.length) missing.push(`${CONF_TYPES[type].unit} 목록`);
  else if (parsed.errorCount) missing.push(`목록 오류 ${parsed.errorCount}건`);

  if (missing.length) {
    return `
      <div class="report-block conf-wait">
        <h2>조회서 미리보기</h2>
        <p>${missing.join(' · ')}을(를) 확인하면 조회서가 여기에 만들어져요.</p>
      </div>`;
  }

  const letters = buildLetters(type, parsed.parties, value, { startNo: nextDocNo(state.items, type), bankBlank });
  return `
    <div class="report-block">
      <div class="conf-out-head">
        <h2>조회서 미리보기 <span>· ${letters.length}장 · ${letters[0].docNo}${letters.length > 1 ? ` ~ ${letters.at(-1).docNo}` : ''}</span></h2>
        <div class="report-actions">
          <button type="button" class="btn btn-sub" data-action="conf-print">${ICON.download}인쇄 · PDF 저장</button>
          <button type="button" class="btn btn-cta" data-action="conf-register">조회 목록에 ${letters.length}건 등록</button>
        </div>
      </div>
      <p class="need-note">등록하면 대시보드에서 ${CONF_TYPES[type].unit}별로 회신을 추적하고 독촉 메일을 만들 수 있어요. ${{ required: '금액과 상관없이 전부 회수해야 하는 조회서예요.', coverage: '수행중요성 대비 금액 커버리지로 관리하는 조회서예요.', general: '회신 여부와 내용으로 관리하는 조회서예요.' }[CONF_TYPES[type].track]}</p>
    </div>
    <div class="letters">${letters.map(letterHtml).join('')}</div>`;
}

function tableHtml(table) {
  if (!table) return '';
  const amount = new Set(table.amountCols);
  return `
    ${table.caption ? `<div class="lt-caption">${esc(table.caption)}</div>` : ''}
    <table class="lt-table">
      <thead><tr>${table.columns.map((c, i) => `<th class="${amount.has(i) ? 'is-amt' : ''}">${esc(c)}</th>`).join('')}</tr></thead>
      <tbody>${table.rows.map((r) => `<tr>${r.map((c, i) => `<td class="${amount.has(i) ? 'is-amt' : ''}">${esc(c) || '&nbsp;'}</td>`).join('')}</tr>`).join('')}</tbody>
    </table>`;
}

/** 조회서 한 장 (A4). 인쇄할 때는 이 부분만 나간다. */
export function letterHtml(l) {
  return `
    <article class="letter">
      <div class="lt-meta"><span>문서번호 ${esc(l.docNo)}</span><span>${esc(l.issuedOn)}</span></div>
      <h3 class="lt-title">${esc(l.title)}</h3>
      ${l.blank ? '<div class="lt-badge">금액 미기재 (공란형)</div>' : ''}

      <dl class="lt-addr">
        <div><dt>수신</dt><dd><b>${esc(l.to.name)}</b> 귀중${l.to.attn ? ` (${esc(l.to.attn)})` : ''}<br><small>${esc(l.to.address)}</small></dd></div>
        <div><dt>발신</dt><dd><b>${esc(l.from.company)}</b> 대표이사 ${esc(l.from.ceo)}<br><small>${esc(l.from.address)}</small></dd></div>
      </dl>

      ${l.paragraphs.map((p) => `<p class="lt-p">${esc(p)}</p>`).join('')}
      ${tableHtml(l.table)}
      ${l.requests ? `<ol class="lt-requests">${l.requests.map((r) => `<li>${esc(r)}</li>`).join('')}</ol>` : ''}
      <ul class="lt-notes">${l.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>

      <div class="lt-sign">
        <span>${esc(l.from.company)}</span>
        <span>대표이사 ${esc(l.from.ceo)} <span class="lt-seal">(인)</span></span>
      </div>

      <div class="lt-reply-to">
        <b>회신처 · ${esc(l.replyBy)}까지</b>
        <span>${esc(l.replyTo.auditor)} · ${esc(l.replyTo.address)}</span>
        <span>담당 ${esc(l.replyTo.contact)}${l.replyTo.phone ? ` · ${esc(l.replyTo.phone)}` : ''}${l.replyTo.email ? ` · ${esc(l.replyTo.email)}` : ''}</span>
      </div>

      <div class="lt-cut">절 취 선 · 아래는 조회처에서 작성하여 회신처로 직접 보내 주세요</div>
      <div class="lt-reply">
        <b>${esc(l.reply.heading)}</b>
        ${l.reply.statements.map((s) => `<div class="lt-check"><span class="lt-box"></span>${esc(s)}</div>`).join('')}
        <div class="lt-signline"><span>${esc(l.reply.signer)}</span><span>(서명 또는 인)</span></div>
        <div class="lt-signline"><span>회신일</span><span>년 &nbsp;&nbsp; 월 &nbsp;&nbsp; 일</span></div>
      </div>
    </article>`;
}
