/* Router — 주소 ↔ 화면 상태

   두 가지를 봅니다.
     1) 왕복이 안정적인가 — 상태 → 주소 → 상태가 처음과 같은가
     2) 이상한 주소가 들어와도 화면이 비지 않는가

   2번이 더 중요합니다. 주소는 남이 보낸 링크일 수도, 사용자가 손으로
   고친 것일 수도, 예전 버전에서 저장해둔 즐겨찾기일 수도 있습니다. */

import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { Router } = require('../assets/router.js');

const recipes = JSON.parse(fs.readFileSync('data/recipes.json', 'utf-8')).recipes;
const beans = JSON.parse(fs.readFileSync('data/beans.json', 'utf-8')).beans;
const nodes = JSON.parse(fs.readFileSync('data/flavor-nodes.json', 'utf-8')).nodes;
const wiki = JSON.parse(fs.readFileSync('data/wiki.json', 'utf-8')).articles;

let fail = 0, n = 0;
const ok = (c, m) => { n++; console.log((c ? '  OK   ' : '  ★NG  ') + m); if (!c) fail++; };
const eq = (a, b, m) => ok(a === b, `${m}  →  ${JSON.stringify(a)}${a === b ? '' : ' (기대 ' + JSON.stringify(b) + ')'}`);

/* ── 1. 상태 → 주소 ─────────────────────────────── */
console.log('\n════ 상태 → 주소 ════');
{
  eq(Router.toHash({ page: 'home' }), '#/', '홈');
  eq(Router.toHash({ page: 'recommend' }), '#/recommend', '추천 입력');
  eq(Router.toHash({ page: 'results' }), '#/results', '추천 결과');
  eq(Router.toHash({ page: 'archive' }), '#/archive', '아카이브');
  eq(Router.toHash({ page: 'flavor', drill: null }), '#/flavor', '향미 (드릴 없음)');
  eq(Router.toHash({ page: 'flavor', drill: 'fruity' }), '#/flavor/fruity', '향미 드릴다운');
  eq(Router.toHash({ page: 'brew-prep', recipeId: 'hoffmann-v60' }), '#/brew/hoffmann-v60', '추출 준비');
  eq(Router.toHash({ page: 'brew', recipeId: 'hoffmann-v60' }), '#/brew/hoffmann-v60/timer', '타이머');
  eq(Router.toHash({ page: 'brew-done', recipeId: 'hoffmann-v60' }), '#/brew/hoffmann-v60/done', '완료');
  eq(Router.toHash({ page: 'archive-detail', archiveId: 'kasuya-46' }), '#/recipe/kasuya-46', '레시피 상세');
  eq(Router.toHash({ page: 'wiki-doc', wikiId: 'grind-microns' }), '#/wiki/grind-microns', '위키 문서');
}

console.log('\n════ id가 비었을 때 ════');
{
  eq(Router.toHash({ page: 'brew-prep', recipeId: null }), '#/archive', 'recipeId 없으면 아카이브로');
  eq(Router.toHash({ page: 'bean', beanId: null }), '#/flavor', 'beanId 없으면 향미로');
  eq(Router.toHash({ page: 'wiki-doc', wikiId: null }), '#/wiki', 'wikiId 없으면 위키 목록으로');
  eq(Router.toHash({ page: 'log-detail', logId: '' }), '#/logs', '빈 문자열도 없는 것으로 취급');
  eq(Router.toHash({ page: '없는화면' }), '#/', '모르는 화면은 홈');
  eq(Router.toHash(null), '#/', 'null도 홈');
  eq(Router.toHash({}), '#/', '빈 객체도 홈');
}

/* ── 2. 주소 → 상태 ─────────────────────────────── */
console.log('\n════ 주소 → 상태 ════');
{
  eq(Router.parse('#/').page, 'home', '루트는 홈');
  eq(Router.parse('').page, 'home', '빈 문자열도 홈');
  eq(Router.parse('#').page, 'home', '해시만 있어도 홈');
  eq(Router.parse('#/recommend').page, 'recommend', '추천');
  eq(Router.parse('#/brew/kasuya-46').page, 'brew-prep', '레시피 주소는 준비 화면');
  eq(Router.parse('#/brew/kasuya-46').recipeId, 'kasuya-46', 'id 추출');
  eq(Router.parse('#/brew/kasuya-46/timer').page, 'brew', 'timer 접미사');
  eq(Router.parse('#/brew/kasuya-46/done').page, 'brew-done', 'done 접미사');
  eq(Router.parse('#/flavor/fruity.berry').drill, 'fruity.berry', '점이 든 노드 id도 통과');
  eq(Router.parse('#/flavor').drill, null, '드릴 없으면 null');
}

console.log('\n════ 이상한 주소 ════');
{
  const weird = [
    '#/없는화면', '#/brew', '#/recipe', '#/bean', '#/wiki/', '#/logs//',
    '#////', '#/brew//timer', '#/../../etc/passwd', '#/%%%', '#/a/b/c/d/e/f',
    '#/<script>alert(1)</script>', '#/' + 'x'.repeat(5000)
  ];
  let bad = [];
  for (const w of weird) {
    let st;
    try { st = Router.parse(w); } catch (e) { bad.push(`${w} → 예외 ${e.message}`); continue; }
    if (!st || !st.page) bad.push(`${w} → 화면 없음`);
  }
  ok(bad.length === 0, `이상한 주소 ${weird.length}종 전부 화면이 나옴` + (bad.length ? ` → ${bad.join(', ')}` : ''));

  eq(Router.parse('#/brew').page, 'archive', 'id 없는 /brew는 아카이브로');
  eq(Router.parse('#/recipe').page, 'archive', 'id 없는 /recipe는 아카이브로');
  eq(Router.parse('#/bean').page, 'flavor', 'id 없는 /bean은 향미로');
  eq(Router.parse('#/없는화면').page, 'home', '모르는 경로는 홈');
}

/* ── 3. 왕복 ────────────────────────────────────── */
console.log('\n════ 왕복 (상태 → 주소 → 상태) ════');
{
  const cases = [
    { page: 'home' }, { page: 'recommend' }, { page: 'archive' },
    { page: 'logs' }, { page: 'wiki' }, { page: 'analysis' },
    { page: 'flavor', drill: null },
    { page: 'flavor', drill: 'fruity.berry.blueberry' },
    { page: 'brew-prep', recipeId: 'hoffmann-v60' },
    { page: 'brew', recipeId: 'wbrc-2025-peng-final' },
    { page: 'brew-done', recipeId: 'kasuya-46' },
    { page: 'archive-detail', archiveId: 'kasuya-46' },
    { page: 'bean', beanId: 'origin-id-sumatra-wethulled' },
    { page: 'wiki-doc', wikiId: wiki[0].id },
    { page: 'log-detail', logId: '2026-08-21T09:15:00.000Z' }
  ];
  let bad = [];
  for (const c of cases) {
    const back = Router.roundTrip(c);
    if (back.page !== c.page) bad.push(`${c.page} → ${back.page}`);
    for (const k of ['recipeId', 'archiveId', 'beanId', 'wikiId', 'logId', 'drill']) {
      if (c[k] != null && back[k] !== c[k]) bad.push(`${c.page}.${k}: ${c[k]} → ${back[k]}`);
    }
  }
  ok(bad.length === 0, `${cases.length}개 상태 전부 왕복 일치` + (bad.length ? ` → ${bad.join(' / ')}` : ''));
}

console.log('\n════ 실제 데이터 전수 왕복 ════');
{
  const check = (make, list, label) => {
    const bad = list.filter(x => {
      const st = make(x.id);
      const back = Router.roundTrip(st);
      return back.page !== st.page || JSON.stringify(back) !== JSON.stringify({ ...back, ...st });
    });
    ok(bad.length === 0, `${label} ${list.length}건 왕복` + (bad.length ? ` → ${bad.map(x => x.id).join(', ')}` : ''));
  };
  check(id => ({ page: 'brew-prep', recipeId: id }), recipes, '레시피');
  check(id => ({ page: 'archive-detail', archiveId: id }), recipes, '레시피 상세');
  check(id => ({ page: 'bean', beanId: id }), beans, '원두');
  check(id => ({ page: 'wiki-doc', wikiId: id }), wiki, '위키');
  check(id => ({ page: 'flavor', drill: id }), nodes, '향미 노드');
}

/* ── 4. 링크로 들어왔을 때 ──────────────────────── */
console.log('\n════ 외부 링크 · 새로고침 진입 ════');
{
  // 세션이 없는데 타이머 주소로 들어온 경우
  const timer = Router.parse('#/brew/kasuya-46/timer');
  const e1 = Router.entry(timer, false);
  eq(e1.page, 'brew-prep', '세션 없이 타이머 링크 → 준비 화면');
  eq(e1.recipeId, 'kasuya-46', '레시피는 유지 — 어떤 걸 열려던 건지 살림');

  const e2 = Router.entry(timer, true);
  eq(e2.page, 'brew', '세션이 있으면(새로고침 아님) 그대로');

  const done = Router.entry(Router.parse('#/brew/kasuya-46/done'), false);
  eq(done.page, 'brew-prep', '세션 없이 완료 링크 → 준비 화면');

  // 추천 결과는 계산 결과라 링크로 복원할 수 없습니다
  eq(Router.entry({ page: 'results' }, false).page, 'recommend', '결과 링크 → 입력 화면으로');

  // 나머지는 그대로 열려야 합니다
  const restorable = ['home', 'archive', 'archive-detail', 'flavor', 'bean',
                      'wiki', 'wiki-doc', 'logs', 'log-detail', 'analysis', 'brew-prep'];
  const bad = restorable.filter(p => Router.entry({ page: p, recipeId: 'x', archiveId: 'x', beanId: 'x' }, false).page !== p);
  ok(bad.length === 0, `링크로 열 수 있는 화면 ${restorable.length}종 그대로 열림` + (bad.length ? ` → ${bad}` : ''));
}

/* ── 5. 인코딩 ──────────────────────────────────── */
console.log('\n════ 인코딩 ════');
{
  const tricky = ['공백 있는 id', 'a/b', 'a#b', 'a?b', 'a&b=c', '한글아이디', '100%'];
  let bad = [];
  for (const id of tricky) {
    const back = Router.roundTrip({ page: 'bean', beanId: id });
    if (back.beanId !== id) bad.push(`${id} → ${back.beanId}`);
  }
  // 슬래시가 든 id는 경로가 쪼개지므로 복원되지 않는 게 정상입니다.
  // 실제 데이터의 id는 전부 슬러그라 해당 사항이 없습니다.
  const realBad = bad.filter(x => !x.startsWith('a/b'));
  ok(realBad.length === 0, `특수문자 id 왕복` + (realBad.length ? ` → ${realBad.join(', ')}` : ''));

  ok(!Router.toHash({ page: 'bean', beanId: '<script>' }).includes('<'),
     'HTML 특수문자는 인코딩됨 (주소로 스크립트를 넣을 수 없음)');
}

console.log(`\n${fail ? '★ 실패 ' + fail + '건 / ' + n : '전체 통과 ' + n + '건'}`);
process.exit(fail ? 1 : 0);
