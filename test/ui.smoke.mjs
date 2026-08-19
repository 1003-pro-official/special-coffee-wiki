import fs from 'fs';
const mem={};
let rafQ=[];
globalThis.Blob=class{constructor(){}};
globalThis.URL={createObjectURL:()=>'blob:x',revokeObjectURL(){}};
globalThis.FileReader=class{readAsText(){}};
globalThis.document={documentElement:{lang:'',setAttribute(){},removeAttribute(){}},
  createElement:()=>({href:'',download:'',click(){},remove(){},style:{}}), body:{appendChild(){}},
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
eval(strip(fs.readFileSync('assets/logs.js','utf-8'))+'\n;Object.assign(globalThis,{LogEntry,LogStore});');
eval(strip(fs.readFileSync('assets/flavor.js','utf-8'))+'\n;Object.assign(globalThis,{FlavorTree,Wheel});');
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

console.log('\n[Phase 1d — 전체 루프]');
{
  LogStore.clear();
  App.logs = [];
  App.openBrew(top);

  // 세션을 만들어 완료 상태로
  const realNow=Date.now; let fake=2000000; Date.now=()=>fake;
  const sess=new BrewSession(App.brew.plan,()=>{});
  sess.start(); fake+=212000; sess.finished=true;
  App.brew.session=sess; Date.now=realNow;

  App.page='brew-done';
  App.tasting={overall:null,flavor_nodes:[],next_action:''};
  let h=App.viewBrewDone();
  ok(h.includes('disabled'), '종합 평가 전에는 저장 버튼 비활성');

  App.tasting={overall:4,flavor_nodes:['floral','fruity'],next_action:'온도 1도 낮추고 마지막 푸어 20g 줄이기'};
  h=App.viewBrewDone();
  ok(!h.includes('undefined')&&!h.includes('NaN'), `테이스팅 폼 (${h.length}자)`);

  App.saveLog();
  ok(App.page==='logs', `저장 후 로그 화면으로 (${App.page})`);
  ok(App.logs.length===1, `로그 1건 (${App.logs.length})`);
  ok(App.tasting.overall===null, '테이스팅 입력 초기화');

  const list=App.viewLogs();
  ok(list.length>500&&!list.includes('undefined'), `로그 목록 (${list.length}자)`);
  ok(list.includes('온도 1도 낮추고'), '목록에 next_action 표시');

  App.logDetailId=App.logs[0].id;
  const det=App.viewLogDetail();
  ok(det.length>500&&!det.includes('undefined')&&!det.includes('NaN'), `로그 상세 (${det.length}자)`);
  ok(det.includes('3:32')||det.includes('3:3'), '실제 시간 표시');

  // 학습 루프가 닫히는지 — 다음 추출 화면에 직전 메모가 뜨는가
  App.openBrew(top);
  App.page='brew';
  const bh=App.viewBrew();
  ok(bh.includes('온도 1도 낮추고'), '다음 추출 화면에 지난 메모가 승계됨');

  // 두 번째 기록 → 목록에 diff 표시
  App.brew.session=sess;
  App.tasting={overall:5,flavor_nodes:['floral'],next_action:'좋았음'};
  App.saveLog();
  const list2=App.viewLogs();
  ok(App.logs.length===2, `로그 2건 (${App.logs.length})`);

  // 빈 목록 화면
  LogStore.clear(); App.logs=[];
  const empty=App.viewLogs();
  ok(!empty.includes('undefined'), '빈 로그 화면 렌더');
}

console.log('\n[Phase 2 — 아카이브]');
{
  App.archive={type:'all',geometry:null,roast:null,difficulty:null,openId:null};
  App.page='archive';
  const h=App.viewArchive();
  ok(h.length>1000&&!h.includes('undefined')&&!h.includes('NaN'), `아카이브 목록 (${h.length}자)`);
  ok(App.archiveList().length===Data.recipes.length, `필터 없으면 전체 ${App.archiveList().length}종`);

  App.archive.type='championship';
  const champ=App.archiveList();
  ok(champ.length===7, `챔피언 필터 ${champ.length}종`);
  ok(champ[0].author.year===2025, `최신 연도 우선 (${champ[0].author.year})`);
  ok(champ.every((r,i,a)=>i===0||a[i-1].author.year>=r.author.year), '연도 내림차순');

  App.archive.type='all'; App.archive.geometry='flat';
  ok(App.archiveList().every(r=>Data.byId.brewer[r.equipment.brewer_id].geometry==='flat'),
     `평면 드리퍼 필터 ${App.archiveList().length}종`);

  App.archive.geometry=null; App.archive.difficulty=4;
  const d4=App.archiveList();
  ok(d4.length===3, `난이도 4 구간이 채워짐 (${d4.length}종)`);

  App.archive={type:'all',geometry:null,roast:null,difficulty:null,openId:null};

  // 단계별 온도가 있는 레시피의 상세
  for (const id of ['wbrc-2018-fukahori-final','wbrc-2021-winton-final','wbrc-2022-hsu-final','kasuya-46']) {
    App.archive.openId=id; App.page='archive-detail';
    try {
      const d=App.viewArchiveDetail();
      ok(d.length>1000&&!d.includes('undefined')&&!d.includes('NaN'), `상세 ${id} (${d.length}자)`);
    } catch(e){ ok(false,`상세 ${id} 예외: ${e.message}`); }
  }

  // 온도 배지는 바뀔 때만
  App.archive.openId='wbrc-2018-fukahori-final';
  const fk=App.viewArchiveDetail();
  const badges=(fk.match(/temp-badge/g)||[]).length;
  ok(badges===2, `Fukahori 80→95→80 에서 배지 2개 (${badges}개)`);
  App.archive.openId='kasuya-46';
  const ks=App.viewArchiveDetail();
  ok((ks.match(/temp-badge/g)||[]).length===0, '단일 온도 레시피는 배지 없음');

  // 아카이브 → 추출로 이어지는지 (추천 결과에 없는 레시피도)
  App.results=null;
  App.openBrew('wbrc-2018-fukahori-final');
  ok(App.page==='brew-prep', `아카이브에서 바로 추출 준비로 (${App.page})`);
  ok(App.brew.plan.timeline.length>0, `타임라인 ${App.brew.plan.timeline.length}단계`);
  const pp=App.viewBrewPrep();
  ok(pp.includes('temp-badge'), '준비 화면에도 온도 배지');
  App.runRecommend();
}

console.log('\n[Phase 3 — 플레이버 탐색]');
{
  ok(Data.beans.length===16, `원두 ${Data.beans.length}종 로드`);
  App.flavor={drill:null,selected:[],mode:'or',openBean:null};
  App.page='flavor';
  let h=App.viewFlavor();
  ok(h.length>2000&&!h.includes('undefined')&&!h.includes('NaN'), `휠 화면 (${h.length}자)`);
  ok((h.match(/wheel__sector/g)||[]).length===9, '섹터 9개 렌더');
  ok(h.includes('<path class="wheel__sector"'), 'SVG path 생성');

  // 드릴다운
  App.flavor.drill='fruity';
  h=App.viewFlavor();
  ok(h.includes('drill__crumb'), '드릴 패널 표시');
  ok((h.match(/data-act="fl-drill"/g)||[]).length>9, '하위 계층 칩 추가 (베리/건과일 등)');

  App.flavor.drill='fruity.berry';
  h=App.viewFlavor();
  ok(h.includes('›'), '경로 표시');

  // 선택 → 필터
  App.flavor={drill:null,selected:['fruity.berry.blueberry'],mode:'or',openBean:null};
  h=App.viewFlavor();
  const shown=FlavorTree.matchBeans(Data.beans, App.flavor.selected, 'or');
  ok(shown.length===1, `블루베리 → ${shown.length}종`);
  ok(h.includes('mini--hit'), '매칭된 향미가 강조 표시됨');

  // AND / OR
  App.flavor.selected=['floral','nutty_cocoa'];
  App.flavor.mode='or';
  const orN=FlavorTree.matchBeans(Data.beans,App.flavor.selected,'or').length;
  App.flavor.mode='and';
  const andN=FlavorTree.matchBeans(Data.beans,App.flavor.selected,'and').length;
  ok(orN>andN, `OR ${orN} > AND ${andN}`);
  h=App.viewFlavor();
  ok(h.includes('fl-mode'), '모드 토글 렌더');

  // 결과 없음
  App.flavor.selected=['other.chemical'];
  App.flavor.mode='or';
  h=App.viewFlavor();
  ok(!h.includes('undefined'), '결과 0종일 때도 정상 렌더');

  // 원두 상세
  App.flavor={drill:null,selected:[],mode:'or',openBean:'origin-ke-kirinyaga-washed'};
  App.page='bean';
  const d=App.viewBeanDetail();
  ok(d.length>800&&!d.includes('undefined')&&!d.includes('NaN'), `원두 상세 (${d.length}자)`);
  ok(d.includes('SL28')||d.includes('sl28'), '품종 표시');

  // 전 원두 상세가 예외 없이 렌더되는지
  let bad=[];
  for(const b of Data.beans){
    App.flavor.openBean=b.id;
    try{ const x=App.viewBeanDetail(); if(x.includes('undefined')||x.includes('NaN')) bad.push(b.id); }
    catch(e){ bad.push(`${b.id}: ${e.message}`); }
  }
  ok(bad.length===0, bad.join(' / ')||`원두 ${Data.beans.length}종 상세 전부 정상`);

  // 원두 → 추천으로 이어지는지
  App.recommendForBean('origin-et-guji-natural');
  ok(App.page==='results', `원두에서 추천으로 (${App.page})`);
  ok(App.settings.rec.roast_level==='light' && App.settings.rec.process==='natural',
     `추천 조건 자동 입력 (${App.settings.rec.roast_level}/${App.settings.rec.process})`);
  ok(App.results && App.results.length===Data.recipes.length, '추천 결과 생성');
  const top=App.results.filter(r=>r.fit!=='mismatch')[0];
  ok(top && top.score>=60, `구지 내추럴 1위 ${top.recipe.id} ${top.score}점`);
}

console.log('\n[영어 — 로그 화면]');
{
  await Data.loadDict('en'); I18n.setLang('en');
  App.logs=[]; const e1=App.viewLogs();
  const kk=[...new Set((e1.match(/[가-힣][가-힣 ·+~()0-9]*/g)||[]))].filter(x=>x!=='한국어');
  ok(kk.length===0, '영어 로그 화면에 한글 없음'+(kk.length?` → ${JSON.stringify(kk)}`:''));

  App.page='archive'; App.archive={type:'all',geometry:null,roast:null,difficulty:null,openId:null};
  const e2=App.viewArchive();
  const kk2=[...new Set((e2.match(/[가-힣][가-힣 ·+~()0-9]*/g)||[]))].filter(x=>x!=='한국어');
  ok(kk2.length===0, '영어 아카이브 목록에 한글 없음'+(kk2.length?` → ${JSON.stringify(kk2)}`:''));

  App.page='flavor'; App.flavor={drill:'fruity',selected:['fruity.berry.blueberry'],mode:'or',openBean:null};
  const e3=App.viewFlavor();
  const kk3=[...new Set((e3.match(/[가-힣][가-힣 ·+~()0-9]*/g)||[]))].filter(x=>x!=='한국어');
  ok(kk3.length===0, '영어 플레이버 화면에 한글 없음'+(kk3.length?` → ${JSON.stringify(kk3)}`:''));

  App.flavor.openBean='origin-id-sumatra-wethulled';
  const e4=App.viewBeanDetail();
  const kk4=[...new Set((e4.match(/[가-힣][가-힣 ·+~()0-9]*/g)||[]))].filter(x=>x!=='한국어');
  ok(kk4.length===0, '영어 원두 상세에 한글 없음'+(kk4.length?` → ${JSON.stringify(kk4)}`:''));
  await Data.loadDict('ko'); I18n.setLang('ko');
}

console.log(fail?`\n★ 실패 ${fail}/${n}`:`\n전체 통과 ${n}건`);
process.exit(fail?1:0);
