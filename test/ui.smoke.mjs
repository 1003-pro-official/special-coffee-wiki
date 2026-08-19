import fs from 'fs';
const mem={};
let rafQ=[];
globalThis.document={documentElement:{lang:'',setAttribute(){},removeAttribute(){}},
  getElementById:()=>({innerHTML:'',textContent:'',scrollTop:0,style:{},classList:{toggle(){},add(){},remove(){}},addEventListener(){},setAttribute(){},removeAttribute(){},dataset:{}}),
  querySelector:()=>null, querySelectorAll:()=>[],
  addEventListener:()=>{}};
globalThis.localStorage={getItem:k=>mem[k]??null,setItem:(k,v)=>{mem[k]=v},removeItem:k=>{delete mem[k]}};
Object.defineProperty(globalThis,'navigator',{value:{language:'ko-KR'},configurable:true});
globalThis.location={protocol:'http:',reload(){}};
globalThis.confirm=()=>true;
globalThis.window={};
globalThis.requestAnimationFrame=f=>{rafQ.push(f);return rafQ.length};
globalThis.cancelAnimationFrame=()=>{};
globalThis.fetch=async p=>({ok:true,status:200,json:async()=>JSON.parse(fs.readFileSync(p,'utf-8'))});

const warn=[]; const _w=console.warn; console.warn=(...a)=>{warn.push(a.join(' '))};
const strip=s=>s.replace(/if \(typeof module[\s\S]*$/,'');
eval(strip(fs.readFileSync('assets/engine.js','utf-8'))+'\n;Object.assign(globalThis,{Grind,Score,Convert,Engine});');
eval(strip(fs.readFileSync('assets/brew.js','utf-8'))+'\n;Object.assign(globalThis,{BrewPlan,Alerts,WakeLock,BrewSession});');
eval(fs.readFileSync('assets/app.js','utf-8').replace("document.addEventListener('DOMContentLoaded', () => App.init());",'')
   +'\n;Object.assign(globalThis,{Store,I18n,Data,App,esc});');
console.warn=_w;

let fail=0,n=0; const ok=(c,m)=>{n++;console.log((c?'  OK   ':'  ★NG  ')+m);if(!c)fail++};

await Data.loadAll('ko'); I18n.setLang('ko');
App.settings=Store.load();
Object.assign(App.settings,{brewer_id:'hario-v60-02-plastic',grinder_id:'timemore-chestnut-c3',
  grind_anchor:20,onboarded:true});
Object.assign(App.settings.rec,{roast_level:'light',process:'washed',
  flavor_families:['floral','fruity'],days_off_roast:8,goals:['clarity'],max_difficulty:3});
App.runRecommend();

console.log('[추출 세션 열기]');
const top=App.results[0].recipe.id;
App.openBrew(top);
ok(App.page==='brew-prep', `openBrew → ${App.page}`);
ok(App.brew.plan && App.brew.plan.timeline.length>0, `타임라인 ${App.brew.plan.timeline.length}단계`);
ok(App.brew.plan.prep.length>=0, `prep ${App.brew.plan.prep.length}개`);

// 변환된 steps를 쓰는지 확인 (원본이 아니라)
const conv=App.results.find(r=>r.recipe.id==='wbrc-2025-peng-final');
App.brew.result=conv; App.brew.plan=BrewPlan.build(conv.steps);
const origTotal=BrewPlan.build(conv.recipe.steps).totalS;
ok(App.brew.plan.totalS<=origTotal,
   `변환된 타임라인 사용: ${App.brew.plan.totalS}s (원본 ${origTotal}s)`);
App.openBrew(top);

console.log('\n[화면 렌더]');
for(const [name,page,fn] of [['준비','brew-prep',()=>App.viewBrewPrep()],
                             ['타이머','brew',()=>App.viewBrew()]]){
  try{ App.page=page; const h=fn();
    ok(h.length>400 && !h.includes('undefined') && !h.includes('NaN') && !/\[object/.test(h),
       `${name} (${h.length}자)`); }
  catch(e){ ok(false,`${name} 예외: ${e.message}`); }
}

console.log('\n[타이머 동작 — 시각 조작]');
{
  const plan=App.brew.plan;
  let ticks=[];
  const s=new BrewSession(plan,st=>ticks.push(st));
  const realNow=Date.now;
  let fake=1000000;
  Date.now=()=>fake;
  s.start();
  const step=()=>{ rafQ.splice(0).forEach(f=>f()); };

  fake+=1000; step();
  ok(Math.round(s.elapsed)===1, `1초 경과 (${s.elapsed.toFixed(1)})`);

  // 백그라운드 30초 — rAF가 멈춰도 절대 시각 기준이라 어긋나면 안 됨
  fake+=30000; step();
  ok(Math.round(s.elapsed)===31, `백그라운드 30초 후에도 정확 (${s.elapsed.toFixed(1)}초)`);

  // 일시정지 중에는 시간이 흐르지 않아야 함
  s.pause();
  const at=s.elapsed; fake+=10000;
  ok(Math.abs(s.elapsed-at)<0.01, `일시정지 중 정지 (${s.elapsed.toFixed(1)})`);
  s.resume(); step();
  ok(Math.abs(s.elapsed-at)<0.05, `재개 시 이어서 (${s.elapsed.toFixed(1)})`);

  // 수동 다음 — marks에 기록
  const before=s.marks.length;
  s.skipToNext();
  ok(s.marks.length===before+1 && s.marks.at(-1).auto===false, '수동 넘김이 marks에 기록됨');

  // 끝까지
  fake+=plan.totalS*1000; step();
  ok(s.finished, '종료 판정');
  ok(s.marks.length>=2, `단계 전환 ${s.marks.length}건 기록`);
  Date.now=realNow;
  s.stop();
  App.brew.session=s;
}

console.log('\n[완료 화면]');
try{ App.page='brew-done'; const h=App.viewBrewDone();
  ok(h.length>400 && !h.includes('undefined') && !h.includes('NaN'), `완료 (${h.length}자)`);
  ok(h.includes('3:')||h.includes('2:')||h.includes('1:'), '총 시간 표기'); }
catch(e){ ok(false,`완료 예외: ${e.message}`); }

console.log('\n[영어 전환]');
await Data.loadDict('en'); I18n.setLang('en');
App.openBrew(top);
const en=App.viewBrewPrep();
ok(en.includes('Prepare')||en.includes('Start'),'영어 준비 화면');
// '한국어'는 언어 토글 버튼 라벨이라 영어판에도 남는 것이 맞습니다
const ko=[...new Set((en.match(/[가-힣][가-힣 ·+~()0-9]*/g)||[]))].filter(x=>x!=='한국어');
ok(ko.length===0,'영어판에 한글 없음 (언어 토글 제외)'+(ko.length?` → ${JSON.stringify(ko)}`:''));
await Data.loadDict('ko'); I18n.setLang('ko');

console.log('\n[i18n 누락 키]');
const missing=warn.filter(w=>w.includes('누락 키'));
ok(missing.length===0, missing.join(' / ')||'없음');

console.log(fail?`\n★ 실패 ${fail}/${n}`:`\n전체 통과 ${n}건`);
process.exit(fail?1:0);
