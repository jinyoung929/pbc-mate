// 진입점: 상태를 불러와 화면을 그리고, data-action 클릭을 처리한다.
// 화면 주소: (없음) 대시보드 · #/compose/<자료id> 단건 독촉 · #/bundle/<담당자> 묶음 독촉
//           #/fix/<자료id> 보완 요청 · #/add 자료 추가 (#/add/paste 붙여넣기 탭) · #/report 주간 현황
//           #/calendar 일정 · #/confirm 외부조회서 작성 · #/follow/<자료id> 외부조회 후속 절차

import { todayISO } from './lib/dates.js';
import { withDays } from './lib/priority.js';
import { recommendTone } from './lib/tone.js';
import { buildMail, mailToText } from './lib/mail.js';
import { bundleItems, bundleTone, buildBundleMail, bundleMailToText } from './lib/bundle.js';
import { canOpenFix, currentFixReason, buildFixMail, fixMailToText } from './lib/fix.js';
import { parseNow, clockOf } from './lib/timing.js';
import { validateItem, parsePaste, markDuplicates, duplicateMessage, normalizeDate } from './lib/add.js';
import { PBC_TEMPLATES, templateForName, templateOf, defaultBasisDate, requestSheetTsv, receiptSuggestion } from './lib/pbcTemplate.js';
import { josa } from './lib/korean.js';
import { buildReport, reportToText, reportToCsv, csvFileName, ownerDetail } from './lib/report.js';
import { monthOf, shiftMonth, addEvent, removeEvent, moveEntry, setEventProgress, progressLabel } from './lib/calendar.js';
import { formatMD } from './lib/dates.js';
import { validateTransition, canTransition } from './lib/status.js';
import { sampleDoc } from './lib/sampleDocs.js';
import { renderScan } from './scan.js';
import { currentUser, switchUser, signMail, defaultRequester, isManager, calendarScope, pickRequester, requesterMembers } from './lib/team.js';
import { searchEngagements, engagementById, validateStart, teamFromEngagement } from './lib/engagements.js';
import { SAMPLE_FILES, upgradeSampleAttachments, load, save, clear, sampleState, baseDateOf, copyAndRecord, copyAndRecordFix, addItems, updateItemStatus, createEmptyState } from './store.js';
import { renderDashboard } from './views/dashboard.js';
import { renderEmpty, lookupResults } from './views/empty.js';
import { renderCompose } from './views/compose.js';
import { renderBundle } from './views/bundle.js';
import { renderFix } from './views/fix.js';
import { renderAdd, pastePreview, pasteSubmit } from './views/add.js';
import { renderReport, itemTableBody } from './views/report.js';
import { renderOwner } from './views/owner.js';
import { renderStatusSheet } from './views/status.js';
import { renderCalendar } from './views/calendar.js';
import { renderConfirm, partiesPreview, outputSection } from './views/confirm.js';
import { renderFollow } from './views/follow.js';
import { renderAttach, renderPreview } from './views/attach.js';
import { checkFiles, addAttachments, removeAttachment, newFileId, previewKind, TEXT_PREVIEW_LIMIT } from './lib/attach.js';
import { putFile, getFile, deleteFile, clearFiles } from './files.js';
import { startFollow, completeFollow, clampVerified, evidenceRequests, validateSignoff, FOLLOW_TYPES } from './lib/followup.js';
import {
  CONF_TYPES, defaultSetup, validateSetup, parseConfirmations, buildLetters, toRegistryValues, nextDocNo,
} from './lib/confirmation.js';

// ?today=2026-10-01 처럼 기준일을 직접 지정해 확인할 수 있다.
// ?now=2026-10-02T17:20 은 날짜와 시각을 함께 지정한다 (발송 시점 안내 확인용).
const params = new URLSearchParams(location.search);
const nowParam = parseNow(params.get('now'));
const todayParam = params.get('today') || nowParam?.date || null;

const app = document.getElementById('app');
let state = load();
// 예전에 불러온 예시 첨부(텍스트)를 지금의 문서 이미지로 바꾼다
{
  const up = upgradeSampleAttachments(state);
  if (up.changed.length) {
    state = up.state;
    save(state);
    for (const id of up.changed) deleteFile(id).catch(() => {});
  }
}
let mode = 'need';
let compose = null; // 단건 독촉 화면 상태: { itemId, tone, copied, toast }
let bundle = null;  // 묶음 독촉 화면 상태: { owner, tone, copied, toast }
let fix = null;     // 보완 요청 화면 상태: { itemId, reason, copied, toast }
let add = null;     // 자료 추가 화면 상태: { tab, form, errors, pasteText }
let sheet = null;   // 상태 변경 시트: { itemId, status, reason, basisDate, requiredBasisDate, errors }
const EMPTY_FORM = { lookupOpen: false, query: '', results: null, selectedId: null, myName: '', myTitle: '', errors: {} };
let emptyForm = { ...EMPTY_FORM }; // 첫 실행 화면 입력값
let who = 'all';    // 대시보드 요청 감사인 필터: 'all' | 'me' | 팀원 이름
let cal = null;     // 일정 탭 상태: { month, selected, form: { title, errors }, filter }
let conf = null;    // 외부조회서 작성 상태: { type, setup, touched:Set, pasteText, bankBlank, resetArmed }
let confResetTimer;
let reportQuery = ''; // 주간 보고 자료 목록 검색어
let drawerReturn = null; // 담당자 상세에서 연 패널을 닫으면 돌아갈 주소
let preview = null; // 첨부 미리보기: { itemId, fileId, name, size, kind, url, text, truncated, itemName, blob }
let att = null;     // 파일 첨부 창: { itemId, pending: File[], rejected, justDone, saving }
let fu = null;      // 외부조회 후속 절차 패널: { itemId, owner, signoff: { preparer, completedOn, reviewer }, signoffErrors }

function currentToday() {
  return baseDateOf(state, todayParam, todayISO());
}

// 발송 시점 안내에 쓰는 현재 시각: 날짜는 기준일, 시각은 ?now 또는 기기 시각
function currentClock() {
  return { date: currentToday(), time: nowParam?.time || clockOf().time };
}

function routeParam(name) {
  const m = location.hash.match(new RegExp(`^#/${name}/(.+)$`));
  return m ? decodeURIComponent(m[1]) : null;
}

// 묶음 대상이 2건 이상일 때만 묶음 화면을 연다.
function currentBundle(today) {
  const owner = routeParam('bundle');
  if (!owner) return null;
  const sorted = bundleItems(state.items, owner, today);
  return sorted.length > 1 ? { owner, sorted } : null;
}

function render() {
  if (!state) { app.innerHTML = renderEmpty(emptyForm); return; }
  const today = currentToday();
  const isDemo = !todayParam && Boolean(state.demoDate);

  // 일정 탭: 대시보드 대신 그리는 전체 화면
  if (location.hash === '#/calendar') {
    compose = bundle = fix = add = sheet = null;
    if (!cal) cal = { month: monthOf(today), selected: today, form: { title: '', errors: {} }, filter: 'all' };
    // 회계사는 자기가 요청한 자료의 일정만, 매니저는 팀 전체
    const scoped = calendarScope(state);
    const scopeNote = !scoped.me ? '' : scoped.scope === 'all'
      ? (isManager(state) ? `매니저 화면 · 팀 전체 일정이 보여요` : '')
      : `${scoped.me}${josa(scoped.me, '이', '가')} 요청한 자료와 내 일정만 보여요 · 팀 공통 일정 포함`;
    app.innerHTML = renderCalendar({ ...state, items: scoped.items, events: scoped.events }, { today, isDemo, ...cal, scopeNote }) + attachOverlay();
    document.body.classList.remove('has-drawer');
    return;
  }

  // 외부조회서 작성: 대시보드 대신 그리는 전체 화면
  if (location.hash === '#/confirm') {
    compose = bundle = fix = add = sheet = null;
    if (!conf) {
      conf = {
        type: 'bank', touched: new Set(), pasteText: '', bankBlank: false,
        setup: { ...defaultSetup(state.client, today), ...(state.confirmSetup || {}), issuedOn: today, replyBy: defaultSetup(state.client, today).replyBy },
      };
      // 회신처 담당자는 실무진 중 한 명. 처음 열 때는 상단바에서 고른 사람(매니저면 첫 실무진)으로 시작한다.
      conf.setup.contactName = pickRequester(state, '');
    }
    app.innerHTML = renderConfirm(state, { today, isDemo, ...conf, setupErrors: confSetupErrors(today) }) + attachOverlay();
    document.body.classList.remove('has-drawer');
    return;
  }

  // 주간 현황은 대시보드 대신 그리는 전체 화면. 패널(독촉·보완·추가)은 대시보드 위에서만 연다.
  if (location.hash === '#/report') {
    compose = bundle = fix = add = sheet = null;
    app.innerHTML = renderReport(state, buildReport(state, today), { today, isDemo, query: reportQuery }) + attachOverlay();
    document.body.classList.remove('has-drawer');
    return;
  }

  // 담당자 상세: 주간 보고에서 담당자를 누르면 여는 전체 화면
  const ownerName = routeParam('owner');
  if (ownerName) {
    compose = bundle = fix = add = sheet = null;
    const detail = ownerDetail(state, ownerName, today);
    if (detail) {
      app.innerHTML = renderOwner(state, detail, { today, isDemo }) + attachOverlay();
      document.body.classList.remove('has-drawer');
      return;
    }
  }

  let html = renderDashboard(state, { today, mode, isDemo, who });

  const id = routeParam('compose');
  const item = id && state.items.find((x) => x.id === id && x.status !== 'done');
  if (item) {
    // 화면을 새로 열 때만 추천 톤으로 시작한다. 이후엔 사용자가 고른 톤 유지.
    if (compose?.itemId !== id) {
      compose = { itemId: id, tone: recommendTone(withDays(item, today)), copied: false, toast: false };
    }
    html += renderCompose(state, { today, clock: currentClock(), ...compose });
  } else {
    compose = null;
  }

  const b = currentBundle(today);
  if (b) {
    if (bundle?.owner !== b.owner) {
      bundle = { owner: b.owner, tone: bundleTone(b.sorted), copied: false, toast: false };
    }
    html += renderBundle(state, { sorted: b.sorted, clock: currentClock(), ...bundle });
  } else {
    bundle = null;
  }

  const fixId = routeParam('fix');
  const fixItem = fixId && state.items.find((x) => x.id === fixId);
  if (canOpenFix(fixItem)) {
    if (fix?.itemId !== fixId) {
      fix = { itemId: fixId, reason: currentFixReason(fixItem), copied: false, toast: false };
    }
    html += renderFix(state, { today, ...fix });
  } else {
    fix = null;
  }

  const followId = routeParam('follow');
  const followItem = followId && state.items.find((x) => x.id === followId);
  if (followItem?.status === 'follow') {
    if (fu?.itemId !== followId) {
      // 수행자·검토자는 마지막으로 입력한 값을 기본으로 (완료일은 오늘)
      const last = state.lastSignoff || {};
      fu = { itemId: followId, owner: defaultPbcOwner(), signoffErrors: {},
        signoff: { preparer: last.preparer || '', completedOn: today, reviewer: last.reviewer || '' } };
    }
    html += renderFollow(state, { today, ...fu });
  } else {
    fu = null;
  }

  const addRoute = location.hash === '#/add' || location.hash === '#/add/paste';
  if (addRoute) {
    if (!add) add = { tab: location.hash.endsWith('/paste') ? 'paste' : 'single', form: {}, errors: {}, pasteText: '' };
    html += renderAdd(state, { today, ...add });
  } else {
    add = null;
  }

  // 상태 변경 시트는 단건 독촉·보완 요청 패널이 열려 있을 때만 그 위에 뜬다.
  const sheetItem = sheet && (item || fixItem) && state.items.find((x) => x.id === sheet.itemId);
  if (sheetItem && sheetItem.status !== 'done') {
    html += renderStatusSheet(sheetItem, sheet, today);
  } else {
    sheet = null;
  }

  const focusedTone = document.activeElement?.dataset?.tone;
  const focusedReason = document.activeElement?.dataset?.reason;
  app.innerHTML = html + attachOverlay();
  document.body.classList.toggle('has-drawer', Boolean(item || b || fix || add || fu));
  // 톤·사유를 바꾼 뒤에도 키보드 포커스가 같은 버튼에 남도록 (데스크톱·모바일 중 보이는 쪽)
  if (focusedTone) {
    [...app.querySelectorAll(`[data-tone="${focusedTone}"]`)].find((b) => b.offsetParent)?.focus();
  }
  if (focusedReason) app.querySelector(`[data-reason="${focusedReason}"]`)?.focus();
}

let toastTimer;
function toast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2200);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // clipboard API가 막힌 환경용 대체 방법
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

function closeDrawer() {
  // 담당자 상세에서 연 패널이면 그 화면으로 돌아간다
  if (drawerReturn) {
    const back = drawerReturn;
    drawerReturn = null;
    location.hash = back;
    render();
    return;
  }
  // 샌드박스(iframe)에서는 pushState가 막힐 수 있어 해시를 비우는 방식으로 대신한다.
  try { history.pushState(null, '', location.pathname + location.search); }
  catch { location.hash = ''; }
  render();
}

// 복사 성공 시에만 이력을 남기고, 화면 상태(copied·toast)를 갱신한다.
// record: 기본은 독촉 이력. 보완 요청은 copyAndRecordFix를 넘긴다.
let drawerToastTimer;
async function copyForDrawer(view, { itemIds, text }, record) {
  const result = record
    ? await record(state, currentToday(), text, copyText)
    : await copyAndRecord(state, { itemIds, tone: view.tone, on: currentToday(), text }, copyText);
  if (!result.ok) {
    toast('복사하지 못했어요. 미리보기에서 직접 선택해 복사해 주세요.');
    return;
  }
  state = result.state;
  save(state);
  view.copied = true;
  view.toast = true;
  render();
  clearTimeout(drawerToastTimer);
  drawerToastTimer = setTimeout(() => { view.toast = false; render(); }, 2800);
}

// ---------- 파일 첨부 ----------

// 예시 자료의 첨부 파일을 브라우저 저장소에 만든다 (주간 보고 '첨부자료' 칸에서 열어 볼 수 있게).
// 내용은 예시 안내 문구뿐이다. 저장소가 막힌 환경이면 조용히 넘어간다.
// 예시 첨부: 스캔본처럼 그린 문서 이미지. 그리기에 실패하면 짧은 안내 텍스트로 대신한다.
async function sampleFileBlob(f, item) {
  const setup = { ...(state.confirmSetup || {}), contactName: item.requester || state.confirmSetup?.contactName || '' };
  const doc = sampleDoc(f.id, item, setup);
  if (doc) {
    try { return await renderScan(doc, f.id.length * 31 + item.id.charCodeAt(1)); } catch { /* 아래 텍스트로 */ }
  }
  const text = `${f.name}\n\nPBC Mate 시연용 예시 첨부파일입니다. 실제 자료가 아닙니다.\n자료: ${item.name}\n담당: ${item.owner}\n`;
  return new Blob([text], { type: 'text/plain' });
}

async function seedSampleFiles() {
  for (const f of SAMPLE_FILES) {
    const item = state.items.find((x) => x.id === f.itemId);
    if (!item) continue;
    try { await putFile(f.id, await sampleFileBlob(f, item)); } catch { return; }
  }
}

function attachOverlay() {
  if (preview) return renderPreview(preview);
  const item = att && state?.items.find((x) => x.id === att.itemId);
  if (!item) { att = null; return ''; }
  return renderAttach(item, att);
}

function closePreview() {
  if (preview?.url) URL.revokeObjectURL(preview.url);
  preview = null;
  render();
}

function openAttach(itemId, justDone) {
  att = { itemId, pending: [], rejected: [], justDone, saving: false };
  render();
}

function pickFiles(fileList) {
  const item = state.items.find((x) => x.id === att.itemId);
  const { ok, rejected } = checkFiles([...att.pending, ...fileList], item.attachments || []);
  att.pending = ok;
  att.rejected = rejected;
  render();
}

// 외부조회서: 손댄 칸의 오류만 보여준다 (처음 열었을 때 빨간 칸이 가득하지 않게)
function confSetupErrors(today) {
  const { errors } = validateSetup(conf.setup, today);
  return Object.fromEntries(Object.entries(errors).filter(([k]) => conf.touched.has(k)));
}

function readConfSetup() {
  const form = document.getElementById('conf-setup');
  if (!form || !conf) return;
  for (const el of form.elements) if (el.name) conf.setup[el.name] = el.value;
}

// 붙여넣기·공통 정보가 바뀌면 미리보기와 조회서 영역만 다시 그린다 (입력 포커스 유지)
function refreshConfOutput() {
  const today = currentToday();
  app.querySelector('.conf-preview').innerHTML = partiesPreview(conf.type, parseConfirmations(conf.type, conf.pasteText));
  app.querySelector('.conf-output').innerHTML = outputSection(state, { today, ...conf });
}

// ---------- 외부조회 후속 절차 ----------

// 증빙을 요청할 회사 담당자 기본값: PBC 자료를 가장 많이 맡은 사람
function defaultPbcOwner() {
  const counts = new Map();
  for (const x of state.items) if (x.kind !== 'confirmation') counts.set(x.owner, (counts.get(x.owner) || 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
}

/** '1,250,000' · '-3,000' · '' → 정수 / null */
function numOf(value) {
  const t = String(value ?? '').replace(/[,\s원₩]/g, '');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function setItem(id, fn) {
  state = { ...state, items: state.items.map((x) => (x.id === id ? fn(x) : x)) };
  save(state);
}

function setFollow(fn) {
  setItem(fu.itemId, (x) => ({ ...x, follow: fn(x.follow, x) }));
}

const actions = {
  'set-mode': (el) => { mode = el.dataset.mode; render(); },
  'set-who': (el) => { who = el.dataset.who; render(); },
  // 주간 보고 감사인별 현황 → 대시보드를 그 감사인 자료로
  'show-requester': (el) => {
    who = el.dataset.who === currentUser(state) ? 'me' : el.dataset.who;
    location.hash = '';
    render();
  },
  'load-sample': () => { state = sampleState(); save(state); who = 'all'; render(); seedSampleFiles(); },

  // 첫 실행: 클라이언트명·감사명을 넣고 빈 state로 시작 → 자료 추가 화면으로
  'start-blank': (el) => {
    const form = document.getElementById('engagement-form');
    readEmptyForm();
    emptyForm.errors = validateStart(emptyForm);
    if (Object.keys(emptyForm.errors).length) {
      render();
      app.querySelector('.empty-form .has-error input')?.focus();
      return;
    }
    const eng = engagementById(emptyForm.selectedId);
    state = createEmptyState({ clientName: eng.client, engagement: eng.engagement, team: teamFromEngagement(eng, emptyForm.myName, emptyForm.myTitle) });
    save(state);
    emptyForm = { ...EMPTY_FORM };
    who = 'all';
    location.hash = el.dataset.target === 'paste' ? '#/add/paste' : '#/add';
    render();
  },

  // 첫 화면: 클라이언트 조회 창 (클라이언트명은 이 창에서만 입력)
  'eng-open': () => {
    readEmptyForm();
    emptyForm.lookupOpen = true;
    emptyForm.results = emptyForm.query ? searchEngagements(emptyForm.query) : null;
    render();
    const input = app.querySelector('[name="engQuery"]');
    input?.focus();
    input?.setSelectionRange(input.value.length, input.value.length);
  },
  'eng-close': () => {
    emptyForm.lookupOpen = false;
    render();
  },
  'eng-search': () => {
    emptyForm.query = app.querySelector('[name="engQuery"]')?.value ?? emptyForm.query;
    emptyForm.results = searchEngagements(emptyForm.query);
    app.querySelector('.eng-list').innerHTML = lookupResults(emptyForm.results, emptyForm.query);
    app.querySelector('.eng-list .eng-item')?.focus();
  },
  'eng-pick': (el) => {
    emptyForm.selectedId = el.dataset.id;
    emptyForm.lookupOpen = false;
    delete emptyForm.errors.client;
    render();
    app.querySelector('[name="myName"]')?.focus();
  },

  // 자료 상태 변경 시트
  'open-status': (el) => {
    sheet = { itemId: el.dataset.item, status: null, reason: null, basisDate: '', requiredBasisDate: '', errors: {},
      check: { basisOk: null, missing: [], signOk: null } }; // 받은 자료 점검 (표준 양식 자료만 화면에 보임)
    render();
  },
  'close-status': () => { sheet = null; render(); },
  // 받은 자료 점검 → 점검 결과에 맞춰 상태·보완 사유를 골라 둔다 (지금 상태에서 바꿀 수 있을 때만)
  'check-basis': (el) => { readSheetDates(); sheet.check.basisOk = el.dataset.ok === '1'; applyReceiptCheck(); },
  'check-sign': (el) => { readSheetDates(); sheet.check.signOk = el.dataset.ok === '1'; applyReceiptCheck(); },
  'check-col': (el) => {
    readSheetDates();
    const col = el.dataset.col;
    const m = sheet.check.missing;
    sheet.check.missing = m.includes(col) ? m.filter((c) => c !== col) : [...m, col];
    applyReceiptCheck();
  },
  // 표준 양식 고르기 (자료 추가)
  'pick-template': (el) => {
    const prev = PBC_TEMPLATES[add.form.template] || templateForName(add.form.name);
    add.form = readAddForm();
    const t = PBC_TEMPLATES[el.dataset.template];
    add.form.template = t.key;
    // 비어 있거나 다른 양식 값이 들어 있으면 이 양식 값으로 바꾼다 (직접 고친 값은 둔다)
    if (!add.form.name || add.form.name === prev?.name) add.form.name = t.name;
    if (!add.form.procedure || add.form.procedure === prev?.procedure) add.form.procedure = t.procedure;
    if (!add.form.basisDate) add.form.basisDate = defaultBasisDate(state, currentToday());
    add.errors = {};
    render();
  },
  // 엑셀용 요청 양식 복사: 자료 추가 창이면 입력 중인 값, 독촉 패널이면 그 자료 기준
  'copy-template': async (el) => {
    let t; let basis;
    if (el.dataset.item) {
      const item = state.items.find((x) => x.id === el.dataset.item);
      t = templateOf(item);
      basis = item.basisDate || defaultBasisDate(state, currentToday());
    } else {
      add.form = readAddForm();
      t = PBC_TEMPLATES[add.form.template] || templateForName(add.form.name);
      basis = normalizeDate(add.form.basisDate, currentToday()) || defaultBasisDate(state, currentToday());
    }
    if (!t) return;
    const ok = await copyText(requestSheetTsv(t, basis));
    toast(ok ? `${t.name} 요청 양식을 복사했어요. 엑셀에 붙여넣으면 기준일과 항목이 들어가요.` : '복사하지 못했어요.');
  },
  'pick-status': (el) => {
    readSheetDates();
    sheet.status = el.dataset.status;
    sheet.errors = {};
    if (sheet.status === 'fix' && !sheet.reason) sheet.reason = 'date';
    render();
  },
  'pick-fix-reason': (el) => { readSheetDates(); sheet.reason = el.dataset.reason; sheet.errors = {}; render(); },
  'save-status': () => {
    readSheetDates();
    const item = state.items.find((x) => x.id === sheet.itemId);
    const change = { status: sheet.status, reason: sheet.reason, basisDate: sheet.basisDate, requiredBasisDate: sheet.requiredBasisDate };
    sheet.errors = validateTransition(item, change);
    if (Object.keys(sheet.errors).length) { render(); return; }

    state = updateItemStatus(state, item.id, change, currentToday());
    if (change.status === 'fix' && sheet.detail && (change.reason === 'missing' || change.reason === 'sign')) {
      setItem(item.id, (x) => ({ ...x, fix: { ...x.fix, details: { ...(x.fix?.details || {}), [change.reason]: sheet.detail } } }));
    }
    save(state);
    sheet = null;
    const name = `‘${item.name}’${josa(item.name, '을', '를')}`;
    if (change.status === 'done') {
      closeDrawer();
      openAttach(item.id, true);
      toast(`${name} 완료로 처리했어요.`);
    } else if (change.status === 'fix') {
      location.hash = `#/fix/${encodeURIComponent(item.id)}`;
      render();
      toast(`${name} 보완 요청으로 바꿨어요. 사유에 맞는 재요청 메일을 준비했어요.`);
    } else {
      location.hash = `#/compose/${encodeURIComponent(item.id)}`;
      render();
      toast(`${name} 일부 수령으로 바꿨어요. 나머지는 계속 독촉할 수 있어요.`);
    }
  },

  'set-tone': (el) => { compose.tone = el.dataset.tone; compose.copied = false; render(); },
  'close-compose': closeDrawer,
  'close-drawer': () => {
    // 후속 절차에서 연 자료 추가 창을 닫으면 후속 절차 화면으로 돌아간다
    if (add?.source) { const id = add.source.itemId; add = null; location.hash = `#/follow/${encodeURIComponent(id)}`; render(); return; }
    closeDrawer();
  },
  'copy-mail': () => {
    const today = currentToday();
    const item = withDays(state.items.find((x) => x.id === compose.itemId), today);
    const mail = signMail(buildMail({
      item, person: state.people[item.owner], client: state.client,
      manager: state.team?.manager, today, tone: compose.tone,
    }), currentUser(state));
    return copyForDrawer(compose, { itemIds: [item.id], text: mailToText(mail) });
  },
  'set-reason': (el) => { fix.reason = el.dataset.reason; fix.copied = false; render(); },

  // 자료 추가
  'add-tab': (el) => {
    if (add.tab === 'single') add.form = readAddForm();
    add.tab = el.dataset.tab;
    add.errors = {};
    render();
  },
  'pick-owner': (el) => {
    const [name, ...title] = el.dataset.owner.split(' ');
    const form = document.getElementById('add-form');
    form.ownerName.value = name;
    form.ownerTitle.value = title.join(' ');
    if (!form.dept.value) form.dept.value = el.dataset.dept;
    form.ownerName.focus();
  },
  // 주간 현황: 복사와 CSV 내려받기. 메일·메신저로 보내지는 않는다.
  'copy-report': async () => {
    const ok = await copyText(reportToText(buildReport(state, currentToday())));
    toast(ok ? '현황을 복사했어요. 아웃룩이나 메신저에 붙여넣으세요.' : '복사하지 못했어요. 화면 내용을 직접 선택해 복사해 주세요.');
  },
  'download-csv': () => {
    const report = buildReport(state, currentToday());
    const blob = new Blob([reportToCsv(report)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: csvFileName(report) });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(`${csvFileName(report)} 파일을 내려받았어요.`);
  },
  // 일정 탭
  'cal-month': (el) => { cal.month = shiftMonth(cal.month, Number(el.dataset.delta)); render(); },
  'cal-today': () => { const t = currentToday(); cal.month = monthOf(t); cal.selected = t; render(); },
  'cal-select': (el) => { cal.selected = el.dataset.date; cal.form.errors = {}; render(); },
  'cal-filter': (el) => { cal.filter = el.dataset.filter; render(); },
  'cal-progress': (el) => {
    state = setEventProgress(state, el.dataset.event, el.dataset.progress);
    save(state);
    render();
    toast(`일정을 ‘${progressLabel(el.dataset.progress)}’으로 표시했어요.`);
  },
  'cal-remove-event': (el) => {
    state = removeEvent(state, el.dataset.event);
    save(state);
    render();
    toast('일정을 삭제했어요.');
  },
  // 메일 패널의 날짜 칩 '+' (드래그 대신 탭으로 추가)
  'add-mail-date': (el) => {
    const chip = el.closest('[data-drag-date]');
    addMailDate({ title: chip.dataset.title, date: chip.dataset.date, itemId: chip.dataset.item || null });
  },
  'add-paste': () => {
    const today = currentToday();
    const parsed = markDuplicates(parsePaste(add.pasteText, today), state.items);
    if (!parsed.rows.length || parsed.errorCount) return;
    const me = defaultRequester(state);
    state = addItems(state, parsed.rows.map((r) => (me ? { ...r.value, item: { ...r.value.item, requester: me } } : r.value)));
    save(state);
    add = null;
    closeDrawer();
    toast(`${parsed.rows.length}건 추가했어요.`);
  },
  'copy-fix': () => {
    const today = currentToday();
    const item = withDays(state.items.find((x) => x.id === fix.itemId), today);
    const mail = signMail(buildFixMail({ item, person: state.people[item.owner], client: state.client, today, reason: fix.reason }), currentUser(state));
    const reason = fix.reason;
    return copyForDrawer(fix, { text: fixMailToText(mail) },
      (s, on, text, copy) => copyAndRecordFix(s, { itemId: item.id, reason, on, text }, copy));
  },
  // 외부조회서 작성
  'conf-type': (el) => { readConfSetup(); conf.type = el.dataset.type; conf.pasteText = ''; render(); },
  'conf-example': () => { readConfSetup(); conf.pasteText = CONF_TYPES[conf.type].example; render(); },
  'conf-clear': () => { readConfSetup(); conf.pasteText = ''; render(); },
  'conf-print': () => window.print(),
  // 초기화: 첫 클릭은 확인 대기, 4초 안에 한 번 더 누르면 입력값·종류·기억해 둔 회사/감사인 정보까지 지운다.
  // 이미 조회 목록에 등록한 조회서는 지우지 않는다.
  'conf-reset': () => {
    clearTimeout(confResetTimer);
    if (!conf.resetArmed) {
      readConfSetup();
      conf.resetArmed = true;
      render();
      confResetTimer = setTimeout(() => { if (conf) { conf.resetArmed = false; render(); } }, 4000);
      return;
    }
    const { confirmSetup, ...rest } = state;
    state = rest;
    save(state);
    conf = null;
    render();
    toast('외부조회서 작성 화면을 처음 상태로 되돌렸어요. 등록한 조회서는 그대로예요.');
  },
  'conf-register': () => {
    readConfSetup();
    const today = currentToday();
    const { value: setup } = validateSetup(conf.setup, today);
    const parsed = parseConfirmations(conf.type, conf.pasteText);
    if (!setup || !parsed.parties.length || parsed.errorCount) return;
    const letters = buildLetters(conf.type, parsed.parties, setup,
      { startNo: nextDocNo(state.items, conf.type), bankBlank: conf.bankBlank });
    // 요청 감사인 = 회신처 담당자(실무진 후보에서 고른 사람)
    const requester = requesterMembers(state).includes(setup.contactName) ? setup.contactName : defaultRequester(state);
    state = addItems(state, toRegistryValues(letters, setup).map((v) => (requester ? { ...v, item: { ...v.item, requester } } : v)));
    // 다음 작성 때 회사·감사인 정보를 다시 입력하지 않도록 기억한다 (날짜는 매번 새로)
    const { issuedOn, replyBy, ...keep } = setup;
    state = { ...state, confirmSetup: keep };
    save(state);
    const label = CONF_TYPES[conf.type].label;
    conf.pasteText = '';
    location.hash = '';
    render();
    toast(`${label} ${letters.length}건을 조회 목록에 등록했어요. 회신 기한 ${formatMD(setup.replyBy)} 기준으로 추적해요.`);
  },
  // 외부조회 후속 절차
  'start-follow': (el) => {
    const id = el.dataset.item;
    const type = el.dataset.type;
    const item = state.items.find((x) => x.id === id);
    if (item.status === 'follow' && item.follow?.type === type) return;
    const switching = item.status === 'follow';
    setItem(id, (x) => startFollow(x, type, currentToday()));
    location.hash = `#/follow/${encodeURIComponent(id)}`;
    render();
    toast(switching
      ? `‘${FOLLOW_TYPES[type].label}’로 바꿨어요. 앞에서 기록한 내용은 지웠어요.`
      : type === 'noreply' ? '미회수로 확정했어요. 조회서 종류에 맞는 절차를 정리했어요.' : '금액 차이 조정을 시작했어요. 회신금액부터 입력해 주세요.');
  },
  'follow-add-line': () => {
    setFollow((f) => ({ ...f, recon: { ...f.recon, lines: [...(f.recon.lines || []), { cause: '', amount: null, note: '' }] } }));
    render();
    app.querySelector('.fu-line:last-of-type select')?.focus();
  },
  'follow-remove-line': (el) => {
    const i = Number(el.dataset.index);
    setFollow((f) => ({ ...f, recon: { ...f.recon, lines: f.recon.lines.filter((_, j) => j !== i) } }));
    render();
  },
  // 후속 절차의 증빙 → 기존 자료 추가 창을 미리 채워서 연다 (사용자가 확인·수정 후 저장)
  'follow-request': (el) => {
    const item = state.items.find((x) => x.id === fu.itemId);
    const owner = fu.owner.trim();
    const [req] = evidenceRequests(item, { stepKeys: [el.dataset.key], owner, dept: state.people[owner]?.dept || '', today: currentToday() });
    if (!req) return;
    const v = req.value.item;
    const [ownerName = '', ...title] = owner.split(' ');
    add = {
      tab: 'single', errors: {}, pasteText: '',
      source: { itemId: item.id, key: req.key, counterparty: item.counterparty },
      form: {
        name: v.name, ownerName, ownerTitle: title.join(' '), dept: req.value.person.dept,
        requestedOn: v.requestedOn, neededOn: v.neededOn, procedure: v.procedure,
      },
    };
    location.hash = '#/add';
    render();
    app.querySelector('#add-form [name="name"]')?.focus();
  },
  'complete-follow': () => {
    const item = state.items.find((x) => x.id === fu.itemId);
    fu.signoffErrors = validateSignoff(fu.signoff);
    if (Object.keys(fu.signoffErrors).length) {
      render();
      app.querySelector('.fu-signoff .has-error input')?.focus();
      return;
    }
    let done;
    try { done = completeFollow(item, fu.signoff); } catch (err) { toast(err.message); return; }
    setItem(item.id, () => done);
    state = { ...state, lastSignoff: { preparer: fu.signoff.preparer.trim(), reviewer: fu.signoff.reviewer.trim() } };
    save(state);
    fu = null;
    closeDrawer();
    openAttach(item.id, true);
    toast(`${item.counterparty} 후속 절차를 완료했어요. ${done.follow.conclusion}`);
  },
  // 파일 첨부
  'attach-open': (el) => openAttach(el.dataset.item, false),
  'attach-close': () => { att = null; render(); },
  'attach-unpick': (el) => { att.pending.splice(Number(el.dataset.index), 1); att.rejected = []; render(); },
  'attach-save': async () => {
    if (!att.pending.length || att.saving) return;
    att.saving = true;
    render();
    const now = Date.now();
    const metas = [];
    try {
      for (const [i, f] of att.pending.entries()) {
        const id = newFileId(now, i);
        await putFile(id, f);
        metas.push({ id, name: f.name, size: f.size, type: f.type, addedOn: currentToday() });
      }
    } catch {
      att.saving = false;
      render();
      toast('파일을 저장하지 못했어요. 브라우저 저장 공간이나 개인정보 보호 설정을 확인해 주세요.');
      return;
    }
    setItem(att.itemId, (x) => addAttachments(x, metas));
    att = null;
    render();
    toast(`${metas.length}개 파일을 첨부했어요. 주간 보고 자료 목록에서 열 수 있어요.`);
  },
  // 첨부 파일: 먼저 미리보기 창을 띄우고, 저장 버튼을 눌러야 내려받는다
  'open-attachment': async (el) => {
    const item = state.items.find((x) => x.id === el.dataset.item);
    const meta = item?.attachments?.find((a) => a.id === el.dataset.file);
    let blob;
    try { blob = await getFile(el.dataset.file); } catch { blob = null; }
    // 예시 첨부 파일이 저장소에 없으면(예전에 불러온 예시 등) 다시 만든다
    const sample = SAMPLE_FILES.find((f) => f.id === el.dataset.file);
    // 예전 버전의 예시 첨부(텍스트)가 남아 있으면 새 문서 이미지로 바꾼다
    if (sample && blob && meta?.type && blob.type !== meta.type) blob = null;
    if (!blob && sample) {
      blob = await sampleFileBlob(sample, item);
      putFile(sample.id, blob).catch(() => {});
    }
    const name = meta?.name || 'attachment';
    if (!blob) {
      // 파일 내용이 이 브라우저에 없을 때도 창을 띄워 이유를 알려 준다
      preview = { itemId: item.id, fileId: el.dataset.file, name, size: meta?.size || 0, kind: 'missing', itemName: item.name };
      render();
      return;
    }
    const kind = previewKind(name, blob.type || meta?.type);
    preview = { itemId: item.id, fileId: el.dataset.file, name, size: blob.size, kind, itemName: item.name, blob };
    if (kind === 'image' || kind === 'pdf') preview.url = URL.createObjectURL(blob);
    if (kind === 'text') {
      const text = await blob.text();
      preview.text = text.slice(0, TEXT_PREVIEW_LIMIT);
      preview.truncated = text.length > TEXT_PREVIEW_LIMIT;
    }
    render();
  },
  'preview-close': closePreview,
  'preview-save': () => {
    if (!preview?.blob) return;
    const url = URL.createObjectURL(preview.blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: preview.name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(`‘${preview.name}’을(를) 저장했어요.`);
  },
  'remove-attachment': async (el) => {
    const { item: itemId, file } = el.dataset;
    const name = state.items.find((x) => x.id === itemId)?.attachments?.find((a) => a.id === file)?.name;
    try { await deleteFile(file); } catch { /* 저장소에 없어도 목록에서는 뺀다 */ }
    setItem(itemId, (x) => removeAttachment(x, file));
    render();
    toast(`‘${name}’ 첨부를 삭제했어요.`);
  },
  'copy-bundle': () => {
    const sorted = bundleItems(state.items, bundle.owner, currentToday());
    const mail = signMail(buildBundleMail({
      sorted, person: state.people[bundle.owner], client: state.client,
      manager: state.team?.manager, tone: bundle.tone,
    }), currentUser(state));
    return copyForDrawer(bundle, { itemIds: sorted.map((x) => x.id), text: bundleMailToText(mail) });
  },
};

function applyReceiptCheck() {
  const item = state.items.find((x) => x.id === sheet.itemId);
  const t = templateOf(item);
  const s = receiptSuggestion(t, sheet.check, item.basisDate || defaultBasisDate(state, currentToday()));
  if (s.status && canTransition(item, s.status)) {
    sheet.status = s.status;
    sheet.errors = {};
    if (s.status === 'fix') {
      sheet.reason = s.reason;
      if (s.requiredBasisDate) sheet.requiredBasisDate = s.requiredBasisDate;
    }
  }
  sheet.detail = s.status === 'fix' ? s.detail : null;
  render();
}

// 첫 화면 입력값을 상태에 옮겨 둔다 (다시 그려도 입력이 남도록)
function readEmptyForm() {
  const form = document.getElementById('engagement-form');
  if (!form) return;
  emptyForm.myName = form.myName?.value ?? emptyForm.myName;
  emptyForm.myTitle = form.myTitle?.value ?? emptyForm.myTitle;
}

// 시트의 기준일 입력값을 상태에 옮겨 둔다 (다시 그려도 입력이 남도록)
function readSheetDates() {
  const root = document.querySelector('.sheet');
  if (!root || !sheet) return;
  sheet.basisDate = root.querySelector('[name="basisDate"]')?.value ?? sheet.basisDate;
  sheet.requiredBasisDate = root.querySelector('[name="requiredBasisDate"]')?.value ?? sheet.requiredBasisDate;
}

// 메일 속 날짜를 캘린더 일정으로 추가 (드롭·탭 공통)
function addMailDate({ title, date, itemId }) {
  const result = addEvent(state, { title, date, itemId: itemId || null, by: currentUser(state) });
  if (!result.added) { toast('이미 캘린더에 있는 일정이에요.'); return; }
  state = result.state;
  save(state);
  render();
  toast(`‘${title}’ ${formatMD(date)} 일정을 캘린더에 추가했어요.`);
}

// 달력 항목을 다른 날로 (드래그·날짜 입력 공통). 필요일이면 자료의 필요일 자체가 바뀐다.
function moveCalendarEntry(entryId, date) {
  if (!date) return;
  const before = state;
  state = moveEntry(state, entryId, date);
  if (state === before) return;
  save(state);
  if (cal) cal.selected = date;
  render();
  const [kind, id] = entryId.split(':');
  if (kind === 'need') {
    const item = state.items.find((x) => x.id === id);
    toast(`‘${item.name}’ 필요일을 ${formatMD(date)}로 옮겼어요. 우선순위와 메일 문구에 반영돼요.`);
  } else {
    toast(`일정을 ${formatMD(date)}로 옮겼어요.`);
  }
}

// 드래그앤드롭: 달력 항목(data-drag-entry) 또는 메일 날짜 칩(data-drag-date)을 날짜 칸/일정 패널/독에 놓는다.
app.addEventListener('dragstart', (e) => {
  const el = e.target.closest?.('[data-drag-entry], [data-drag-date]');
  if (!el) return;
  const payload = el.dataset.dragEntry
    ? { type: 'entry', id: el.dataset.dragEntry }
    : { type: 'date', title: el.dataset.title, date: el.dataset.date, itemId: el.dataset.item || null };
  e.dataTransfer.setData('text/plain', JSON.stringify(payload));
  e.dataTransfer.effectAllowed = 'move';
  el.classList.add('is-dragging');
});
app.addEventListener('dragend', (e) => e.target.classList?.remove('is-dragging'));
app.addEventListener('dragover', (e) => {
  const zone = e.target.closest?.('[data-drop]');
  if (!zone) return;
  e.preventDefault();
  zone.classList.add('is-over');
});
app.addEventListener('dragleave', (e) => e.target.closest?.('[data-drop]')?.classList.remove('is-over'));
app.addEventListener('drop', (e) => {
  const zone = e.target.closest?.('[data-drop]');
  if (!zone) return;
  e.preventDefault();
  zone.classList.remove('is-over');
  let payload;
  try { payload = JSON.parse(e.dataTransfer.getData('text/plain')); } catch { return; }
  const target = zone.dataset.drop;
  if (payload.type === 'date') {
    addMailDate({ ...payload, date: target === 'dock' ? payload.date : target });
  } else if (payload.type === 'entry' && target !== 'dock') {
    moveCalendarEntry(payload.id, target);
  }
});

// 파일 첨부 창: 파일을 끌어다 놓기
app.addEventListener('dragover', (e) => {
  const zone = e.target.closest?.('.attach-drop');
  if (!zone || !e.dataTransfer?.types?.includes('Files')) return;
  e.preventDefault();
  zone.classList.add('is-over');
});
app.addEventListener('dragleave', (e) => e.target.closest?.('.attach-drop')?.classList.remove('is-over'));
app.addEventListener('drop', (e) => {
  const zone = e.target.closest?.('.attach-drop');
  if (!zone || !e.dataTransfer?.files?.length) return;
  e.preventDefault();
  pickFiles(e.dataTransfer.files);
});

// 일정 패널의 날짜 입력으로 이동 (모바일·키보드)
app.addEventListener('change', (e) => {
  if (e.target.dataset.actionChange === 'cal-move') moveCalendarEntry(e.target.dataset.entry, e.target.value);
  if (e.target.dataset.actionChange === 'set-performance') {
    const value = numOf(e.target.value);
    state = { ...state, materiality: { ...(state.materiality || {}), performance: value && value > 0 ? value : null } };
    save(state);
    render();
    toast(value > 0 ? `수행중요성을 ${value.toLocaleString('ko-KR')}원으로 정했어요.` : '수행중요성을 지웠어요.');
    return;
  }
  if (e.target.dataset.actionChange === 'switch-user') {
    state = switchUser(state, e.target.value);
    save(state);
    if (isManager(state)) who = 'all';
    else if (who === e.target.value) who = 'me';
    // 담당자·요청 감사인 기본값도 바뀐 사람으로 맞춘다
    if (conf) conf.setup.contactName = pickRequester(state, '');
    if (add?.form) add.form.requester = pickRequester(state, '');
    render();
    const who2 = `${currentUser(state)}${josa(currentUser(state), '으로', '로')}`;
    toast(isManager(state)
      ? `${who2} 바꿨어요. 매니저 화면은 팀 전체 자료로 시작하고, 실무진별로 거를 수 있어요.`
      : `지금 쓰는 사람을 ${who2} 바꿨어요. 새 요청과 메일 서명에 이 이름이 들어가요.`);
    return;
  }
  if (e.target.dataset.actionChange === 'attach-pick') {
    pickFiles(e.target.files);
    return;
  }
  const fuAction = e.target.dataset.actionChange;
  if (fu && fuAction?.startsWith('follow-')) {
    const t = e.target;
    if (fuAction === 'follow-step') {
      setFollow((f) => ({ ...f, steps: { ...f.steps, [t.dataset.step]: t.checked } }));
    } else if (fuAction === 'follow-verified') {
      setFollow((f, x) => ({ ...f, verified: clampVerified(x, t.value) }));
    } else if (fuAction === 'follow-amount') {
      setFollow((f) => ({ ...f, recon: { ...f.recon, [t.dataset.field]: numOf(t.value) } }));
    } else if (fuAction === 'follow-line') {
      const i = Number(t.dataset.index);
      const v = t.dataset.field === 'amount' ? numOf(t.value) : t.value;
      setFollow((f) => ({ ...f, recon: { ...f.recon, lines: f.recon.lines.map((l, j) => (j === i ? { ...l, [t.dataset.field]: v } : l)) } }));
    }
    const scroll = app.querySelector('.drawer-body')?.scrollTop;
    render();
    const body = app.querySelector('.drawer-body');
    if (body && scroll) body.scrollTop = scroll;
    return;
  }
  if (e.target.dataset.actionChange === 'conf-bank-blank') {
    readConfSetup();
    conf.bankBlank = e.target.checked;
    refreshConfOutput();
  }
  // 공통 정보 칸을 벗어나면 그 칸의 오류를 보여준다
  if (e.target.form?.id === 'conf-setup' && e.target.name) {
    // 다시 그리면 Tab으로 넘어간 다음 칸의 포커스가 사라지므로, 오류 표시만 바꾼다.
    readConfSetup();
    conf.touched.add(e.target.name);
    const errors = confSetupErrors(currentToday());
    for (const label of app.querySelectorAll('#conf-setup .f')) {
      const name = label.querySelector('input, select')?.name;
      if (!conf.touched.has(name)) continue;
      label.classList.toggle('has-error', Boolean(errors[name]));
      label.querySelector('.f-error')?.remove();
      if (errors[name]) label.insertAdjacentHTML('beforeend', `<span class="f-error">${errors[name]}</span>`);
    }
  }
});

function readAddForm() {
  const form = document.getElementById('add-form');
  if (!form) return add?.form || {};
  return Object.fromEntries(['name', 'ownerName', 'ownerTitle', 'dept', 'requestedOn', 'neededOn', 'procedure', 'basisDate', 'template', 'requester']
    .map((k) => [k, form[k]?.value ?? '']));
}

// 일정 추가 (일정 탭 오른쪽 패널)
app.addEventListener('submit', (e) => {
  if (e.target.dataset.actionSubmit !== 'cal-add-event') return;
  e.preventDefault();
  const title = e.target.title.value.trim();
  if (!title) {
    cal.form = { title: '', errors: { title: '일정 이름을 입력해 주세요.' } };
    render();
    app.querySelector('.cal-add input')?.focus();
    return;
  }
  const result = addEvent(state, { title, date: cal.selected, by: currentUser(state) });
  if (result.added) { state = result.state; save(state); }
  cal.form = { title: '', errors: {} };
  render();
  toast(result.added ? `‘${title}’ 일정을 ${formatMD(cal.selected)}에 추가했어요.` : '같은 일정이 이미 있어요.');
});

// 한 건 저장: 검증에 걸리면 입력값을 유지한 채 오류를 보여준다.
app.addEventListener('submit', (e) => {
  if (e.target.dataset.actionSubmit !== 'add-single') return;
  e.preventDefault();
  const today = currentToday();
  add.form = readAddForm();
  const { errors, value } = validateItem(add.form, today);
  const dup = value && duplicateMessage(state.items, value.item.name);
  if (dup) errors.name = dup;
  add.errors = errors;
  if (!value || dup) {
    render();
    app.querySelector('.f.has-error input')?.focus();
    return;
  }
  const source = add.source;
  if (source) value.item.sourceId = source.itemId; // 어느 외부조회 건의 증빙인지
  const requester = add.form.requester || defaultRequester(state);
  if (requester) value.item.requester = requester;
  const tpl = PBC_TEMPLATES[add.form.template] || templateForName(value.item.name);
  if (tpl) {
    value.item.template = tpl.key;
    value.item.basisDate = normalizeDate(add.form.basisDate, today) || defaultBasisDate(state, today);
  }
  state = addItems(state, [value]);
  if (source) {
    setItem(source.itemId, (x) => ({ ...x, follow: { ...x.follow, requested: [...(x.follow?.requested || []), source.key] } }));
  }
  save(state);
  add = null;
  if (source) {
    location.hash = `#/follow/${encodeURIComponent(source.itemId)}`;
    render();
  } else {
    closeDrawer();
  }
  toast(`‘${value.item.name}’${josa(value.item.name, '을', '를')} 추가했어요.`);
});

// 붙여넣기: 입력할 때마다 미리보기와 저장 버튼만 갱신한다 (textarea 포커스 유지).
app.addEventListener('input', (e) => {
  // 클라이언트 조회 창: 입력할 때마다 목록을 거른다
  if (e.target.dataset.actionInput === 'eng-query') {
    emptyForm.query = e.target.value;
    emptyForm.results = emptyForm.query.trim() ? searchEngagements(emptyForm.query) : null;
    app.querySelector('.eng-list').innerHTML = lookupResults(emptyForm.results, emptyForm.query);
    return;
  }
  if (e.target.dataset.actionInput === 'report-search') {
    reportQuery = e.target.value;
    app.querySelector('.item-table').innerHTML = itemTableBody(buildReport(state, currentToday()).rows, reportQuery);
    return;
  }
  if (e.target.dataset.actionInput === 'follow-signoff') {
    fu.signoff[e.target.dataset.field] = e.target.value;
    return;
  }
  if (e.target.dataset.actionInput === 'follow-owner') {
    fu.owner = e.target.value;
    return;
  }
  if (e.target.dataset.actionInput === 'conf-paste') {
    conf.pasteText = e.target.value;
    refreshConfOutput();
    return;
  }
  if (e.target.form?.id === 'conf-setup') {
    readConfSetup();
    refreshConfOutput();
    return;
  }
  if (e.target.dataset.actionInput === 'paste') {
    add.pasteText = e.target.value;
    const parsed = markDuplicates(parsePaste(add.pasteText, currentToday()), state.items);
    app.querySelector('.paste-preview').innerHTML = pastePreview(parsed, currentToday());
    app.querySelector('.modal-foot .btn-cta').outerHTML = pasteSubmit(parsed);
  } else if (e.target.name === 'neededOn' && e.target.form?.id === 'add-form') {
    add.form = readAddForm();
    add.errors = {};
    render();
    app.querySelector('[name="neededOn"]')?.focus();
  }
});

app.addEventListener('click', (e) => {
  // 담당자 상세의 '독촉하기' 등: 패널을 닫으면 이 화면으로 돌아오도록 기억한다
  const ret = e.target.closest('[data-return]');
  if (ret) drawerReturn = ret.dataset.return;
  else if (e.target.closest('a[href^="#"]')) drawerReturn = null;
  const el = e.target.closest('[data-action]');
  if (!el) return;
  e.preventDefault();
  actions[el.dataset.action]?.(el);
});

window.addEventListener('hashchange', render);
window.addEventListener('popstate', render);
document.addEventListener('keydown', (e) => {
  // 첫 화면 클라이언트명에서 Enter → 조회
  if (e.key === 'Enter' && e.target.dataset?.enter === 'eng-search') {
    e.preventDefault();
    actions['eng-search']();
    return;
  }
  if (e.key !== 'Escape') return;
  if (!state && emptyForm.lookupOpen) { actions['eng-close'](); return; }
  if (preview) { closePreview(); return; }
  if (att) { att = null; render(); return; }
  if (sheet) { sheet = null; render(); return; }
  if (compose || bundle || fix || add || fu) actions['close-drawer']();
});

// 개발용: 콘솔에서 pbc.reset() 하면 첫 실행 화면으로 돌아간다.
window.pbc = { reset() { clear(); clearFiles().catch(() => {}); state = null; compose = bundle = fix = add = sheet = cal = conf = fu = att = null; render(); } };

render();
