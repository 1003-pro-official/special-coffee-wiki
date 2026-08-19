import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { Extraction, Analysis, Chart } = require('../assets/analysis.js');

let fail=0,n=0;
const ok=(c,m)=>{n++;console.log((c?'  OK   ':'  ★NG  ')+m);if(!c)fail++};
const eq=(a,b,m)=>ok(JSON.stringify(a)===JSON.stringify(b),`${m}  →  ${JSON.stringify(a)}${JSON.stringify(a)===JSON.stringify(b)?'':' (기대 '+JSON.stringify(b)+')'}`);

const L=(o)=>({ id:o.id, brewed_at:o.at, recipe_id:o.r||'kasuya-46',
  recipe_title:{ko:'카스야',en:'Kasuya'},
  planned:{temp_c:o.t, grind_setting:o.g, dose_g:o.d??20, water_g:300},
  actual:{total_time_s:o.time??210}, sensory:{overall:o.s},
  flavor_nodes:o.f||[], measured:o.m||{}, next_action:o.na||null });

console.log('\n════ 추출 수율 ════');
{
  // EY = TDS% × 추출량 / 도징
  eq(Extraction.yield(1.35, 260, 20), 17.6, '1.35% · 260g · 20g');
  eq(Extraction.yield(1.40, 250, 15), 23.3, '농도 높고 도징 적으면 수율 상승');
  eq(Extraction.yield(null, 260, 20), null, 'TDS 없으면 null');
  eq(Extraction.yield(1.35, null, 20), null, '추출량 없으면 null');
  eq(Extraction.yield(1.35, 260, 0), null, '도징 0 방어 (0으로 나누지 않음)');

  eq(Extraction.estimateBeverage(300, 20), 260, '추출량 추정 300 - 20×2');
  eq(Extraction.estimateBeverage(240, 15), 210, '추정 240 - 15×2');
  eq(Extraction.estimateBeverage(null, 20), null, '입력 없으면 null');
  ok(Extraction.estimateBeverage(20, 20) >= 0, '음수가 나오지 않음');
}

console.log('\n════ 추출 구간 판정 ════');
{
  eq(Extraction.zone(16.5, 1.30).ext, 'under', '18% 미만은 과소추출');
  eq(Extraction.zone(20.0, 1.30).ext, 'ideal', '18~22%는 적정');
  eq(Extraction.zone(23.5, 1.30).ext, 'over', '22% 초과는 과다추출');
  eq(Extraction.zone(20.0, 1.05).strength, 'weak', 'TDS 낮으면 연함');
  eq(Extraction.zone(20.0, 1.55).strength, 'strong', 'TDS 높으면 진함');
  eq(Extraction.zone(20.0, null).strength, null, 'TDS 없으면 농도 판정 없음');
  eq(Extraction.zone(null, 1.3), null, '수율 없으면 판정 불가');
}

console.log('\n════ 다이얼인 시계열 ════');
{
  const logs=[
    L({id:'3',at:'2026-08-14',t:94,g:18,s:7.5,na:'분쇄 더 곱게'}),
    L({id:'1',at:'2026-08-10',t:96,g:22,s:6.0}),
    L({id:'2',at:'2026-08-12',t:95,g:20,s:6.5}),
    L({id:'x',at:'2026-08-13',t:90,g:24,s:8.0,r:'hoffmann-v60'})
  ];
  const d=Analysis.dialIn(logs,'kasuya-46');
  eq(d.length, 3, '해당 레시피만');
  eq(d.map(x=>x.n), [1,2,3], '회차 번호');
  eq(d.map(x=>x.id), ['1','2','3'], '오래된 것부터 정렬');
  eq(d[0].changed, [], '첫 회차는 변경 없음');
  eq(d[1].changed, [{key:'temp',delta:-1},{key:'grind',delta:-2}], '2회차 변경');
  eq(d[2].changed, [{key:'temp',delta:-1},{key:'grind',delta:-2}], '3회차 변경');
  eq(d[2].next_action, '분쇄 더 곱게', '조정 메모 유지');
  eq(Analysis.dialIn(logs,'없는레시피'), [], '없는 레시피는 빈 배열');
  eq(Analysis.dialIn([],'kasuya-46'), [], '빈 로그');

  // 수율은 측정값이 있을 때만
  const withTds=[L({id:'a',at:'2026-08-10',t:94,g:20,s:7,d:20,m:{tds_pct:1.35,beverage_g:260}})];
  eq(Analysis.dialIn(withTds,'kasuya-46')[0].ey, 17.6, '측정값 있으면 수율 계산');
  eq(d[0].ey, null, '측정값 없으면 null');
}

console.log('\n════ 레시피별 집계 ════');
{
  const logs=[
    L({id:'1',at:'2026-08-10',t:94,g:20,s:6}),
    L({id:'2',at:'2026-08-11',t:94,g:20,s:8}),
    L({id:'3',at:'2026-08-12',t:90,g:24,s:7,r:'hoffmann-v60'})
  ];
  const c=Analysis.recipeCounts(logs);
  eq(c.length, 2, '레시피 2종');
  eq(c[0].recipe_id, 'kasuya-46', '많이 내린 순');
  eq(c[0].count, 2, '카스야 2회');
  eq(c[0].best, 8, '최고 점수');
  ok(c[0].title.ko === '카스야', '제목 스냅숏 유지');
}

console.log('\n════ 향미 빈도 ════');
{
  const logs=[
    L({id:'1',at:'2026-08-10',t:94,g:20,s:7,f:['floral','fruity']}),
    L({id:'2',at:'2026-08-11',t:94,g:20,s:7,f:['floral','sweet']}),
    L({id:'3',at:'2026-08-12',t:94,g:20,s:7,f:['floral']})
  ];
  const f=Analysis.flavorFrequency(logs);
  eq(f[0], {id:'floral',n:3}, '가장 자주 감지한 향미');
  eq(f.length, 3, '3종');
  eq(Analysis.flavorFrequency(logs,1).length, 1, 'topN 제한');
  eq(Analysis.flavorFrequency([]), [], '빈 로그');
}

console.log('\n════ 요약 ════');
{
  const now=new Date();
  const thisM=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
  const logs=[
    L({id:'1',at:'2020-01-01',t:94,g:20,s:6}),
    L({id:'2',at:thisM,t:94,g:20,s:8}),
    L({id:'3',at:thisM,t:90,g:24,s:7,r:'hoffmann-v60'})
  ];
  const s=Analysis.summary(logs);
  eq(s.total, 3, '전체 3건');
  eq(s.thisMonth, 2, '이번 달 2건');
  eq(s.avgScore, 7, '평균 7.0');
  eq(s.bestScore, 8, '최고 8');
  eq(s.recipes, 2, '레시피 2종');
  eq(Analysis.summary([]).avgScore, null, '빈 로그는 평균 null');
}

console.log('\n════ 차트 좌표 ════');
{
  const c=Chart.line([6,6.5,7.5], {w:300,h:120,pad:8});
  eq(c.points.length, 3, '점 3개');
  eq(c.min, 6, '최솟값'); eq(c.max, 7.5, '최댓값');
  ok(c.points[0].x===8 && c.points[2].x===292, `x가 패딩 안에서 균등 (${c.points[0].x}~${c.points[2].x})`);
  ok(c.points[0].y > c.points[2].y, 'y는 위로 갈수록 작음 (값이 클수록 위)');
  ok(c.d.startsWith('M') && c.d.includes('L'), `path 형식 ${c.d.slice(0,20)}…`);
  ok(!c.d.includes('NaN'), 'NaN 없음');

  // 값이 전부 같으면 선이 끝에 붙지 않아야 합니다
  const flat=Chart.line([7,7,7]);
  ok(flat.points.every(p=>p.y>8 && p.y<112), `평평한 값도 중앙에 (${flat.points[0].y})`);

  // null 구간은 잇지 않습니다
  const gap=Chart.line([6,null,8]);
  eq(gap.points.length, 2, 'null 제외 2점');
  eq((gap.d.match(/M/g)||[]).length, 2, '끊긴 구간은 M으로 재시작');
  ok(!gap.d.includes('L'), '이어붙이지 않음');

  eq(Chart.line([]).d, '', '빈 배열은 빈 path');
  eq(Chart.line([null,null]).points, [], '전부 null이면 점 없음');
  eq(Chart.line([5]).points[0].x, 150, '한 점은 가운데');

  // 기준선
  const g=Chart.guide(20, {min:16, max:24, w:300, h:120, pad:8});
  ok(g && g.d.startsWith('M8 '), `기준선 path (${g.d})`);
  eq(Chart.guide(30, {min:16,max:24}), null, '범위 밖 기준선은 null');
  eq(Chart.guide(20, {min:null,max:null}), null, '범위 없으면 null');
}

console.log(fail?`\n★ 실패 ${fail}/${n}`:`\n전체 통과 ${n}건`);
process.exit(fail?1:0);
