// 템플릿 문자열로 화면을 그릴 때 쓰는 도구

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** 사용자 입력이 들어가는 값은 반드시 esc()를 거친다. */
export function esc(value) {
  return String(value).replace(/[&<>"']/g, (c) => ESC[c]);
}

const svg = (body, sw = 2.4) =>
  `<svg width="1em" height="1em" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

// 위험도·상태 아이콘 (레퍼런스와 같은 모양)
export const ICON = {
  high: svg('<path d="M8 2.5l6 10.5H2z"/>'),
  mid: svg('<circle cx="8" cy="8" r="6.2"/><path d="M8 4.8V8l2.2 1.5"/>'),
  low: svg('<rect x="2.5" y="3.5" width="11" height="10" rx="2"/>'),
  late: svg('<circle cx="8" cy="8" r="6.2"/>'),
  none: svg('<circle cx="8" cy="8" r="6" stroke-dasharray="3 2.2"/>', 2),
  part: svg('<circle cx="8" cy="8" r="6"/><path d="M8 2a6 6 0 0 1 0 12z" fill="currentColor"/>', 1.8),
  fix: svg('<path d="M3 8a5 5 0 1 0 1.5-3.6"/><path d="M3 2.5V5h2.5"/>', 2),
  done: svg('<path d="M3.5 8.5l3 3 6-7"/>', 2.2),
  help: svg('<circle cx="8" cy="8" r="6.2"/><path d="M6.4 6.3a1.7 1.7 0 0 1 3.2.7c0 1.1-1.6 1.4-1.6 2.4M8 11.3v.01"/>', 1.8),
  plus: svg('<path d="M8 3v10M3 8h10"/>', 2),
  chevron: svg('<path d="M6 3.5L10.5 8 6 12.5"/>', 2),
  back: svg('<path d="M10 3.5L5.5 8l4.5 4.5"/>', 2),
  close: svg('<path d="M4 4l8 8M12 4l-8 8"/>', 2),
  mail: svg('<rect x="2" y="3.5" width="12" height="9" rx="1.5"/><path d="M2.5 4.5L8 9l5.5-4.5"/>', 1.6),
  clock: svg('<circle cx="8" cy="8" r="6.2"/><path d="M8 4.8V8l2.2 1.5"/>', 1.8),
  moon: svg('<path d="M13 9.5A5.5 5.5 0 0 1 6.5 3a5.5 5.5 0 1 0 6.5 6.5z"/>', 1.8),
  arrow: svg('<path d="M3 8h10M9.5 4.5L13 8l-3.5 3.5"/>', 1.8),
  download: svg('<path d="M8 2.5v8M4.5 7L8 10.5 11.5 7M3 13h10"/>', 1.8),
  follow: svg('<path d="M2.5 8h5M7.5 8l3.5-3.5M7.5 8l3.5 3.5M11 4.5h2.5M11 11.5h2.5"/>', 1.8),
  copy: svg('<rect x="5" y="5" width="9" height="9" rx="2"/><path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2h-6A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5"/>', 1.8),
};

export const RISK_LABEL = { late: '지연', high: '2일 이내', mid: '3~7일', low: '8일 이상' };
export const RISK_SHORT = { late: '지연', high: '2일 내', mid: '7일 내', low: '여유' };
export const STATUS_LABEL = { none: '미회신', part: '일부 수령', fix: '보완 요청', follow: '후속 절차', done: '완료' };
