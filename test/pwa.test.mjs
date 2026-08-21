/* PWA — 매니페스트 · 서비스 워커 · 아이콘

   여기서 잡으려는 사고는 하나입니다.

     프리캐시 목록에 없는 파일이 있으면 cache.addAll이 통째로 실패하고,
     서비스 워커 설치가 실패하고, 오프라인이 아예 동작하지 않습니다.
     그런데 브라우저 콘솔을 열어보기 전까지는 아무 증상이 없습니다.
     앱은 평소처럼 잘 돌아가니까요.

   반대 방향도 봅니다 — 앱이 쓰는데 프리캐시에 빠진 파일이 있으면
   오프라인에서 그것만 못 받아 화면이 깨집니다. */

import fs from 'fs';

let fail = 0, n = 0;
const ok = (c, m) => { n++; console.log((c ? '  OK   ' : '  ★NG  ') + m); if (!c) fail++; };
const eq = (a, b, m) => ok(a === b, `${m}  →  ${JSON.stringify(a)}${a === b ? '' : ' (기대 ' + JSON.stringify(b) + ')'}`);

const sw = fs.readFileSync('sw.js', 'utf-8');
const html = fs.readFileSync('index.html', 'utf-8');
const mf = JSON.parse(fs.readFileSync('manifest.webmanifest', 'utf-8'));

/* ── 1. 프리캐시 목록 ↔ 실제 파일 ────────────────── */
console.log('\n════ 프리캐시 목록이 실제 파일과 맞는가 ════');
const PRECACHE = (() => {
  const m = sw.match(/const PRECACHE = \[([\s\S]*?)\];/);
  return m ? [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]) : [];
})();

ok(PRECACHE.length > 10, `프리캐시 항목 ${PRECACHE.length}개`);
{
  // './' 는 index.html을 가리키는 디렉터리 요청이라 파일로 존재하지 않습니다
  const missing = PRECACHE.filter(p => p !== './' && !fs.existsSync(p));
  ok(missing.length === 0,
     '목록의 모든 파일이 실제로 존재' + (missing.length ? ` → 없음: ${missing.join(', ')}` : ''));
}

console.log('\n════ 앱이 쓰는 파일이 목록에 다 있는가 ════');
{
  // index.html이 불러오는 스크립트와 스타일
  const refs = [...html.matchAll(/(?:src|href)="((?!http)[^"]+)"/g)].map(m => m[1]);
  const needed = refs.filter(r => /\.(js|css)$/.test(r));
  const gap = needed.filter(r => !PRECACHE.includes(r));
  ok(gap.length === 0, `index.html이 부르는 js/css ${needed.length}개가 전부 캐시됨`
     + (gap.length ? ` → 빠짐: ${gap.join(', ')}` : ''));
}
{
  // app.js가 fetch하는 데이터 파일
  const app = fs.readFileSync('assets/app.js', 'utf-8');
  const paths = [...app.matchAll(/get\(`?'?(data\/[\w./-]+|data\/i18n\/\$\{lang\}\.json)'?`?\)/g)]
    .map(m => m[1]);
  const expanded = paths.flatMap(p =>
    p.includes('${lang}') ? ['data/i18n/ko.json', 'data/i18n/en.json'] : [p]);
  const gap = [...new Set(expanded)].filter(p => !PRECACHE.includes(p));
  ok(gap.length === 0, `app.js가 받는 데이터 ${new Set(expanded).size}개가 전부 캐시됨`
     + (gap.length ? ` → 빠짐: ${gap.join(', ')}` : ''));
}
{
  const dataFiles = [];
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).forEach(e => {
    const p = `${d}/${e.name}`;
    e.isDirectory() ? walk(p) : (e.name.endsWith('.json') && dataFiles.push(p));
  });
  walk('data');
  const gap = dataFiles.filter(p => !PRECACHE.includes(p));
  ok(gap.length === 0, `data/ 아래 json ${dataFiles.length}개가 전부 캐시됨`
     + (gap.length ? ` → 빠짐: ${gap.join(', ')}` : ''));
}

/* ── 2. 서비스 워커 안전장치 ─────────────────────── */
console.log('\n════ 서비스 워커 ════');
{
  ok(/const VERSION\s*=\s*'v\d+'/.test(sw), '캐시 버전이 정의됨');
  ok(/caches\.delete/.test(sw), '옛 캐시를 정리함 (안 하면 저장 공간이 계속 늘어남)');
  ok(/req\.method !== 'GET'/.test(sw), 'GET이 아닌 요청은 건드리지 않음');

  /* 자동 skipWaiting은 있으면 안 됩니다.
     추출 3분 중에 앱이 갈아끼워지면 타이머가 날아갑니다. */
  const autoSkip = /addEventListener\('install'[\s\S]{0,400}?self\.skipWaiting\(\)/.test(sw);
  ok(!autoSkip, '★ install에서 자동으로 skipWaiting 하지 않음 (추출 중 교체 방지)');
  ok(/'SKIP_WAITING'/.test(sw), '앱이 지시할 때만 교체');

  ok(/type === 'opaque'/.test(sw), 'opaque 응답을 구분해서 다룸');
  ok(/mode === 'navigate'/.test(sw), '화면 이동 요청을 따로 처리 (해시 라우팅 대응)');
}

/* ── 3. 매니페스트 ───────────────────────────────── */
console.log('\n════ 매니페스트 ════');
{
  ok(!!mf.name && !!mf.short_name, `이름: ${mf.name} / ${mf.short_name}`);
  ok(mf.short_name.length <= 12, `short_name이 홈 화면에서 안 잘림 (${mf.short_name.length}자)`);
  eq(mf.display, 'standalone', 'standalone — 주소창 없이 앱처럼');

  /* 하위 경로 배포라 상대 경로여야 합니다.
     '/'로 시작하면 도메인 루트를 가리켜 GitHub Pages에서 깨집니다. */
  ok(mf.start_url.startsWith('./'), `start_url이 상대 경로 (${mf.start_url})`);
  ok(mf.scope.startsWith('./'), `scope가 상대 경로 (${mf.scope})`);

  const bad = mf.icons.filter(i => !fs.existsSync(i.src));
  ok(bad.length === 0, `아이콘 ${mf.icons.length}개가 실제로 존재`
     + (bad.length ? ` → 없음: ${bad.map(b => b.src).join(', ')}` : ''));

  ok(mf.icons.some(i => i.sizes === '192x192'), '192px 있음 (안드로이드 홈 화면)');
  ok(mf.icons.some(i => i.sizes === '512x512'), '512px 있음 (스플래시)');
  ok(mf.icons.some(i => i.purpose === 'maskable'), 'maskable 있음 (안드로이드가 잘라내도 안전)');

  const badShortcut = (mf.shortcuts || []).filter(s => !s.url.startsWith('./'));
  ok(badShortcut.length === 0, `바로가기 ${(mf.shortcuts || []).length}개가 상대 경로`);
}

/* ── 4. index.html 연결 ──────────────────────────── */
console.log('\n════ index.html ════');
{
  ok(/rel="manifest"/.test(html), '매니페스트 링크');
  ok(/rel="apple-touch-icon"/.test(html), 'iOS 홈 화면 아이콘');
  ok(/apple-mobile-web-app-capable/.test(html), 'iOS standalone 모드');
  ok(/og:image/.test(html), 'OG 이미지 (링크 미리보기)');
  ok(/id="updateBar"/.test(html), '업데이트 알림 자리');

  const ogm = html.match(/og:image" content="([^"]+)"/);
  ok(ogm && ogm[1].startsWith('https://'),
     `OG 이미지가 절대 URL — 상대 경로면 미리보기가 안 뜸`);
  const ogFile = ogm ? ogm[1].split('/').slice(-2).join('/') : '';
  ok(fs.existsSync(ogFile), `OG 이미지 파일 존재 (${ogFile})`);
}

/* ── 5. 아이콘 실물 ──────────────────────────────── */
console.log('\n════ 아이콘 실물 ════');
{
  const png = (p) => {
    const b = fs.readFileSync(p);
    // PNG 시그니처 + IHDR에서 가로·세로
    const sig = b.subarray(0, 8).toString('hex') === '89504e470d0a1a0a';
    return { sig, w: b.readUInt32BE(16), h: b.readUInt32BE(20), size: b.length };
  };
  const want = { 'assets/icon-192.png': 192, 'assets/icon-512.png': 512,
                 'assets/icon-maskable-512.png': 512, 'assets/apple-touch-icon.png': 180,
                 'assets/og-image.png': 512 };
  for (const [p, s] of Object.entries(want)) {
    if (!fs.existsSync(p)) { ok(false, `${p} 없음`); continue; }
    const i = png(p);
    ok(i.sig && i.w === s && i.h === s, `${p.replace('assets/', '')} ${i.w}×${i.h} (${(i.size / 1024).toFixed(1)}KB)`);
  }
}

/* ── 6. 서비스 워커를 방해하는 설정이 남아있지 않은가 ── */
console.log('\n════ 캐시를 무력화하는 설정 ════');
{
  /* 주석을 지우고 봅니다 — 왜 뺐는지 설명하는 주석에도 'no-cache'라는
     글자가 들어 있어서, 그냥 검색하면 주석에 걸립니다. */
  const app = fs.readFileSync('assets/app.js', 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
  ok(!/cache:\s*'no-(cache|store)'/.test(app),
     "fetch에 no-cache가 남아있지 않음 (있으면 서비스 워커 캐시를 매번 우회)");
}

console.log(`\n${fail ? '★ 실패 ' + fail + '건 / ' + n : '전체 통과 ' + n + '건'}`);
process.exit(fail ? 1 : 0);
