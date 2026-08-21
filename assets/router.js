/* ══════════════════════════════════════════════════════════
   Special Coffee Wiki — 라우터

   왜 필요한가
     라우팅이 없으면 화면 전환이 자바스크립트 변수로만 일어납니다. 그러면
     안드로이드 백버튼이나 iOS 엣지 스와이프가 브라우저를 이전 "사이트"로
     내보냅니다. 추출 2분 30초 지점에서 젖은 손으로 폰을 잡다가 이게 일어나면
     타이머가 통째로 사라집니다. 실사용에서 가장 자주 겪는 사고입니다.

     덤으로 레시피 링크를 남에게 보낼 수 있게 됩니다.

   왜 해시(#)인가 — pushState가 아니라
     이 사이트는 GitHub Pages의 하위 경로(/special-coffee-wiki/)에 있습니다.
     pushState로 /special-coffee-wiki/brew/xxx 같은 주소를 만들면, 그 상태에서
     새로고침했을 때 서버가 그런 파일을 찾다가 404를 냅니다. 정적 호스팅이라
     리라이트 규칙을 넣을 수 없습니다.

     해시는 서버로 전송되지 않습니다. 어떤 주소든 index.html이 뜨고,
     새로고침도 깨지지 않습니다.

   URL에 넣는 것과 넣지 않는 것
     넣는 것   화면 이동 — 어떤 레시피, 어떤 원두, 어떤 향미 계열
     안 넣는 것 필터와 선택 — 아카이브 필터, 향미 다중 선택

     칩 하나 누를 때마다 히스토리가 쌓이면 뒤로가기를 열두 번 눌러야
     이전 화면으로 갑니다. 그건 라우팅이 없는 것보다 나쁩니다.

   이 파일은 DOM을 만지지 않습니다. 순수 변환만 합니다.
   ══════════════════════════════════════════════════════════ */
'use strict';

const Router = {
  /* page → URL 모양.
     seg는 경로 조각, key는 App 상태에서 id를 꺼낼 위치입니다. */
  MAP: [
    { page: 'home',           build: () => '/' },
    { page: 'recommend',      build: () => '/recommend' },
    { page: 'results',        build: () => '/results' },
    { page: 'analysis',       build: () => '/analysis' },
    { page: 'archive',        build: () => '/archive' },
    { page: 'logs',           build: () => '/logs' },
    { page: 'wiki',           build: () => '/wiki' },

    /* needs가 있으면 그 값이 없을 때 fallback 화면의 주소를 냅니다.
       id 없이 /brew/undefined 같은 주소가 만들어지면 그 링크를 받은 사람은
       빈 화면을 보게 됩니다. */
    { page: 'brew-prep',      needs: 'recipeId',  fallback: '/archive',
      build: s => `/brew/${enc(s.recipeId)}` },
    { page: 'brew',           needs: 'recipeId',  fallback: '/archive',
      build: s => `/brew/${enc(s.recipeId)}/timer` },
    { page: 'brew-done',      needs: 'recipeId',  fallback: '/archive',
      build: s => `/brew/${enc(s.recipeId)}/done` },
    { page: 'archive-detail', needs: 'archiveId', fallback: '/archive',
      build: s => `/recipe/${enc(s.archiveId)}` },
    { page: 'bean',           needs: 'beanId',    fallback: '/flavor',
      build: s => `/bean/${enc(s.beanId)}` },
    { page: 'wiki-doc',       needs: 'wikiId',    fallback: '/wiki',
      build: s => `/wiki/${enc(s.wikiId)}` },
    { page: 'log-detail',     needs: 'logId',     fallback: '/logs',
      build: s => `/logs/${enc(s.logId)}` },

    // 향미는 드릴다운이 곧 이동입니다 — 뒤로가기가 "위로"가 되어야 자연스럽습니다
    { page: 'flavor',         build: s => s.drill ? `/flavor/${enc(s.drill)}` : '/flavor' }
  ],

  /** 상태 → 해시 문자열. 모르는 page는 홈으로 떨어뜨립니다. */
  toHash(state) {
    const row = this.MAP.find(r => r.page === state?.page);
    if (!row) return '#/';
    if (row.needs && (state[row.needs] == null || state[row.needs] === '')) {
      return '#' + row.fallback;
    }
    return '#' + row.build(state);
  },

  /**
   * 해시 → 상태. 해석할 수 없으면 홈입니다.
   * 남이 보낸 링크나 사용자가 손으로 고친 주소가 들어올 수 있으므로
   * 어떤 입력에도 화면이 비지 않아야 합니다.
   */
  parse(hash) {
    const raw = String(hash || '').replace(/^#/, '');
    const seg = raw.split('/').filter(Boolean).map(decodeSafe);

    if (!seg.length) return { page: 'home' };

    const [a, b, c] = seg;

    switch (a) {
      case 'recommend': return { page: 'recommend' };
      case 'results':   return { page: 'results' };
      case 'analysis':  return { page: 'analysis' };
      case 'archive':   return { page: 'archive' };

      case 'brew':
        if (!b) return { page: 'archive' };
        if (c === 'timer') return { page: 'brew', recipeId: b };
        if (c === 'done')  return { page: 'brew-done', recipeId: b };
        return { page: 'brew-prep', recipeId: b };

      case 'recipe':
        return b ? { page: 'archive-detail', archiveId: b } : { page: 'archive' };

      case 'bean':
        return b ? { page: 'bean', beanId: b } : { page: 'flavor' };

      case 'flavor':
        return b ? { page: 'flavor', drill: b } : { page: 'flavor', drill: null };

      case 'wiki':
        return b ? { page: 'wiki-doc', wikiId: b } : { page: 'wiki' };

      case 'logs':
        return b ? { page: 'log-detail', logId: b } : { page: 'logs' };

      default:
        return { page: 'home' };
    }
  },

  /** 왕복이 안정적인가 — 테스트와 디버깅용 */
  roundTrip(state) {
    return this.parse(this.toHash(state));
  },

  /* ── 링크로 바로 들어와도 되는 화면인가 ──
     타이머와 완료 화면은 세션이 있어야 의미가 있습니다. 남이 보낸
     #/brew/xxx/timer 링크로 들어오면 존재하지 않는 세션을 그리게 됩니다.
     이런 경우는 준비 화면으로 되돌립니다. */
  RESTORABLE: new Set([
    'home', 'recommend', 'archive', 'archive-detail', 'flavor', 'bean',
    'wiki', 'wiki-doc', 'logs', 'log-detail', 'analysis', 'brew-prep'
  ]),

  /**
   * 새로고침이나 외부 링크로 들어왔을 때 실제로 열어줄 화면.
   * @param st        parse() 결과
   * @param hasSession 추출 세션이 살아 있는가
   */
  entry(st, hasSession = false) {
    if (this.RESTORABLE.has(st.page)) return st;
    if (st.page === 'brew' || st.page === 'brew-done') {
      // 세션이 있으면 그대로, 없으면 같은 레시피의 준비 화면으로
      return hasSession ? st : { page: 'brew-prep', recipeId: st.recipeId };
    }
    // results는 추천을 다시 돌려야 의미가 있어 입력 화면으로 보냅니다
    if (st.page === 'results') return { page: 'recommend' };
    return { page: 'home' };
  }
};

function enc(v) { return encodeURIComponent(v == null ? '' : String(v)); }
function decodeSafe(v) { try { return decodeURIComponent(v); } catch (e) { return v; } }

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Router };
}
