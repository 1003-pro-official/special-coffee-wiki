import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { Grind, Score, Convert, Engine } = require('../assets/engine.js');

const J = p => JSON.parse(fs.readFileSync(p, 'utf-8'));
const brewers = J('data/brewers.json').brewers;
const grinders = J('data/grinders.json').grinders;
const recipes = J('data/recipes.json').recipes;
const B = id => brewers.find(b => b.id === id);
const G = id => grinders.find(g => g.id === id);
const R = id => recipes.find(r => r.id === id);

let fail = 0, n = 0;
const ok = (c, m) => { n++; console.log((c ? '  OK   ' : '  ★NG  ') + m); if (!c) fail++; };
const eq = (a, b, m) => ok(a === b, `${m}  →  ${JSON.stringify(a)}${a===b?'':' (기대 '+JSON.stringify(b)+')'}`);

const ctxOf = o => ({
  brewer: B(o.brewer), brewerOf: B, grinder: G(o.grinder), anchor: o.anchor,
  bean: o.bean, goals: o.goals || [], maxDifficulty: o.maxDifficulty,
  waterPreset: o.waterPreset || 'filtered'
});

console.log('\n════ Score.brewer ════');
{
  const c = ctxOf({ brewer:'hario-v60-02-plastic', grinder:'timemore-chestnut-c3', anchor:20 });
  eq(Score.brewer(R('hoffmann-v60'), c).points, 30, '레시피 V60 + 내 V60 = 완전 일치');
  eq(Score.brewer(R('wbrc-2025-peng-final'), c).points, 16, 'Solo(cone,very_fast) vs V60(cone,fast) → geometry만 일치');
  eq(Score.brewer(R('kalita-wave-standard'), c).points, 4, 'Kalita(flat,medium) vs V60(cone,fast) → 불일치');

  const c2 = ctxOf({ brewer:'origami-m-ceramic', grinder:'comandante-c40-mk4', anchor:25 });
  eq(Score.brewer(R('hoffmann-v60'), c2).points, 27, 'compatible_brewers에 등재 → 준일치');

  const c3 = ctxOf({ brewer:'kalita-wave-155-steel', grinder:'baratza-encore', anchor:20 });
  eq(Score.brewer(R('kalita-wave-standard'), c3).points, 27, 'Kalita 155는 185 레시피의 호환 목록');
}

console.log('\n════ Score.roast ════');
{
  const mk = rl => ctxOf({ brewer:'hario-v60-02-plastic', grinder:'timemore-chestnut-c3', anchor:20, bean:{roast_level:rl} });
  eq(Score.roast(R('high-agitation-light'), mk('light')).points, 20, 'light 레시피 + light 원두');
  eq(Score.roast(R('high-agitation-light'), mk('light-medium')).points, 12, '1단계 차');
  eq(Score.roast(R('high-agitation-light'), mk('medium')).points, 5, '2단계 차');
  eq(Score.roast(R('high-agitation-light'), mk('full-city')).points, 0, '4단계 차');
  eq(Score.roast(R('clever-immersion'), mk('full-city')).points, 20, '범위가 넓은 레시피는 거리 0');
}

console.log('\n════ Score 총점 ════');
{
  const c = ctxOf({
    brewer:'hario-v60-02-plastic', grinder:'timemore-chestnut-c3', anchor:20,
    bean:{ roast_level:'light', process:'washed', flavor_families:['fruity','floral'] },
    goals:['clarity'], maxDifficulty:3
  });
  const r = Score.evaluate(R('high-agitation-light'), c);
  eq(r.score, 95, '검증 항목 외 전부 일치 → 95 (verified:false라 5점 감점)');
  ok(r.breakdown.length === 6, '항목 6개');
  eq(Score.evaluate(R('kasuya-46'), c).score, 100, 'verified:true 레시피는 만점 도달 가능');

  const worst = Score.evaluate(R('melitta-onepot'), c);
  eq(Score.fit(worst), 'mismatch', `멜리타는 점수 ${worst.score}점이지만 부적합 판정`);
  eq(Score.fit(Score.evaluate(R('kasuya-46'), c)), 'high', '카스야는 high');
}

console.log('\n════ Convert — 유속 차이 ════');
{
  // 내 V60(fast) ← Solo(very_fast) 레시피: 내 쪽이 느리므로 굵게 + 온도 -1
  const c = ctxOf({ brewer:'hario-v60-02-plastic', grinder:'timemore-chestnut-c3', anchor:20,
                    bean:{roast_level:'light', process:'washed'} });
  const r = Convert.run(R('wbrc-2025-peng-final'), c);
  const gb = r.adjustments.find(a => a.field==='grind_band' && a.reasonKey.startsWith('conv.flow'));
  eq(gb.to - gb.from, 1, 'very_fast → fast 이동 시 1밴드 굵게');

  // 내 Kalita(medium) ← V60(fast) 레시피: 기획서 표의 "V60 → Kalita = 굵게" 케이스
  const c2 = ctxOf({ brewer:'kalita-wave-185-steel', grinder:'comandante-c40-mk4', anchor:25,
                     bean:{roast_level:'medium', process:'washed'} });
  const r2 = Convert.run(R('hoffmann-v60'), c2);
  const gb2 = r2.adjustments.find(a => a.field==='grind_band' && a.reasonKey.startsWith('conv.flow'));
  eq(gb2.to - gb2.from, 1, 'fast → medium 이동 시 1밴드 굵게 (기획서 표와 일치)');
  ok(r2.adjustments.some(a => a.field==='temp_c'), '느린 브루어로 갈 때 온도 하향 보정 있음');
}

console.log('\n════ Convert — 로스트 기준선 ════');
{
  // 풀시티 원두로 라이트용 카스야(92°C) 실행 → 풀시티 대역 [87,90]으로 당김
  const c = ctxOf({ brewer:'hario-v60-02-plastic', grinder:'timemore-chestnut-c3', anchor:20,
                    bean:{roast_level:'full-city', process:'natural'} });
  const r = Convert.run(R('kasuya-46'), c);
  eq(r.final.temp_c, 90, '92°C → 풀시티 상한 90°C로 보정');
  ok(r.final.grind_band > (R('kasuya-46').equipment.grind_band ?? 0), '풀시티는 더 굵게');
  ok(r.adjustments.some(a=>a.reasonKey==='conv.roastTemp'), '보정 사유가 기록됨');
}

console.log('\n════ Convert — 경과일 / 특수 장비 / 물 ════');
{
  const base = { brewer:'hario-v60-02-plastic', grinder:'timemore-chestnut-c3', anchor:20 };
  const fresh = Convert.run(R('hoffmann-v60'), ctxOf({...base, bean:{roast_level:'light', days_off_roast:2}}));
  ok(fresh.cautions.some(x=>x.key==='conv.freshBloom'), '3일 이내 → 블룸 안내');

  const stale = Convert.run(R('hoffmann-v60'), ctxOf({...base, bean:{roast_level:'light', days_off_roast:30}}));
  ok(stale.adjustments.some(a=>a.reasonKey==='conv.staleTemp'), '21일 초과 → 온도 상향');

  const peng = Convert.run(R('wbrc-2025-peng-final'), ctxOf({...base, bean:{roast_level:'light'}}));
  const ex = peng.cautions.find(x=>x.key==='conv.missingExtra');
  ok(ex && ex.vars.extra==='melodrip' && ex.prose, 'Melodrip 미보유 → 대체 안내 문구 동봉');
  ok(peng.cautions.some(x=>x.key==='conv.lowTdsOk'), '저TDS 물 → 정수로 근사 가능 안내');

  const cer = Convert.run(R('hoffmann-v60'), ctxOf({...base, brewer:'hario-v60-02-ceramic', bean:{roast_level:'light'}}));
  ok(cer.cautions.some(x=>x.key==='conv.preheat'), '세라믹 → 예열 주의');
}

console.log('\n════ Convert — 최종 파라미터 ════');
{
  const c = ctxOf({ brewer:'hario-v60-02-plastic', grinder:'comandante-c40-mk4', anchor:25,
                    bean:{roast_level:'light', process:'washed'} });
  const r = Convert.run(R('kasuya-46'), c);
  eq(r.final.grind_band, 2, '카스야 원본 +2밴드 유지 (같은 V60, 같은 라이트)');
  eq(r.final.grind_setting, 29, 'Comandante 앵커 25 + 2×2 = 29클릭');
  eq(r.final.dose_g, 20, '도징 그대로');
  eq(r.final.water_g, 300, '물량 그대로');
}

console.log('\n════ Convert — 간격 스케일 ════');
{
  const src = R('wbrc-2025-peng-final').steps;
  const scaled = Convert.scaleIntervals(src, 0.75);
  eq(scaled.length, src.length, '단계 수 보존');
  const w1 = src.find(s=>s.wait_s>0), s1 = scaled.find(s=>s.index===w1.index);
  eq(s1.wait_s, Math.round(w1.wait_s*0.75), '대기 시간만 축소');
  ok(scaled[scaled.length-1].target_end_s < src[src.length-1].target_end_s, '총 시간 단축');
  const cum = scaled.filter(s=>s.cumulative_g!=null).map(s=>s.cumulative_g);
  ok(JSON.stringify(cum)===JSON.stringify(src.filter(s=>s.cumulative_g!=null).map(s=>s.cumulative_g)),
     '물량은 변하지 않음');
}

console.log('\n════ Engine.recommend — 실제 시나리오 ════');
{
  const c = ctxOf({
    brewer:'hario-v60-02-plastic', grinder:'timemore-chestnut-c3', anchor:20,
    bean:{ roast_level:'light', process:'washed', flavor_families:['floral','fruity'], days_off_roast:8 },
    goals:['clarity'], maxDifficulty:3
  });
  const res = Engine.recommend(recipes, c);
  console.log('   순위:');
  res.forEach((x,i)=>console.log(`     ${i+1}. ${String(x.score).padStart(3)}점  ${x.recipe.id}`));
  ok(res.length === recipes.length, '전체 레시피 평가');
  ok(res[0].score >= res[res.length-1].score, '점수 내림차순');
  ok(['high-agitation-light','hoffmann-v60','kasuya-46'].includes(res[0].recipe.id),
     `라이트+클래리티+V60 → 상위가 타당 (1위 ${res[0].recipe.id})`);
  ok(res.findIndex(x=>x.recipe.id==='melitta-onepot') >= res.length-3, '멜리타는 하위권');

  const why = Engine.reasons(res[0], c);
  ok(why.length >= 2, `근거 ${why.length}줄 생성`);
  ok(why.every(w=>w.key && w.key.startsWith('why.')), '근거가 i18n 키 형태');
  console.log('   1위 근거:', why.map(w=>`[${w.type}] ${w.key}`).join(', '));
}

console.log(`\n${fail ? '★ 실패 '+fail+'/'+n : '전체 통과 '+n+'건'}`);
process.exit(fail?1:0);
