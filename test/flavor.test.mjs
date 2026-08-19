import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { FlavorTree, Wheel } = require('../assets/flavor.js');

const nodes = JSON.parse(fs.readFileSync('data/flavor-nodes.json','utf-8')).nodes;
const beans = JSON.parse(fs.readFileSync('data/beans.json','utf-8')).beans;

let fail=0,n=0;
const ok=(c,m)=>{n++;console.log((c?'  OK   ':'  ★NG  ')+m);if(!c)fail++};
const eq=(a,b,m)=>ok(JSON.stringify(a)===JSON.stringify(b),`${m}  →  ${JSON.stringify(a)}${JSON.stringify(a)===JSON.stringify(b)?'':' (기대 '+JSON.stringify(b)+')'}`);

console.log('\n════ 계층 조회 ════');
{
  eq(FlavorTree.roots(nodes).length, 9, '대분류 9개');
  eq(FlavorTree.children(nodes,'fruity').length, 4, 'fruity 하위 4개');
  eq(FlavorTree.children(nodes,'fruity.berry').length, 4, 'berry 하위 4개');
  eq(FlavorTree.family('fruity.berry.blueberry'), 'fruity', 'family 추출');
  eq(FlavorTree.path(nodes,'fruity.berry.blueberry').map(x=>x.id),
     ['fruity','fruity.berry','fruity.berry.blueberry'], '루트까지 경로');
  ok(FlavorTree.isDescendant('fruity.berry.blueberry','fruity'), '자손 판정');
  ok(FlavorTree.isDescendant('fruity','fruity'), '자기 자신도 포함');
  ok(!FlavorTree.isDescendant('floral.floral.jasmine','fruity'), '다른 계열은 아님');
  // 접두사 함정: 'sweet'가 'sweet_x'를 잡으면 안 됨
  ok(!FlavorTree.isDescendant('sweetened','sweet'), '접두사만 같은 id는 자손이 아님');
  eq(FlavorTree.byId(nodes,'없는id'), null, '없는 id는 null');
}

console.log('\n════ 원두 매칭 — 계층 반영 ════');
{
  // 상위를 골랐는데 하위 태그 원두가 안 걸리면 데이터가 없다고 오해합니다
  const fruity = FlavorTree.matchBeans(beans, ['fruity'], 'or');
  ok(fruity.length > 0, `대분류 'fruity' 선택 → ${fruity.length}종`);
  ok(fruity.some(b=>b.id==='origin-et-guji-natural'), '블루베리 태그 원두가 fruity로 걸림');

  const blueberry = FlavorTree.matchBeans(beans, ['fruity.berry.blueberry'], 'or');
  ok(blueberry.length < fruity.length, `소분류는 더 좁음 (${blueberry.length} < ${fruity.length})`);
  eq(blueberry.map(b=>b.id), ['origin-et-guji-natural'], '블루베리는 구지 내추럴만');

  const or = FlavorTree.matchBeans(beans, ['floral','spices'], 'or');
  const and = FlavorTree.matchBeans(beans, ['floral','spices'], 'and');
  ok(or.length > and.length, `OR ${or.length}종 > AND ${and.length}종`);
  ok(and.every(b=>{
    const f=(b.flavor_nodes||[]).map(x=>FlavorTree.family(x));
    return f.includes('floral') && f.includes('spices');
  }), 'AND 결과는 두 계열 모두 보유');

  eq(FlavorTree.matchBeans(beans, [], 'or').length, beans.length, '선택 없으면 전체');
  eq(FlavorTree.matchBeans(beans, ['other.chemical'], 'or').length, 0, '해당 없으면 0종');
}

console.log('\n════ 매칭 근거 ════');
{
  const guji = beans.find(b=>b.id==='origin-et-guji-natural');
  const hit = FlavorTree.matchedNodes(guji, ['fruity']);
  ok(hit.length >= 2, `구지가 fruity로 걸린 노드 ${hit.length}개: ${hit.join(', ')}`);
  ok(hit.every(x=>x.startsWith('fruity')), '근거 노드는 전부 fruity 계열');
  eq(FlavorTree.matchedNodes(guji, ['green_vegetative']), [], '안 걸리면 빈 배열');
}

console.log('\n════ 계열별 원두 수 ════');
{
  const c = FlavorTree.countByFamily(beans, nodes);
  eq(Object.keys(c).length, 9, '9개 계열 전부 키 존재');
  ok(Object.values(c).every(v=>v>=0), '음수 없음');
  ok(c.fruity > 0 && c.nutty_cocoa > 0, `fruity ${c.fruity}종 · nutty_cocoa ${c.nutty_cocoa}종`);
  // 원두 하나가 같은 계열 노드를 여러 개 가져도 1로 세야 합니다
  const one = FlavorTree.countByFamily([beans.find(b=>b.id==='origin-ke-kirinyaga-washed')], nodes);
  ok(one.fruity === 1, `한 원두의 같은 계열 중복은 1로 계산 (${one.fruity})`);
  console.log('   계열별:', Object.entries(c).map(([k,v])=>`${k} ${v}`).join(' · '));
}

console.log('\n════ 휠 좌표 ════');
{
  const s = Wheel.sectors(9);
  eq(s.length, 9, '섹터 9개');
  ok(s.every(x=>/^M[\d.\- ]+L[\d.\- ]+A/.test(x.d)), 'path 형식');
  ok(s.every(x=>!x.d.includes('NaN')), 'NaN 없음');

  // 첫 섹터는 12시에서 '시작'합니다. 9등분이므로 중심각은 12시에서 20° 돌아간 지점입니다.
  const first = s[0];
  ok(first.labelY < 130 && first.labelX > 130,
     `첫 섹터 라벨이 우상단 (${first.labelX}, ${first.labelY})`);
  ok(s[s.length-1].labelX < 130 && s[s.length-1].labelY < 130,
     `마지막 섹터는 좌상단 — 12시를 사이에 두고 만남 (${s[8].labelX}, ${s[8].labelY})`);

  // 라벨이 중심에서 r0~r1 사이에 놓이는지
  ok(s.every(x=>{
    const d = Math.hypot(x.labelX-130, x.labelY-130);
    return d > 42 && d < 118;
  }), '라벨이 링 안쪽에 위치');

  // 섹터가 겹치지 않고 한 바퀴를 채우는지
  const angles = s.map(x=>x.midAngle).sort((a,b)=>a-b);
  ok(angles.every((a,i,arr)=> i===0 || (arr[i]-arr[i-1]) > 0.5), '섹터 각이 고르게 분포');

  // 아래쪽 라벨은 뒤집어야 거꾸로 안 읽힙니다. 경계(정확히 90°)도 포함해야 합니다.
  eq(Wheel.labelRotation(Math.PI/2), 270, '6시 방향(90°) 경계값도 뒤집힘');
  eq(Wheel.labelRotation(0), 0, '오른쪽 라벨은 회전 없음');
  eq(Wheel.labelRotation(Math.PI), 360, '9시 방향도 뒤집힘');
  ok(Wheel.labelRotation(-Math.PI/2) === -90, '12시 방향은 그대로');

  // large-arc는 섹터가 180°를 넘을 때만 필요합니다.
  // 2등분은 각 섹터가 정확히 180°에 못 미치므로 플래그가 0이어야 맞습니다.
  ok(Wheel.sectors(2).every(x=>!x.d.includes(' 1 1 ')), '반원 섹터는 large-arc 불필요');
  ok(Wheel.sectors(1).some(x=>x.d.includes(' 1 1 ')), '한 섹터가 원 전체면 large-arc 사용');

  const custom = Wheel.sectors(9, {cx:100, cy:100, r0:30, r1:90});
  ok(custom.every(x=>Math.hypot(x.labelX-100, x.labelY-100) > 30), '커스텀 반지름 반영');
}

console.log('\n════ 데이터 정합성 ════');
{
  const ids = new Set(nodes.map(n=>n.id));
  const bad=[];
  for (const b of beans) for (const f of b.flavor_nodes||[])
    if (!ids.has(f)) bad.push(`${b.id}: ${f}`);
  ok(bad.length===0, bad.join(' / ') || `원두 ${beans.length}종의 향미 노드 전부 유효`);

  const orphan = beans.filter(b=>!(b.flavor_nodes||[]).length);
  ok(orphan.length===0, orphan.map(b=>b.id).join(' / ') || '향미 태그 없는 원두 없음');
}

console.log(fail?`\n★ 실패 ${fail}/${n}`:`\n전체 통과 ${n}건`);
process.exit(fail?1:0);
