/**
 * 단어 끝 글자의 받침 유무로 조사를 고른다.
 * josa('은행조회서 회신', '이', '가') → '이'
 * 한글로 끝나지 않으면 판단할 수 없어 '이(가)' 형태로 둘 다 쓴다.
 * 끝에 붙은 괄호(조회처명 등)는 빼고 판단한다.
 */
export function josa(word, withBatchim, withoutBatchim) {
  // '채권채무조회서 (세진물산㈜)'처럼 괄호로 끝나면 괄호 앞 단어로 읽는다 → '조회서' + '가'
  const base = String(word).replace(/\s*\([^()]*\)$/, '') || String(word);
  const code = base.charCodeAt(base.length - 1) - 0xac00;
  if (code < 0 || code > 11171) return `${withBatchim}(${withoutBatchim})`;
  return code % 28 === 0 ? withoutBatchim : withBatchim;
}
