/* 실기기에서 발견된 버그의 회귀 테스트.
   증상: 버튼을 눌러도 반응이 없거나 늦음.
   원인: render()마다 bind()를 다시 호출해 #root의 리스너가 누적됨. */
import fs from 'fs';

let fail=0,n=0;
const ok=(c,m)=>{n++;console.log((c?'  OK   ':'  ★NG  ')+m);if(!c)fail++};

/* ── 리스너를 실제로 세는 DOM 스텁 ── */
function makeRoot() {
  const listeners = {};
  return {
    innerHTML: '',
    dataset: {},
    _listeners: listeners,
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    removeEventListener(type, fn) {
      if (listeners[type]) listeners[type] = listeners[type].filter(f => f !== fn);
    },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    count(type) { return (listeners[type] || []).length }
  };
}

const root = makeRoot();
const mem = {};
globalThis.document = {
  documentElement: { lang:'', setAttribute(){}, removeAttribute(){} },
  getElementById: (id) => id === 'root' ? root : null,
  querySelector: () => null, querySelectorAll: () => [],
  addEventListener: () => {}, createElement: () => ({ click(){}, remove(){}, style:{} }),
  body: { appendChild(){} }, activeElement: null
};
globalThis.localStorage = { getItem:k=>mem[k]??null, setItem:(k,v)=>{mem[k]=v}, removeItem:k=>{delete mem[k]} };
Object.defineProperty(globalThis,'navigator',{value:{language:'ko-KR'},configurable:true});
globalThis.location = { protocol:'http:', pathname:'/', search:'', hash:'', reload(){},
  replace(u){ const i=String(u).indexOf('#'); this.hash = i<0?'':String(u).slice(i); } };
globalThis.confirm = () => true;
/* window 리스너도 세어야 합니다 — hashchange가 누적되면 뒤로가기 한 번에
   핸들러가 여러 번 돌아 화면을 여러 칸 건너뜁니다. click과 같은 종류의 버그입니다. */
const winL = {};
globalThis.window = {
  _listeners: winL,
  addEventListener(type, fn) { (winL[type] ||= []).push(fn); },
  count(type) { return (winL[type] || []).length }
};
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};
globalThis.Blob = class {}; globalThis.URL = { createObjectURL:()=>'', revokeObjectURL(){} };
globalThis.FileReader = class { readAsText(){} };
globalThis.fetch = async p => ({ ok:true, status:200, json: async()=>JSON.parse(fs.readFileSync(p,'utf-8')) });

const strip = s => s.replace(/if \(typeof module[\s\S]*$/,'');
for (const f of ['engine','brew','logs','flavor','analysis','router'])
  eval(strip(fs.readFileSync(`assets/${f}.js`,'utf-8')));
eval(strip(fs.readFileSync('assets/router.js','utf-8')) + '\n;Object.assign(globalThis,{Router});');
eval(strip(fs.readFileSync('assets/engine.js','utf-8')) + '\n;Object.assign(globalThis,{Grind,Score,Convert,Engine});');
eval(strip(fs.readFileSync('assets/brew.js','utf-8')) + '\n;Object.assign(globalThis,{BrewPlan,Alerts,WakeLock,BrewSession});');
eval(strip(fs.readFileSync('assets/logs.js','utf-8')) + '\n;Object.assign(globalThis,{LogEntry,LogStore});');
eval(strip(fs.readFileSync('assets/flavor.js','utf-8')) + '\n;Object.assign(globalThis,{FlavorTree,Wheel});');
eval(strip(fs.readFileSync('assets/analysis.js','utf-8')) + '\n;Object.assign(globalThis,{Extraction,Analysis,Chart});');
eval(fs.readFileSync('assets/app.js','utf-8')
      .replace("document.addEventListener('DOMContentLoaded', () => App.init());",'')
   + '\n;Object.assign(globalThis,{Store,I18n,Data,App});');

console.log('\n════ 이벤트 리스너 누적 (핵심 회귀) ════');
await App.init();
const after1 = root.count('click');
ok(after1 === 1, `init 후 click 리스너 1개 (${after1}개)`);
ok(window.count('hashchange') === 1, `hashchange 리스너 1개 (${window.count('hashchange')}개)`);
ok(window.count('beforeunload') === 1, `beforeunload 리스너 1개 (${window.count('beforeunload')}개)`);

for (let i = 0; i < 30; i++) App.render();
const after30 = root.count('click');
ok(after30 === 1, `30회 재렌더 후에도 1개 (${after30}개)`);
ok(root.count('input') === 1 && root.count('change') === 1,
   `input/change도 각 1개 (${root.count('input')}/${root.count('change')})`);

console.log('\n════ 토글이 홀수·짝수에 무관하게 동작하는가 ════');
{
  // 리스너가 N개면 탭 1회에 토글이 N번 실행돼 짝수일 때 제자리로 돌아옵니다
  App.settings.onboarded = true;
  App.settings.rec.flavor_families = [];
  const handler = root._listeners['click'][0];
  const fakeEvent = (act, v) => ({
    target: { closest: (sel) => sel === '[data-act]' ? { dataset:{ act, v } } : null }
  });

  for (const h of root._listeners['click']) h(fakeEvent('toggle-flavor','fruity'));
  ok(App.settings.rec.flavor_families.length === 1,
     `한 번 탭 → 1개 선택 (${App.settings.rec.flavor_families.length}개)`);

  for (const h of root._listeners['click']) h(fakeEvent('toggle-flavor','fruity'));
  ok(App.settings.rec.flavor_families.length === 0,
     `다시 탭 → 해제 (${App.settings.rec.flavor_families.length}개)`);
}

console.log('\n════ 스크롤 위치 보존 ════');
{
  let scrollTop = 0;
  const scroller = { get scrollTop(){return scrollTop}, set scrollTop(v){scrollTop=v} };
  root.querySelector = (sel) => sel === '.scroll' ? scroller : null;

  App.page = 'archive'; App.render();      // 화면 진입
  scrollTop = 420;                          // 사용자가 스크롤
  App.render();                             // 같은 화면에서 재렌더 (칩 탭 등)
  ok(scrollTop === 420, `같은 화면 재렌더 시 스크롤 유지 (${scrollTop})`);

  App.page = 'logs'; App.render();          // 다른 화면으로 이동
  ok(scrollTop === 0, `화면 전환 시에는 맨 위로 (${scrollTop})`);
  root.querySelector = () => null;
}

console.log('\n════ IME 조합 중 재렌더 보류 ════');
{
  App._composing = true;
  App._renderPending = false;
  const before = root.innerHTML;
  App.page = 'home'; App.render();
  ok(App._renderPending === true, '조합 중에는 렌더를 미룸');
  ok(root.innerHTML === before, '화면을 갈아끼우지 않음');

  App._composing = false;
  const end = root._listeners['compositionend']?.[0];
  ok(typeof end === 'function', 'compositionend 리스너 존재');
  end();
  ok(App._renderPending === false, '조합이 끝나면 밀린 렌더 실행');
  ok(root.innerHTML !== before, '화면이 갱신됨');
}

console.log('\n════ CSS 터치 응답성 ════');
{
  const css = fs.readFileSync('assets/style.css','utf-8');
  ok(css.includes('touch-action: manipulation'), '더블탭 확대 대기(약 300ms) 제거');
  ok(/input, textarea, select \{ font-size: 16px/.test(css),
     'iOS 입력 시 화면 확대 방지 (16px 이상)');
}

console.log(fail?`\n★ 실패 ${fail}/${n}`:`\n전체 통과 ${n}건`);
process.exit(fail?1:0);
