import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { BrewPlan } = require('../assets/brew.js');

const recipes = JSON.parse(fs.readFileSync('data/recipes.json','utf-8')).recipes;
const R = id => recipes.find(r => r.id === id);

let fail=0,n=0;
const ok=(c,m)=>{n++;console.log((c?'  OK   ':'  ★NG  ')+m);if(!c)fail++};
const eq=(a,b,m)=>ok(a===b,`${m}  →  ${JSON.stringify(a)}${a===b?'':' (기대 '+JSON.stringify(b)+')'}`);

console.log('\n════ BrewPlan.build ════');
{
  const p = BrewPlan.build(R('kasuya-46').steps);
  eq(p.prep.length, 1, '예열은 prep으로 분리 (타이머 시작 전)');
  eq(p.prep[0].type, 'preheat', 'prep의 타입');
  eq(p.timeline.length, 6, '타임라인 6단계 (블룸+4푸어+드로우다운)');
  eq(p.timeline[0].startS, 0, '첫 단계는 0초');
  eq(p.totalS, 210, '총 3:30');

  // endS는 "다음 단계 시작 시각"이어야 합니다
  eq(p.timeline[0].endS, 45, '블룸 종료 = 2투 시작(45s)');
  eq(p.timeline[1].endS, 90, '2투 종료 = 3투 시작(90s)');
  eq(p.timeline[5].endS, 210, '마지막은 target_end_s');

  const ph = BrewPlan.build(R('hoffmann-v60').steps);
  eq(ph.timeline.length, 6, 'Hoffmann 6단계 (교반 2회 포함)');
  eq(ph.totalS, 210, 'Hoffmann 총 3:30');
  ok(ph.timeline.every((s,i,a)=> i===0 || s.startS >= a[i-1].startS), 'startS 오름차순');
  ok(ph.timeline.every(s => s.endS >= s.startS), 'endS >= startS');
}

console.log('\n════ 전 레시피 무결성 ════');
{
  let bad=[];
  for (const r of recipes) {
    const p = BrewPlan.build(r.steps);
    if (!p.timeline.length) bad.push(`${r.id}: 타임라인 없음`);
    if (p.totalS <= 0) bad.push(`${r.id}: 총 시간 0`);
    for (let i=1;i<p.timeline.length;i++)
      if (p.timeline[i].startS < p.timeline[i-1].startS) bad.push(`${r.id}: 시각 역전`);
    // 마지막 누적 물량이 레시피 총 물량과 맞는지
    const last = [...p.timeline].reverse().find(s=>s.cumulativeG!=null);
    if (last && last.cumulativeG !== r.water.total_g) bad.push(`${r.id}: 최종 누적 ${last.cumulativeG} != ${r.water.total_g}`);
  }
  ok(bad.length===0, bad.join(' / ') || `레시피 ${recipes.length}종 전부 정상`);
}

console.log('\n════ BrewPlan.at — 시점 조회 ════');
{
  const p = BrewPlan.build(R('kasuya-46').steps);
  const cases = [
    [0,   0, 'pouring', '0초: 블룸 붓는 중'],
    [5,   0, 'pouring', '5초: 아직 붓는 중 (pour_s=10)'],
    [20,  0, 'waiting', '20초: 블룸 대기'],
    [45,  1, 'pouring', '45초: 2투 시작'],
    [57,  1, 'waiting', '57초: 2투 대기 (붓기 45~55초)'],
    [180, 4, 'pouring', '180초: 5투'],
    [195, 5, 'waiting', '195초: 드로우다운 (마지막 푸어가 190초에 끝남)']
  ];
  for (const [t,i,phase,label] of cases) {
    const s = BrewPlan.at(p, t);
    ok(s.i===i && s.phase===phase, `${label}  →  i=${s.i} ${s.phase}`);
  }

  eq(BrewPlan.at(p, 42).toNext, 3, '42초 → 다음까지 3초');
  eq(BrewPlan.at(p, 44.5).toNext, 1, '44.5초 → 1초');
  ok(BrewPlan.at(p, 210).done, '210초 → 종료');
  ok(!BrewPlan.at(p, 209).done, '209초 → 아직 진행 중');
  eq(Math.round(BrewPlan.at(p,105).progress*100), 50, '105초 → 진행률 50%');
}

console.log('\n════ 드로우다운 구간 ════');
{
  // start_s 없이 target_end_s만 있는 단계가 화면에 뜨지 않던 문제의 회귀 테스트
  for (const [id, expStart, expEnd] of [['kasuya-46',190,210],['hoffmann-v60',115,210],['wbrc-2025-peng-final',101,180]]) {
    const p = BrewPlan.build(R(id).steps);
    const d = p.timeline[p.timeline.length-1];
    ok(d.startS===expStart && d.endS===expEnd,
       `${id} 드로우다운 ${d.startS}~${d.endS}초 (기대 ${expStart}~${expEnd})`);
    ok(d.endS > d.startS, `${id} 드로우다운이 0초가 아님`);
  }
  const p = BrewPlan.build(R('kasuya-46').steps);
  ok(BrewPlan.at(p,200).step.type==='drawdown', '200초에 드로우다운으로 표시됨');
}

console.log('\n════ 목표 누적 물량 승계 ════');
{
  const p = BrewPlan.build(R('hoffmann-v60').steps);
  const tl = p.timeline;
  // 교반 단계는 물을 붓지 않으므로 직전 누적값(500g)을 물려받아야 합니다
  const agitate = tl.findIndex(s => s.type==='agitate');
  ok(agitate >= 0, '교반 단계 존재');
  eq(BrewPlan.targetAt(p, agitate), 500, '교반 시점 목표 누적 = 500g');
  eq(BrewPlan.targetAt(p, tl.length-1), 500, '드로우다운도 500g 유지');
  eq(BrewPlan.targetAt(p, 0), 60, '블룸은 60g');
}

console.log('\n════ mmss ════');
{
  eq(BrewPlan.mmss(0), '0:00', '0초');
  eq(BrewPlan.mmss(9), '0:09', '9초 — 두 자리 패딩');
  eq(BrewPlan.mmss(65), '1:05', '65초');
  eq(BrewPlan.mmss(210), '3:30', '210초');
  eq(BrewPlan.mmss(null), '—', 'null 방어');
}

console.log('\n════ 빈 레시피 방어 ════');
{
  const p = BrewPlan.build([]);
  eq(p.timeline.length, 0, '빈 타임라인');
  ok(BrewPlan.at(p, 0).done, '즉시 종료 상태');
  eq(BrewPlan.targetAt(p, 0), null, 'targetAt null');
}

console.log(fail?`\n★ 실패 ${fail}/${n}`:`\n전체 통과 ${n}건`);
process.exit(fail?1:0);
