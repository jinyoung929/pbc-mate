// 8. 빈 상태 · 첫 실행 — 레퍼런스 8
// 예시 자료로 시작하거나, 부서·클라이언트명·프로젝트명을 넣고 직접 시작한다.

import { esc } from './html.js';
import { SERVICES } from '../lib/terms.js';

/**
 * @param form { clientName, engagement, service, errors }
 */
export function renderEmpty({ clientName = '', engagement = '', service = 'audit', errors = {} } = {}) {
  const services = SERVICES.map((s) => `
    <label class="service-opt"><input type="radio" name="service" value="${s.key}" ${s.key === service ? 'checked' : ''}><span>${s.label}</span></label>`).join('');
  return `
    <div class="page empty">
      <header class="topbar">
        <div class="brand">PBC Mate<span class="brand-mark" aria-hidden="true"></span></div>
        <span class="chip">클라이언트 이름을 정해주세요</span>
      </header>

      <main class="empty-main">
        <div class="empty-art" aria-hidden="true">
          <span class="ea-box" style="left:15%"></span>
          <span class="ea-box" style="left:57%"></span>
          <span class="ea-seg risk-high" style="left:0;width:16%"></span>
          <span class="ea-seg risk-mid" style="left:16%;width:34%"></span>
          <span class="ea-seg risk-low" style="left:50%;right:0"></span>
          <span class="tl-now"></span>
          <span class="ea-today">오늘</span>
        </div>
        <h1>요청한 자료를 필요일 기준으로 챙겨드려요</h1>
        <p>자료마다 필요일을 넣으면 남은 날로 급한 순서를 정하고, 재촉 메일 초안까지 만들어요.</p>

        <form class="empty-form" id="engagement-form" novalidate>
          <div class="f service-field">
            <span class="f-label">업무 구분 <small>메일 문구와 용어가 바뀌어요</small></span>
            <div class="service-opts" role="radiogroup" aria-label="업무 구분">${services}</div>
          </div>
          <label class="f ${errors.clientName ? 'has-error' : ''}">
            <span class="f-label">클라이언트명</span>
            <input type="text" name="clientName" value="${esc(clientName)}" placeholder="예: ㈜한빛전자" autocomplete="organization">
            ${errors.clientName ? `<span class="f-error">${esc(errors.clientName)}</span>` : ''}
          </label>
          <label class="f ${errors.engagement ? 'has-error' : ''}">
            <span class="f-label">프로젝트명</span>
            <input type="text" name="engagement" value="${esc(engagement)}" placeholder="예: 2026 기말감사 · 법인세 신고 · 재무실사" autocomplete="off">
            ${errors.engagement ? `<span class="f-error">${esc(errors.engagement)}</span>` : ''}
          </label>
        </form>

        <div class="empty-actions">
          <button type="button" class="btn btn-cta" data-action="load-sample">예시 자료로 시작</button>
          <button type="button" class="btn btn-sub" data-action="start-blank" data-target="add">직접 추가</button>
        </div>
        <button type="button" class="link" data-action="start-blank" data-target="paste">엑셀에서 요청 목록 붙여넣기</button>
      </main>

      <section class="steps">
        ${step(1, '자료와 필요일 넣기', '자료를 쓰기 시작하는 날이 필요일이 돼요.')}
        ${step(2, '남은 날로 위험도 확인', '2일 이내 · 3~7일 · 8일 이상으로 나눠 보여드려요.')}
        ${step(3, '초안 복사해 아웃룩에', '담당자별로 묶고, 톤을 고른 뒤 복사만 하면 돼요.')}
      </section>
    </div>`;
}

function step(n, title, desc) {
  return `
    <div class="step">
      <div class="step-num">${n}</div>
      <div><div class="step-title">${title}</div><div class="step-desc">${desc}</div></div>
    </div>`;
}
