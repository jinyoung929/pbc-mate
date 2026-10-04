#!/usr/bin/env python3
"""src/의 ES 모듈과 CSS를 외부 의존 없이 실행되는 단일 HTML(Claude Artifact용)로 묶는다.

사용: python3 tools/build-artifact.py  →  dist/pbc-mate-artifact.html
- 각 모듈을 IIFE로 감싸고 export 이름을 객체로 돌려준다. import는 그 객체에서 꺼내 쓴다.
- Artifact는 publish 때 <!doctype>·<head>·<body>를 씌우므로 본문 조각만 쓴다 (title·style·#app·script).
- --standalone 을 주면 로컬 확인용으로 doctype·head·body까지 갖춘 dist/pbc-mate-standalone.html 도 만든다.
- --pages 를 주면 같은 내용을 docs/index.html 로 써서 GitHub Pages(main 브랜치 /docs)로 공개한다.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
JS = ROOT / 'src' / 'js'
OUT = ROOT / 'dist' / 'pbc-mate-artifact.html'
OUT_STANDALONE = ROOT / 'dist' / 'pbc-mate-standalone.html'
OUT_PAGES = ROOT / 'docs' / 'index.html'

IMPORT_RE = re.compile(r"import\s*\{([^}]*)\}\s*from\s*'([^']+)';\n?", re.S)
EXPORT_DECL_RE = re.compile(r"^export (?:(?:async )?function|const|let|class) (\w+)", re.M)
EXPORT_LIST_RE = re.compile(r"^export \{([^}]*)\};\n?", re.M)


def mod_id(rel):  # 'lib/dates.js' → '__m_lib_dates'
    return '__m_' + re.sub(r'[^A-Za-z0-9]', '_', rel[:-3])


def resolve(from_rel, spec):
    base = (JS / from_rel).parent
    return str((base / spec).resolve().relative_to(JS))


def main():
    sources = {str(p.relative_to(JS)): p.read_text(encoding='utf-8') for p in JS.rglob('*.js')}
    deps = {rel: [resolve(rel, m.group(2)) for m in IMPORT_RE.finditer(src)] for rel, src in sources.items()}

    order, seen = [], set()

    def visit(rel, stack=()):
        if rel in seen:
            return
        if rel in stack:
            sys.exit(f'circular import: {" -> ".join(stack + (rel,))}')
        for d in deps[rel]:
            visit(d, stack + (rel,))
        seen.add(rel)
        order.append(rel)

    for rel in sorted(sources):
        visit(rel)

    def transform(rel, src):
        imports = []
        for m in IMPORT_RE.finditer(src):
            names = ', '.join(n.strip() for n in m.group(1).split(',') if n.strip())
            imports.append(f'const {{ {names} }} = {mod_id(resolve(rel, m.group(2)))};')
        body = IMPORT_RE.sub('', src)
        exported = EXPORT_DECL_RE.findall(body)
        for m in EXPORT_LIST_RE.finditer(body):
            exported += [n.strip() for n in m.group(1).split(',') if n.strip()]
        body = EXPORT_LIST_RE.sub('', body)
        body = re.sub(r'^export ', '', body, flags=re.M)
        head = '\n'.join(imports)
        if rel == 'main.js':
            return f'// ---- {rel}\n(() => {{\n{head}\n{body}\n}})();\n'
        return f'// ---- {rel}\nconst {mod_id(rel)} = (() => {{\n{head}\n{body}\nreturn {{ {", ".join(exported)} }};\n}})();\n'

    bundle = '\n'.join(transform(rel, sources[rel]) for rel in order)
    # 화면 코드가 가리키는 src/assets 이미지는 단일 파일에 data URI로 넣는다 (Artifact는 외부 이미지를 막는다)
    import base64, mimetypes
    def inline_asset(m):
        path = ROOT / 'src' / m.group(1)
        mime = mimetypes.guess_type(path.name)[0] or 'application/octet-stream'
        return f'src="data:{mime};base64,{base64.b64encode(path.read_bytes()).decode()}"'
    bundle = re.sub(r'src="(assets/[^"]+)"', inline_asset, bundle)
    if '</script' in bundle:
        sys.exit('bundle contains </script>')
    css = (ROOT / 'src' / 'styles.css').read_text(encoding='utf-8')

    fragment = f"""<title>PBC Mate</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700;800&display=swap">
<style>
/* Artifact 단일 파일 빌드 — 원본은 src/styles.css. 호스트 테마와 무관하게 밝은 문서형 화면으로 고정한다. */
:root {{ color-scheme: light; }}
html, body {{ font-family: 'Pretendard Variable', Pretendard, 'Noto Sans KR', -apple-system, 'Apple SD Gothic Neo', sans-serif; }}
{css}
</style>
<div id="app"></div>
<div id="toast" class="toast" role="status" hidden></div>
<script>
{bundle}
</script>
"""
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(fragment, encoding='utf-8')
    print(f'wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024} KB) from {len(order)} modules')

    # 로컬·GitHub Pages에는 CDN 제한이 없으므로 src/index.html과 같은 Pretendard를 써서 글씨 굵기를 맞춘다.
    # (Artifact 조각은 허용된 폰트 호스트가 Google Fonts뿐이라 Noto Sans KR로 대신한다.)
    pretendard = ('<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/'
                  'dist/web/variable/pretendardvariable-dynamic-subset.min.css">')
    standalone = (
        '<!doctype html>\n<html lang="ko">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
        f'{pretendard}\n{fragment}\n</head>\n<body></body>\n</html>\n')
    if '--standalone' in sys.argv:
        OUT_STANDALONE.write_text(standalone, encoding='utf-8')
        print(f'wrote {OUT_STANDALONE.relative_to(ROOT)} (로컬 확인용)')
    if '--pages' in sys.argv:
        OUT_PAGES.parent.mkdir(exist_ok=True)
        OUT_PAGES.write_text(standalone, encoding='utf-8')
        print(f'wrote {OUT_PAGES.relative_to(ROOT)} (GitHub Pages)')


if __name__ == '__main__':
    main()
