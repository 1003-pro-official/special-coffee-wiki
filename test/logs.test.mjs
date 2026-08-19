import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { LogEntry, LogStore } = require('../assets/logs.js');

// localStorage 스텁 — 용량 제한을 흉내내 저장 실패 경로도 검증합니다
let mem={}, cap=Infinity;
globalThis.localStorage={
  getItem:k=>mem[k]??null,
  setItem:(k,v)=>{ if(v.length>cap){const e=new Error('quota');e.name='QuotaExceededError';throw e;} mem[k]=v; },
  removeItem:k=>{delete mem[k]}
};

let fail=0,n=0;
const ok=(c,m)=>{n++;console.log((c?'  OK   ':'  ★NG  ')+m);if(!c)fail++};
const eq=(a,b,m)=>ok(JSON.stringify(a)===JSON.stringify(b),`${m}  →  ${JSON.stringify(a)}${JSON.stringify(a)===JSON.stringify(b)?'':' (기대 '+JSON.stringify(b)+')'}`);

const recipes = JSON.parse(fs.readFileSync('data/recipes.json','utf-8')).recipes;
const mkResult = id => {
  const r = recipes.find(x=>x.id===id);
  return { recipe:r, final:{dose_g:20,water_g:300,ratio:'1:15',temp_c:92,grind_band:2,grind_setting:24,total_time_s:210} };
};
const mkSession = (elapsed, marks) => ({ elapsed, marks });
const settings = { brewer_id:'hario-v60-02-plastic', grinder_id:'timemore-chestnut-c3',
                   grinder_custom_name:null, grind_anchor:20 };
const rec = { roast_level:'light', process:'washed', flavor_families:['floral'], days_off_roast:8, goals:['clarity'] };

console.log('\n════ LogEntry.build ════');
let A;
{
  A = LogEntry.build({
    result: mkResult('kasuya-46'), plan:{totalS:210},
    session: mkSession(215, [{index:0,atS:0,auto:true},{index:1,atS:46.2,auto:false}]),
    settings, rec, tasting:{ overall:4, flavor_nodes:['floral'], next_action:'  온도 1도 낮추기  ' }
  });
  ok(/^log-/.test(A.id), `id 생성 ${A.id.slice(0,20)}…`);
  eq(A.recipe_id, 'kasuya-46', 'recipe_id');
  ok(A.recipe_title.ko && A.recipe_title.en, '레시피 제목 스냅숏 (ko/en 모두)');
  eq(A.planned.grind_setting, 24, '계획 분쇄 세팅');
  eq(A.actual.total_time_s, 215, '실제 총 시간 반올림');
  eq(A.actual.marks.length, 2, 'marks 보존');
  eq(A.sensory.overall, 4, '종합 평가');
  eq(A.next_action, '온도 1도 낮추기', 'next_action 앞뒤 공백 제거');
  eq(A.bean.roast_level, 'light', '원두 조건 스냅숏');

  const blank = LogEntry.build({ result:mkResult('kasuya-46'), plan:{totalS:210},
    session:mkSession(200,[]), settings, rec, tasting:{overall:3,flavor_nodes:[],next_action:'   '} });
  eq(blank.next_action, null, '빈 문자열은 null로');
}

console.log('\n════ 스냅숏 독립성 ════');
{
  // 레시피 원본을 바꿔도 이미 저장된 로그는 변하지 않아야 합니다
  const r = recipes.find(x=>x.id==='kasuya-46');
  const before = A.recipe_title.ko;
  r.title.ko = '바뀐 제목';
  ok(A.recipe_title.ko === before, `원본 변경 후에도 로그 제목 유지 (${A.recipe_title.ko})`);
  r.title.ko = before;
  // rec 배열도 복사본이어야 함
  rec.flavor_families.push('fruity');
  eq(A.bean.flavor_families, ['floral'], '입력 배열 변경이 로그에 새지 않음');
  rec.flavor_families.pop();
}

console.log('\n════ LogStore 저장 / 조회 ════');
{
  mem={}; cap=Infinity;
  ok(LogStore.all().length===0, '초기 빈 목록');
  ok(LogStore.add(A).ok, '추가 성공');
  eq(LogStore.all().length, 1, '1건 저장');
  const B = { ...A, id:'log-older', brewed_at:'2020-01-01T00:00:00.000Z' };
  LogStore.add(B);
  eq(LogStore.all()[0].id, A.id, '최신순 정렬 (최근이 앞)');
  ok(LogStore.remove('log-older').ok, '삭제');
  eq(LogStore.all().length, 1, '삭제 반영');
}

console.log('\n════ 용량 초과 처리 ════');
{
  cap = 10;   // 아주 작게
  const res = LogStore.add({ ...A, id:'log-big' });
  ok(!res.ok && res.reason==='quota', `저장 실패를 quota로 보고 (${res.reason})`);
  cap = Infinity;
  ok(LogStore.all().length===1, '실패해도 기존 기록은 그대로');
}

console.log('\n════ 손상된 데이터 방어 ════');
{
  mem['scw.logs'] = '{ 깨진 JSON';
  eq(LogStore.all(), [], '파싱 실패 시 빈 목록 (덮어쓰지 않음)');
  ok(mem['scw.logs'] === '{ 깨진 JSON', '원본을 지우지 않음 — 수동 복구 여지를 남김');
  mem={};
}

console.log('\n════ 내보내기 / 불러오기 ════');
{
  mem={};
  const L1 = { ...A, id:'a1', brewed_at:'2026-08-10T00:00:00.000Z' };
  const L2 = { ...A, id:'a2', brewed_at:'2026-08-12T00:00:00.000Z' };
  LogStore.save([L2, L1]);

  const payload = LogStore.exportPayload(LogStore.all());
  eq(payload.format, 'special-coffee-wiki/brew-logs', '포맷 식별자');
  eq(payload.count, 2, '건수');
  ok(/^special-coffee-wiki-logs-\d{4}-\d{2}-\d{2}\.json$/.test(LogStore.filename()),
     `파일명 ${LogStore.filename()}`);

  // 같은 파일을 다시 불러와도 중복되지 않아야 합니다
  const again = LogStore.importPayload(payload, LogStore.all());
  ok(again.ok && again.added===0 && again.skipped===2, `재불러오기 중복 제외 (added ${again.added}, skipped ${again.skipped})`);

  const other = { logs:[{ ...A, id:'b1', brewed_at:'2026-08-14T00:00:00.000Z' }] };
  const merged = LogStore.importPayload(other, LogStore.all());
  ok(merged.ok && merged.added===1, '새 항목 병합');
  eq(merged.merged.length, 3, '병합 후 3건');
  eq(merged.merged[0].id, 'b1', '병합 결과도 최신순');

  ok(!LogStore.importPayload(null, []).ok, 'null 거부');
  ok(!LogStore.importPayload({foo:1}, []).ok, '형식 불일치 거부');
  ok(!LogStore.importPayload({logs:[{no:'id'}]}, []).ok, 'id 없는 항목만 있으면 거부');
  ok(LogStore.importPayload([{id:'x',brewed_at:'2026-01-01'}], []).ok, '배열 직접도 허용');
}

console.log('\n════ diff — 다이얼인 추적 ════');
{
  const older = { planned:{temp_c:95, grind_setting:20, dose_g:20}, actual:{total_time_s:195} };
  const newer = { planned:{temp_c:94, grind_setting:18, dose_g:20}, actual:{total_time_s:208} };
  const d = LogEntry.diff(newer, older);
  eq(d.find(x=>x.key==='temp').delta, -1, '온도 −1');
  eq(d.find(x=>x.key==='grind').delta, -2, '분쇄 −2');
  eq(d.find(x=>x.key==='time').delta, 13, '시간 +13');
  ok(!d.find(x=>x.key==='dose'), '변화 없는 항목은 제외');
  eq(LogEntry.diff(newer, null), [], '이전 기록 없으면 빈 배열');
}

console.log('\n════ findPrevious — next_action 승계 ════');
{
  const logs = [
    { id:'3', brewed_at:'2026-08-14', recipe_id:'kasuya-46', bean:{roast_level:'light'}, next_action:'최신' },
    { id:'2', brewed_at:'2026-08-12', recipe_id:'hoffmann-v60', bean:{roast_level:'light'}, next_action:'다른 레시피' },
    { id:'1', brewed_at:'2026-08-10', recipe_id:'kasuya-46', bean:{roast_level:'light'}, next_action:'옛날' }
  ];
  eq(LogEntry.findPrevious(logs,{recipeId:'kasuya-46',roastLevel:'light'}).id, '3', '같은 레시피 중 최신');
  eq(LogEntry.findPrevious(logs,{recipeId:'clever-immersion',roastLevel:'light'}).id, '3',
     '레시피가 없으면 같은 로스팅 정도의 최신으로 폴백');
  eq(LogEntry.findPrevious(logs,{recipeId:'x',roastLevel:'dark'}), null, '해당 없음이면 null');
  eq(LogEntry.findPrevious([],{recipeId:'x',roastLevel:'light'}), null, '빈 목록');

  eq(LogEntry.attemptNumber(logs,'kasuya-46','2026-08-14'), 2, '다이얼인 2회차');
  eq(LogEntry.attemptNumber(logs,'kasuya-46','2026-08-10'), 1, '첫 회차');
}

console.log(fail?`\n★ 실패 ${fail}/${n}`:`\n전체 통과 ${n}건`);
process.exit(fail?1:0);
