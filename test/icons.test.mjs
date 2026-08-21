import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { BrewerIcon } = require('../assets/icons.js');

const brewers = JSON.parse(fs.readFileSync('data/brewers.json','utf-8')).brewers;
let fail=0,n=0;
const ok=(c,m)=>{n++;console.log((c?'  OK   ':'  ★NG  ')+m);if(!c)fail++};
const eq=(a,b,m)=>ok(a===b,`${m}  →  ${JSON.stringify(a)}${a===b?'':' (기대 '+JSON.stringify(b)+')'}`);

console.log('\n════ 모든 드리퍼가 형태를 가지는가 ════');
{
  const bad = brewers.filter(b => !BrewerIcon.SHAPES[BrewerIcon.shapeOf(b)]);
  ok(bad.length===0, bad.map(b=>b.id).join(' / ') || `드리퍼 ${brewers.length}종 전부 형태 있음`);

  const noIcon = brewers.filter(b => !b.icon);
  ok(noIcon.length===0, noIcon.map(b=>b.id).join(' / ') || '전부 icon 필드 보유');
}

console.log('\n════ icon 없이도 구조에서 추정되는가 ════');
{
  // 카탈로그에 icon을 빠뜨려도 화면이 비지 않아야 합니다
  eq(BrewerIcon.shapeOf({geometry:'pressure_immersion'}), 'press', '가압 → press');
  eq(BrewerIcon.shapeOf({geometry:'immersion'}), 'valve', '침지 → valve');
  eq(BrewerIcon.shapeOf({geometry:'hybrid_immersion'}), 'valve', '침지 겸용 → valve');
  eq(BrewerIcon.shapeOf({geometry:'flat', hole:{count:3}}), 'flat3', '평바닥 3구');
  eq(BrewerIcon.shapeOf({geometry:'flat', hole:{count:1}}), 'flat1', '평바닥 1구');
  eq(BrewerIcon.shapeOf({geometry:'cone', hole:{diameter_mm:21}}), 'cone', '원뿔 큰 구멍');
  eq(BrewerIcon.shapeOf({geometry:'cone', hole:{diameter_mm:4}}), 'cone_small', '원뿔 작은 구멍');
  eq(BrewerIcon.shapeOf(null), 'cone', 'null 방어');
  eq(BrewerIcon.shapeOf({}), 'cone', '빈 객체 방어');

  // 실제 카탈로그로 폴백을 검증 — icon을 지워도 같은 계열이 나와야
  const melitta = {...brewers.find(b=>b.id==='melitta-1x2')}; delete melitta.icon;
  eq(BrewerIcon.shapeOf(melitta), 'cone_small', '멜리타는 icon 없이도 작은 구멍 원뿔');
  const kalita = {...brewers.find(b=>b.id==='kalita-wave-185-steel')}; delete kalita.icon;
  eq(BrewerIcon.shapeOf(kalita), 'flat3', '칼리타는 icon 없이도 평바닥 3구');
}

console.log('\n════ SVG 출력 ════');
{
  for (const b of brewers) {
    const svg = BrewerIcon.svg(b, 38, 'x');
    if (!svg.startsWith('<svg') || !svg.includes('</svg>') || svg.includes('undefined') || svg.includes('NaN')) {
      ok(false, `${b.id} SVG 이상`); break;
    }
  }
  ok(true, `드리퍼 ${brewers.length}종 SVG 생성 정상`);

  const svg = BrewerIcon.svg(brewers[0], 38, 'Hario V60');
  ok(svg.includes('stroke="currentColor"'), 'currentColor 사용 — 다크 모드 자동 대응');
  ok(svg.includes('fill="none"'), 'fill 없음 — 선화');
  ok(svg.includes('viewBox="0 0 40 40"'), 'viewBox 고정');
  ok(svg.includes('role="img"') && svg.includes('aria-label="Hario V60"'), '접근성 라벨');
  ok(svg.includes('width="38"'), '크기 인자 반영');
  ok(svg.includes('focusable="false"'), 'IE/Edge 포커스 트랩 방지');
}

console.log('\n════ path 좌표 유효성 ════');
{
  let bad = [];
  for (const [key, paths] of Object.entries(BrewerIcon.SHAPES)) {
    if (!paths.length) { bad.push(`${key}: 빈 배열`); continue; }
    for (const d of paths) {
      if (!/^M[\d.\-]/.test(d)) bad.push(`${key}: M으로 시작하지 않음 — ${d}`);
      if (/NaN|undefined/.test(d)) bad.push(`${key}: 잘못된 값 — ${d}`);
      // 좌표가 viewBox(0~40)를 크게 벗어나면 잘립니다
      const nums = (d.match(/-?\d+\.?\d*/g) || []).map(Number);
      if (nums.some(v => v < -2 || v > 42)) bad.push(`${key}: 좌표 범위 이탈 — ${d}`);
    }
  }
  ok(bad.length===0, bad.join(' / ') || `형태 ${Object.keys(BrewerIcon.SHAPES).length}종의 path 전부 유효`);
}

console.log('\n════ 형태가 실제로 구분되는가 ════');
{
  // 서로 다른 형태가 같은 path를 쓰면 아이콘의 의미가 없습니다
  const sigs = Object.entries(BrewerIcon.SHAPES).map(([k,v]) => [k, v.join('|')]);
  const dup = sigs.filter(([k,s],i) => sigs.findIndex(([,s2]) => s2===s) !== i);
  ok(dup.length===0, dup.map(([k])=>k).join(' / ') || `형태 ${sigs.length}종이 모두 다름`);

  // 카탈로그에서 실제로 쓰이는 형태 수
  const used = new Set(brewers.map(b => BrewerIcon.shapeOf(b)));
  ok(used.size >= 6, `카탈로그가 형태 ${used.size}종을 사용: ${[...used].join(', ')}`);
}

console.log(fail?`\n★ 실패 ${fail}/${n}`:`\n전체 통과 ${n}건`);
process.exit(fail?1:0);
