/* ══════════════════════════════════════════════════════════
   Special Coffee Wiki — UI 레이어

   Phase 1a  데이터 로딩 · 온보딩 · 다국어
   Phase 1b  추천 입력 · 추천 결과
   Phase 1c  추출 가이드
   Phase 1d  테이스팅 입력 · 브루잉 로그

   순수 로직은 별도 파일에 있습니다 — 이 파일은 화면과 이벤트만 다룹니다.
     engine.js  Grind · Score · Convert · Engine
     brew.js    BrewPlan · Alerts · WakeLock · BrewSession
     logs.js    LogEntry · LogStore
   ══════════════════════════════════════════════════════════ */
'use strict';

/* ────────────────────────────────────────────
   Store — localStorage 래퍼
   설정과 로그는 이 브라우저에만 저장됩니다(로그인 없음).
   ──────────────────────────────────────────── */
const Store = {
  KEY: 'scw.settings',
  VERSION: 2,

  defaults() {
    return {
      version: this.VERSION,
      lang: null,          // null이면 navigator.language로 감지
      theme: 'auto',
      brewer_id: null,
      grinder_id: null,
      grinder_custom_name: null,
      grind_anchor: null,  // 사용자가 조정한 기준 세팅 (밴드 0)
      water_preset: 'filtered',
      onboarded: false,
      // Phase 1b — 마지막 추천 입력을 기억해 매번 다시 채우지 않게 합니다
      rec: {
        roast_level: null,
        process: null,
        flavor_families: [],
        days_off_roast: null,
        goals: [],
        max_difficulty: 3
      }
    };
  },

  load() {
    try {
      const raw = localStorage.getItem(this.KEY);
      if (!raw) return this.defaults();
      const saved = JSON.parse(raw);
      if (saved.version !== this.VERSION) return this.migrate(saved);
      const d = this.defaults();
      return Object.assign(d, saved, { rec: Object.assign(d.rec, saved.rec || {}) });
    } catch (e) {
      console.warn('설정을 읽지 못해 기본값으로 시작합니다.', e);
      return this.defaults();
    }
  },

  /** v1 → v2: 장비 설정은 살리고 추천 입력만 새로 추가합니다. */
  migrate(old) {
    const d = this.defaults();
    if (old && old.version === 1) {
      const keep = ['lang', 'theme', 'brewer_id', 'grinder_id',
                    'grinder_custom_name', 'grind_anchor', 'water_preset', 'onboarded'];
      for (const k of keep) if (old[k] !== undefined) d[k] = old[k];
      console.info('설정 v1 → v2 이관 완료. 장비 설정은 유지됩니다.');
      return d;
    }
    console.info('알 수 없는 설정 버전이라 기본값으로 초기화합니다.', old && old.version);
    return d;
  },

  save(settings) {
    try { localStorage.setItem(this.KEY, JSON.stringify(settings)); return true; }
    catch (e) { console.error('설정 저장 실패', e); return false; }   // 사파리 프라이빗 모드 등
  },

  clear() { try { localStorage.removeItem(this.KEY); } catch (e) { /* noop */ } }
};

/* ────────────────────────────────────────────
   I18n
   - 문장을 조각내어 잇지 않습니다. {var} 치환만 씁니다.
   - 누락 키는 키 이름 그대로 노출해 발견이 늦지 않게 합니다.
   ──────────────────────────────────────────── */
const I18n = {
  lang: 'ko', dict: {}, terms: {},

  detect() { return (navigator.language || '').toLowerCase().startsWith('ko') ? 'ko' : 'en'; },
  setLang(lang) { this.lang = lang; document.documentElement.lang = lang; },

  t(key, vars) {
    let s = this.dict[key];
    if (s === undefined) { console.warn('i18n 누락 키:', key); return key; }
    if (vars) for (const k in vars) s = s.split('{' + k + '}').join(vars[k]);
    return s;
  },

  term(type, code) {
    const g = this.terms[type];
    if (!g || !g[code]) return code == null ? '' : String(code);
    return g[code][this.lang] ?? g[code].en ?? code;
  },

  /** {ko, en, source_lang} 서술형 필드 → 폴백 여부와 함께 반환 */
  prose(field) {
    if (!field) return null;
    const mine = field[this.lang];
    if (mine) return { text: mine, isFallback: false };
    const other = this.lang === 'ko' ? field.en : field.ko;
    if (!other) return null;
    return { text: other, isFallback: true };
  }
};
const t = (k, v) => I18n.t(k, v);
const term = (ty, c) => I18n.term(ty, c);

/* ────────────────────────────────────────────
   Data
   ──────────────────────────────────────────── */
const Data = {
  brewers: [], grinders: [], flavorNodes: [], recipes: [], beans: [], wiki: [],
  byId: { brewer: {}, grinder: {}, flavor: {}, recipe: {}, bean: {} },

  async loadAll(lang) {
    /* cache 옵션을 주지 않습니다.
       예전에는 'no-cache'로 매번 서버에 되물었는데, 서비스 워커가 캐시를
       관리하게 된 지금은 그게 방해만 됩니다. 갱신은 서비스 워커가
       응답을 준 뒤 뒤에서 조용히 처리합니다. */
    const get = async (path) => {
      const res = await fetch(path);
      if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
      return res.json();
    };
    const [brewers, grinders, flavor, recipes, beans, terms, dict, wiki] = await Promise.all([
      get('data/brewers.json'), get('data/grinders.json'),
      get('data/flavor-nodes.json'), get('data/recipes.json'), get('data/beans.json'),
      get('data/i18n/terms.json'), get(`data/i18n/${lang}.json`), get('data/wiki.json')
    ]);

    this.brewers = brewers.brewers;
    this.grinders = grinders.grinders;
    this.flavorNodes = flavor.nodes;
    this.recipes = recipes.recipes;
    this.beans = beans.beans;
    this.wiki = wiki.articles;
    I18n.terms = terms;
    I18n.dict = dict;

    const index = (arr, key) => arr.reduce((m, x) => (m[x.id] = x, m), this.byId[key]);
    index(this.brewers, 'brewer'); index(this.grinders, 'grinder');
    index(this.flavorNodes, 'flavor'); index(this.recipes, 'recipe'); index(this.beans, 'bean');
  },

  async loadDict(lang) {
    const res = await fetch(`data/i18n/${lang}.json`);
    if (!res.ok) throw new Error(`i18n/${lang}.json → HTTP ${res.status}`);
    I18n.dict = await res.json();
  },

  brewerName(b) {
    if (!b) return '—';
    if (b.aka) return `${b.name_base} (${b.aka[I18n.lang] || b.aka.en})`;
    if (b.show_material) return `${b.name_base} (${term('material', b.material)})`;
    return b.name_base;
  },

  recipeTitle(r) {
    const ti = r.title;
    return (ti && (ti[I18n.lang] || ti.en || ti.ko)) || r.id;
  },

  /** 플레이버 대분류 9개 — 추천 입력의 향미 칩으로 씁니다 */
  families() { return this.flavorNodes.filter(n => n.level === 1); },

  popularBrewers(min = 4) { return this.brewers.filter(b => (b.popularity_kr ?? 0) >= min); },
  popularGrinders(min = 4) {
    return this.grinders.filter(g => (g.popularity_kr ?? 0) >= min && g.id !== 'custom');
  }
};

/* ────────────────────────────────────────────
   App
   ──────────────────────────────────────────── */
const App = {
  settings: null,
  page: 'home',   // home | recommend | results | brew-prep | brew | brew-done
                  // | logs | log-detail | archive | archive-detail | flavor | bean
  onboardStep: 1,
  showAllBrewers: false,
  showAllGrinders: false,
  results: null,

  // Phase 1c — 추출 세션
  brew: { result: null, plan: null, session: null, sound: true, wake: false, wakeFailed: false },

  // Phase 4 — 분석 / 위키
  analysis: { recipeId: null },
  wikiId: null,

  // Phase 3 — 플레이버 탐색
  flavor: { drill: null, selected: [], mode: 'or', openBean: null },

  // Phase 2 — 아카이브
  archive: { type: 'all', geometry: null, roast: null, difficulty: null, openId: null },

  // Phase 1d — 테이스팅 입력 / 로그
  tasting: { overall: null, flavor_nodes: [], next_action: '', tds_pct: null, beverage_g: null },
  logs: [],
  logDetailId: null,
  toast: null,

  async init() {
    this.settings = Store.load();
    I18n.setLang(this.settings.lang || I18n.detect());
    this.applyTheme();

    /* 이벤트 위임은 #root에 딱 한 번만 겁니다.
       render()가 innerHTML만 갈아끼우고 #root 자체는 그대로라서,
       렌더할 때마다 bind하면 리스너가 쌓입니다.
       그러면 탭 한 번에 핸들러가 여러 번 돌고, 토글은 짝수 번 실행돼
       아무 일도 안 일어난 것처럼 보입니다. */
    this.bind(document.getElementById('root'));
    try { await Data.loadAll(I18n.lang); }
    catch (err) { this.renderError(err); return; }
    this.logs = LogStore.all();

    /* 라우팅.
       리스너는 bind()와 마찬가지로 딱 한 번만 겁니다.

       주소를 먼저 읽고 화면을 정합니다 — 남이 보낸 레시피 링크나
       새로고침으로 들어온 경우 그 화면이 나와야 합니다. */
    window.addEventListener('hashchange', () => this.onHashChange());

    /* 탭 닫기와 새로고침도 막습니다. 뒤로가기만 막으면 반쪽입니다 —
       주소창을 잘못 건드리거나 당겨서 새로고침되는 일이 더 흔합니다.

       브라우저는 여기서 준 문구를 무시하고 자체 문구를 띄웁니다.
       preventDefault만 하면 됩니다. */
    window.addEventListener('beforeunload', (e) => {
      if (this.page === 'brew' && this.brew.session && !this.brew.session.finished) {
        e.preventDefault();
        e.returnValue = '';       // 구형 브라우저용
        return '';
      }
    });

    if (this.settings.onboarded && location.hash) {
      this.applyRoute(Router.parse(location.hash));
    } else {
      this.syncHash();
      this.render();
    }

    /* 서비스 워커는 화면을 다 그린 뒤에 등록합니다.
       첫 화면이 뜨는 걸 늦출 이유가 없습니다. */
    SW.onUpdate = () => this.paintUpdateBar();
    const bar = document.getElementById('updateBar');
    if (bar) bar.addEventListener('click', (e) => {
      if (e.target.closest('[data-act="update-apply"]')) SW.apply();
    });
    SW.register();
  },

  /* 새 버전 알림.
     추출 중에는 띄우지 않습니다 — 3분짜리 타이머 옆에 "새로고침" 버튼을
     두면 누르는 순간 기록이 날아갑니다. 끝나고 나면 자연히 보입니다. */
  paintUpdateBar() {
    const bar = document.getElementById('updateBar');
    if (!bar) return;
    const brewing = this.page === 'brew' && this.brew.session && !this.brew.session.finished;
    if (!SW.waiting || brewing) { bar.hidden = true; bar.innerHTML = ''; return; }
    bar.hidden = false;
    bar.innerHTML = `
      <div class="updatebar" role="status">
        <span>${esc(t('update.ready'))}</span>
        <button data-act="update-apply">${esc(t('update.apply'))}</button>
      </div>`;
  },

  applyTheme() {
    const th = this.settings.theme;
    if (th === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', th);
  },

  patch(changes) { Object.assign(this.settings, changes); Store.save(this.settings); },
  patchRec(changes) { Object.assign(this.settings.rec, changes); Store.save(this.settings); },

  async setLang(lang) {
    if (lang === I18n.lang) return;
    I18n.setLang(lang);
    this.patch({ lang });
    await Data.loadDict(lang);
    if (this.page === 'results') this.runRecommend();   // 근거 문구를 새 언어로 다시 생성
    this.render();
    // 타이머 진행 중이면 render()가 화면을 다시 그렸으므로 즉시 현재 상태를 반영
    if (this.page === 'brew' && this.brew.session) this.paintBrew(this.brew.session.state());
  },

  /** 지금 어떤 화면인지 — 같은 화면 안에서의 재렌더인지 판별하는 데 씁니다 */
  pageKey() {
    return this.settings.onboarded ? this.page : `onboard-${this.onboardStep}`;
  },

  render() {
    // IME 조합 중에 innerHTML을 갈아끼우면 한글이 깨집니다. 조합이 끝난 뒤로 미룹니다.
    if (this._composing) { this._renderPending = true; return; }

    const root = document.getElementById('root');
    const key = this.pageKey();
    const samePage = this._lastKey === key;

    /* 같은 화면 안에서의 재렌더면 스크롤 위치를 지킵니다.
       칩 하나 눌렀다고 목록 맨 위로 튕기면 누른 항목이 화면 밖으로 사라져
       "안 눌렸다"고 느끼게 됩니다. */
    const oldScroller = root.querySelector('.scroll');
    const keepScroll = samePage && oldScroller ? oldScroller.scrollTop : 0;

    // 입력 중이던 필드로 포커스를 되돌립니다 (커서 위치까지)
    const a = document.activeElement;
    const focusAct = samePage && a && a.dataset ? (a.dataset.act || null) : null;
    let selStart = null, selEnd = null;
    if (focusAct) {
      try { selStart = a.selectionStart; selEnd = a.selectionEnd; } catch (e) { /* number 입력 등 */ }
    }

    if (!this.settings.onboarded)        root.innerHTML = this.viewOnboard();
    else if (this.page === 'recommend')  root.innerHTML = this.viewRecInput();
    else if (this.page === 'results')    root.innerHTML = this.viewRecResults();
    else if (this.page === 'brew-prep')  root.innerHTML = this.viewBrewPrep();
    else if (this.page === 'brew')       root.innerHTML = this.viewBrew();
    else if (this.page === 'brew-done')  root.innerHTML = this.viewBrewDone();
    else if (this.page === 'analysis')   root.innerHTML = this.viewAnalysis();
    else if (this.page === 'wiki')       root.innerHTML = this.viewWiki();
    else if (this.page === 'wiki-doc')   root.innerHTML = this.viewWikiDoc();
    else if (this.page === 'flavor')     root.innerHTML = this.viewFlavor();
    else if (this.page === 'bean')       root.innerHTML = this.viewBeanDetail();
    else if (this.page === 'archive')    root.innerHTML = this.viewArchive();
    else if (this.page === 'archive-detail') root.innerHTML = this.viewArchiveDetail();
    else if (this.page === 'logs')       root.innerHTML = this.viewLogs();
    else if (this.page === 'log-detail') root.innerHTML = this.viewLogDetail();
    else                                 root.innerHTML = this.viewHome();

    this._lastKey = key;

    const scroller = root.querySelector('.scroll');
    if (scroller) scroller.scrollTop = keepScroll;

    if (focusAct) {
      const el = root.querySelector(`[data-act="${focusAct}"]`);
      if (el && typeof el.focus === 'function') {
        el.focus({ preventScroll: true });
        if (selStart != null && el.setSelectionRange) {
          try { el.setSelectionRange(selStart, selEnd); } catch (e) { /* noop */ }
        }
      }
    }

    if (this.page === 'brew' && this.brew.session) this.paintBrew(this.brew.session.state());

    // 추출이 끝나 화면이 바뀌면 미뤄뒀던 업데이트 알림이 여기서 나타납니다
    if (SW.waiting) this.paintUpdateBar();
  },

  /* ══════════ 라우팅 ══════════

     화면 이동을 주소창에 반영합니다. 그래야 안드로이드 백버튼과 iOS 엣지
     스와이프가 "앱 안에서 뒤로"가 됩니다. 이게 없으면 추출 도중 실수로
     뒤로가기를 눌렀을 때 브라우저가 이전 사이트로 나가버립니다.

     주의: 해시를 바꾸면 hashchange가 뜹니다. go()로 스스로 바꾼 것까지
     되받아 처리하면 화면을 두 번 그리게 되므로 걸러내야 합니다.

     걸러낼 때 불린 플래그를 쓰면 안 됩니다. 해시 변경이 이벤트를 쏘지 않는
     경우(같은 값으로 replace 등)에 플래그가 켜진 채 남아, **다음번 진짜
     뒤로가기를 삼켜버립니다.** 그래서 "내가 방금 만든 주소" 자체를 기억하고
     그 값이 왔을 때만 무시합니다. 값이 안 맞으면 사용자의 이동이니 처리합니다. */

  /** 내가 만든 이동임을 표시. 이벤트가 안 올 수도 있어 표식을 오래 남기지 않습니다. */
  _markSelfNav(hash) {
    this._selfNav = hash;
    if (typeof setTimeout !== 'undefined') {
      setTimeout(() => { if (this._selfNav === hash) this._selfNav = null; }, 0);
    }
  },

  /** URL에 담을 현재 상태 */
  routeState() {
    return {
      page: this.page,
      recipeId: this.brew.result?.recipe?.id ?? null,
      archiveId: this.archive.openId,
      beanId: this.flavor.openBean,
      wikiId: this.wikiId,
      logId: this.logDetailId,
      drill: this.flavor.drill
    };
  },

  /** 주소를 실제로 바꿉니다. push면 히스토리가 쌓이고, replace면 덮어씁니다. */
  _setHash(want, replace) {
    if (typeof location === 'undefined' || location.hash === want) return;
    this._markSelfNav(want);
    if (replace && location.replace) {
      location.replace(`${location.pathname}${location.search}${want}`);
    } else {
      location.hash = want;
    }
  },

  /** 상태가 바뀐 뒤 주소만 맞춥니다 (히스토리는 쌓지 않음) */
  syncHash() {
    this._setHash(Router.toHash(this.routeState()), true);
  },

  go(page, opts = {}) {
    this.page = page;
    // replace=true면 뒤로 갔을 때 되돌아오면 안 되는 화면입니다 (완료 화면 등)
    this._setHash(Router.toHash(this.routeState()), !!opts.replace);
    this.render();
  },

  /** 주소가 바뀌었을 때 (뒤로가기 · 앞으로가기 · 붙여넣은 링크) */
  onHashChange() {
    if (this._selfNav === location.hash) { this._selfNav = null; return; }

    /* 추출이 도는 중이면 함부로 나가지 않습니다.
       hashchange는 주소가 이미 바뀐 뒤에 옵니다. 그래서 "막는다"는 건
       사용자가 취소했을 때 주소를 되돌려놓는다는 뜻입니다. */
    if (this.page === 'brew' && this.brew.session && !this.brew.session.finished) {
      if (!confirm(t('brew.exitConfirm'))) {
        // 취소 — 주소를 타이머 화면으로 되돌립니다.
        // 히스토리를 하나 더 쌓아서라도 사용자를 여기 붙잡아 둡니다.
        this._setHash(Router.toHash(this.routeState()), false);
        return;
      }
      this.brew.session.stop();
      this.brew.session = null;
      WakeLock.release();
    }

    this.applyRoute(Router.parse(location.hash));
  },

  /** 파싱된 주소를 화면 상태로 옮깁니다 */
  applyRoute(st) {
    const target = Router.entry(st, !!this.brew.session);

    switch (target.page) {
      case 'brew-prep':
      case 'brew':
      case 'brew-done':
        // 다른 레시피 주소면 그 레시피를 열어야 합니다
        if (target.recipeId && this.brew.result?.recipe?.id !== target.recipeId) {
          if (!this.openBrew(target.recipeId, { silent: true })) {
            this.page = 'archive'; this.syncHash(); this.render(); return;
          }
        }
        break;
      case 'archive-detail': this.archive.openId = target.archiveId; break;
      case 'bean':           this.flavor.openBean = target.beanId; break;
      case 'wiki-doc':       this.wikiId = target.wikiId; break;
      case 'log-detail':     this.logDetailId = target.logId; break;
      case 'flavor':         this.flavor.drill = target.drill ?? null; break;
    }

    this.page = target.page;
    // 되돌려진 화면과 주소가 어긋나면(예: timer → prep) 주소를 맞춥니다
    this.syncHash();
    this.render();
  },

  /* ── 추천 컨텍스트 ── */
  ctx() {
    const rec = this.settings.rec;
    return {
      brewer: Data.byId.brewer[this.settings.brewer_id],
      brewerOf: (id) => Data.byId.brewer[id],
      grinder: Data.byId.grinder[this.settings.grinder_id],
      anchor: this.settings.grind_anchor,
      waterPreset: this.settings.water_preset,
      bean: {
        roast_level: rec.roast_level,
        process: rec.process,
        flavor_families: rec.flavor_families,
        days_off_roast: rec.days_off_roast
      },
      goals: rec.goals,
      maxDifficulty: rec.max_difficulty
    };
  },

  runRecommend() {
    const c = this.ctx();
    this.results = Engine.recommend(Data.recipes, c).map(r => ({ ...r, why: Engine.reasons(r, c) }));
  },

  /* ══════════ 오류 ══════════ */
  renderError(err) {
    const isFile = location.protocol === 'file:';
    document.getElementById('root').innerHTML = `
      <div class="center">
        <div class="title">${esc(t('error.dataFailed'))}</div>
        ${isFile ? `
          <p class="dim">${esc(t('error.fileProtocol'))}</p>
          <p class="dim">${esc(t('error.howToRun'))}</p>
          <pre class="code">python -m http.server 8000
npx serve .</pre>` : `<p class="dim">${esc(String(err?.message || err))}</p>`}
        <button class="btn btn--secondary" data-act="reload">${esc(t('error.retry'))}</button>
      </div>`;
  },

  /* ══════════ 온보딩 ══════════ */
  viewOnboard() {
    const step = this.onboardStep;
    const body = step === 1 ? this.stepBrewer() : step === 2 ? this.stepGrinder()
               : step === 3 ? this.stepAnchor() : this.stepDone();
    const canNext = step === 1 ? !!this.settings.brewer_id
                  : step === 2 ? !!this.settings.grinder_id : true;

    return `<div class="screen is-active">
      <header class="topbar">
        <span class="topbar__title">${esc(t('app.name'))}</span>${this.langSeg()}
      </header>
      <div class="scroll pad">
        <div style="height:var(--s5)"></div>
        <div class="steps">${[1,2,3,4].map(i =>
          `<i class="steps__bar${i <= step ? ' is-done' : ''}"></i>`).join('')}</div>
        <div style="height:var(--s6)"></div>
        ${body}
        <div style="height:var(--s8)"></div>
      </div>
      <div class="footer-actions">
        ${step > 1 && step < 4
          ? `<button class="btn btn--secondary" data-act="prev" style="flex:0 0 96px">${esc(t('common.back'))}</button>` : ''}
        <button class="btn" data-act="${step === 4 ? 'finish' : 'next'}" ${canNext ? '' : 'disabled'}>
          ${esc(step === 4 ? t('onboard.done.go') : t('common.next'))}
        </button>
      </div>
    </div>`;
  },

  stepBrewer() {
    const list = this.showAllBrewers ? Data.brewers : Data.popularBrewers();
    return `
      <h1 class="title">${esc(t('onboard.q1.title'))}</h1>
      <div style="height:var(--s2)"></div>
      <p class="dim">${esc(t('onboard.q1.sub'))}</p>
      <div style="height:var(--s6)"></div>
      <div class="grid2">${list.map(b => `
        <button class="card-select" data-act="pick-brewer" data-id="${b.id}"
                aria-pressed="${this.settings.brewer_id === b.id}">
          <div class="card-select__name">${esc(Data.brewerName(b))}</div>
          <div class="card-select__meta">${esc(term('material', b.material))} · ${esc(term('geometry', b.geometry))}</div>
          <span class="card-select__tag">${esc(b.preheat_required ? t('gear.preheatRequired') : term('flow_rate', b.flow_rate))}</span>
        </button>`).join('')}</div>
      <div style="height:var(--s4)"></div>
      <button class="btn btn--secondary" data-act="toggle-brewers">
        ${esc(this.showAllBrewers ? t('common.seeLess') : t('common.seeAll', { n: Data.brewers.length }))}
      </button>`;
  },

  /* ── 앵커 신뢰도 ──
     그라인더 21종 중 앵커 출처가 확실한 건 2종뿐입니다. 나머지는 통설이거나
     추정입니다. 앵커가 2클릭만 틀려도 추천 분쇄도가 통째로 틀리고,
     사용자는 "이 앱 추천이 이상하다"고 느낍니다. 그게 맞는 판단이고요.

     그래서 틀릴 수 있다는 걸 **고르기 전에** 알립니다. 숨기면 앱을 못 믿게 되고,
     미리 말하면 "첫 잔 내려보고 맞추면 되겠다"가 됩니다. */
  anchorIsEstimated(g) {
    return !!g && (g.confidence === 'low' || g.confidence === 'n/a');
  },

  /** 앵커 추정 안내 박스. 해당 없으면 빈 문자열 — 호출부에서 조건문이 필요 없게. */
  anchorWarning(g) {
    if (!this.anchorIsEstimated(g)) return '';
    const custom = g.id === 'custom';
    return `
      <div class="note note--warn">
        <div class="note__title">${esc(t(custom ? 'gear.anchorCustom.title' : 'gear.anchorEstimated.title'))}</div>
        ${esc(t(custom ? 'gear.anchorCustom.body' : 'gear.anchorEstimated.body'))}
      </div>`;
  },

  stepGrinder() {
    const list = this.showAllGrinders ? Data.grinders.filter(g => g.id !== 'custom') : Data.popularGrinders();
    const isCustom = this.settings.grinder_id === 'custom';
    return `
      <h1 class="title">${esc(t('onboard.q2.title'))}</h1>
      <div style="height:var(--s2)"></div>
      <p class="dim">${esc(t('onboard.q2.sub'))}</p>
      <div style="height:var(--s6)"></div>
      <div class="grid2">${list.map(g => `
        <button class="card-select" data-act="pick-grinder" data-id="${g.id}"
                aria-pressed="${this.settings.grinder_id === g.id}">
          <div class="card-select__name">${esc(g.name)}</div>
          <div class="card-select__meta">${esc(term('grinder_type', g.type))} · ${esc(t('gear.burr', {
            shape: term('burr_shape', g.burr.shape), size: g.burr.size_mm ?? '?' }))}</div>
          <span class="card-select__tag${this.anchorIsEstimated(g) ? ' card-select__tag--warn' : ''}"
                >${esc(term('confidence', g.confidence))}</span>
        </button>`).join('')}</div>
      <div style="height:var(--s4)"></div>
      <button class="btn btn--secondary" data-act="toggle-grinders">
        ${esc(this.showAllGrinders ? t('common.seeLess') : t('common.seeAll', { n: Data.grinders.length - 1 }))}
      </button>
      <div style="height:var(--s2)"></div>
      <button class="card-select" data-act="pick-grinder" data-id="custom"
              aria-pressed="${isCustom}" style="width:100%">
        <div class="card-select__name">${esc(t('onboard.q2.custom'))}</div>
      </button>
      ${isCustom ? `
        <div style="height:var(--s4)"></div>
        <div class="numfield">
          <input type="text" data-act="custom-name" placeholder="${esc(t('onboard.q2.customNamePh'))}"
                 value="${esc(this.settings.grinder_custom_name || '')}" style="text-align:left">
        </div>` : ''}`;
  },

  stepAnchor() {
    const g = Data.byId.grinder[this.settings.grinder_id];
    const anchor = this.settings.grind_anchor;
    const fmt = this.fmtGrind(g, anchor);

    const preview = [-1, 0, 2].map(band => {
      const r = Grind.toSetting(g, band, anchor);
      const f = this.fmtGrind(g, r?.value);
      return `<div class="row">
        <span class="row__label">${esc(this.bandLabel(band))}</span>
        <span class="row__value">${esc(f.text)}${f.hint
          ? ` <span style="color:var(--ink-3);font-weight:400">(${esc(f.hint)})</span>` : ''}</span>
      </div>`;
    }).join('');

    const warn = this.anchorWarning(g);

    return `
      <h1 class="title">${esc(t('onboard.q3.title'))}</h1>
      <div style="height:var(--s2)"></div>
      <p class="dim">${esc(t('onboard.q3.sub'))}</p>
      <div style="height:var(--s6)"></div>
      ${warn ? warn + '<div style="height:var(--s6)"></div>' : ''}
      <div class="caption">${esc(t('onboard.q3.anchorLabel'))}${
        g && g.id !== 'custom' ? ` · ${esc(g.name)}` : ''}</div>
      <div style="height:var(--s2)"></div>
      <div class="stepper">
        <button class="stepper__btn" data-act="anchor" data-delta="-1" aria-label="−">−</button>
        <span class="stepper__value">
          <span class="metric">${esc(fmt.main)}</span><span class="unit">${esc(fmt.unit)}</span>
        </span>
        <button class="stepper__btn" data-act="anchor" data-delta="1" aria-label="+">+</button>
      </div>
      ${fmt.hint ? `<div style="height:var(--s2)"></div><p class="dim" style="text-align:center">${esc(fmt.hint)}</p>` : ''}
      <div style="height:var(--s6)"></div>
      <div class="caption">${esc(t('onboard.q3.preview'))}</div>
      ${preview}
      <div style="height:var(--s6)"></div>
      <div class="note">
        <div class="note__title">${esc(t('onboard.q3.why.title'))}</div>${esc(t('onboard.q3.why.body'))}
      </div>
      <div style="height:var(--s3)"></div>
      <p class="dim">${esc(t('onboard.q3.unsure'))}</p>`;
  },

  stepDone() {
    return `
      <h1 class="title">${esc(t('onboard.done.title'))}</h1>
      <div style="height:var(--s2)"></div>
      <p class="dim">${esc(t('onboard.done.sub'))}</p>
      <div style="height:var(--s6)"></div>
      ${this.gearSummary()}`;
  },

  /* ══════════ 공통 조각 ══════════ */
  fmtGrind(g, value) {
    const f = Grind.format(g, value);
    const unit = f.unit ? term('adjust_unit', f.unit) : '';
    return {
      main: f.main, unit,
      text: `${f.main} ${unit}`.trim(),
      hint: f.rot ? t('gear.rotationHint', f.rot) : null
    };
  },

  bandLabel(band) {
    return `${band > 0 ? '+' : ''}${band} · ${term('band', String(band))}`;
  },

  gearSummary() {
    const b = Data.byId.brewer[this.settings.brewer_id];
    const g = Data.byId.grinder[this.settings.grinder_id];
    const f = this.fmtGrind(g, this.settings.grind_anchor);
    const gname = g?.id === 'custom' ? (this.settings.grinder_custom_name || g.name) : (g?.name || '—');
    return `
      <div class="row"><span class="row__label">${esc(t('gear.dripper'))}</span>
        <span class="row__value">${esc(Data.brewerName(b))}</span></div>
      <div class="row"><span class="row__label">${esc(t('gear.grinder'))}</span>
        <span class="row__value">${esc(gname)}</span></div>
      <div class="row"><span class="row__label">${esc(t('gear.anchor'))}</span>
        <span class="row__value">${esc(f.text)}${this.anchorIsEstimated(g)
          ? ` <span style="color:var(--warn);font-weight:600">${esc(t('gear.estimatedMark'))}</span>` : ''
        }</span></div>`;
  },

  langSeg() {
    return `<span class="seg">${['ko', 'en'].map(l =>
      `<button data-act="lang" data-v="${l}" aria-pressed="${I18n.lang === l}">${l === 'ko' ? '한국어' : 'EN'}</button>`
    ).join('')}</span>`;
  },

  chips(list, selected, act, multi) {
    return `<div class="chipset">${list.map(x => `
      <button class="chip" data-act="${act}" data-v="${esc(x.value)}"
              aria-pressed="${multi ? selected.includes(x.value) : selected === x.value}">
        ${x.color ? `<i class="chip__dot" style="background:${esc(x.color)}"></i>` : ''}${esc(x.label)}
      </button>`).join('')}</div>`;
  },

  /* ══════════ 홈 ══════════ */
  viewHome() {
    const counts = [['data.recipes', Data.recipes.length], ['data.beans', Data.beans.length],
                    ['data.brewers', Data.brewers.length], ['data.flavorNodes', Data.flavorNodes.length]];
    return `<div class="screen is-active">
      <header class="topbar">
        <span class="topbar__title">${esc(t('home.title'))}</span>${this.langSeg()}
      </header>
      <div class="scroll pad">
        <div style="height:var(--s5)"></div>
        <button class="btn" data-act="go-rec">${esc(t('home.startRecommend'))}</button>

        <div style="height:var(--s6)"></div>
        <div class="caption">${esc(t('home.yourGear'))}</div>
        ${this.gearSummary()}

        <div style="height:var(--s6)"></div>
        <div class="caption">${esc(t('home.dataLoaded', { n: counts.reduce((s, c) => s + c[1], 0) }))}</div>
        <div style="height:var(--s2)"></div>
        <div class="metric-grid">${counts.map(([k, n]) => `
          <div class="metric-card">
            <div class="caption">${esc(t(k))}</div>
            <div class="metric-card__value"><span class="metric-sm">${n}</span></div>
          </div>`).join('')}</div>

        <div style="height:var(--s6)"></div>
        <div class="caption">${esc(t('settings.display'))}</div>
        <div class="row">
          <span class="row__label">${esc(t('common.theme'))}</span>
          <span class="seg">${['auto', 'light', 'dark'].map(v =>
            `<button data-act="theme" data-v="${v}" aria-pressed="${this.settings.theme === v}">${esc(t('common.theme.' + v))}</button>`
          ).join('')}</span>
        </div>

        <div style="height:var(--s6)"></div>
        <p class="dim">${esc(t('settings.storageNote'))}</p>
        <div style="height:var(--s4)"></div>
        <button class="btn btn--ghost" data-act="reset">${esc(t('settings.reset'))}</button>
        <div style="height:var(--s8)"></div>
      </div>
      ${this.tabbar('brew')}
    </div>`;
  },

  tabbar(active = 'brew') {
    const items = [
      ['☕', 'tab.brew',    'brew',    'go-home'],
      ['🔍', 'tab.explore', 'explore', 'go-archive'],
      ['📓', 'tab.log',     'logs',    'go-logs'],
      ['📖', 'tab.wiki',    'wiki',    'go-wiki']
    ];
    return `<nav class="tabbar">${items.map(([ic, k, id, act]) =>
      `<button class="tabbar__item" ${id === active ? 'aria-current="page"' : ''}
               ${act ? `data-act="${act}"` : 'disabled style="opacity:.45"'}>
         <span class="tabbar__icon">${ic}</span><span class="tabbar__label">${esc(t(k))}</span>
       </button>`).join('')}</nav>`;
  },

  /* ══════════ 추천 입력 ══════════ */
  viewRecInput() {
    const rec = this.settings.rec;
    const ROASTS = ['light', 'light-medium', 'medium', 'medium-dark', 'full-city', 'dark'];
    const PROCESSES = ['washed', 'natural', 'honey', 'anaerobic'];
    const GOALS = ['clarity', 'sweetness', 'body', 'acidity', 'balance'];

    return `<div class="screen is-active">
      <header class="topbar">
        <button class="topbar__action" data-act="go-home">← ${esc(t('common.back'))}</button>
        <span class="topbar__title">${esc(t('nav.recommend'))}</span>${this.langSeg()}
      </header>
      <div class="scroll pad">
        <div style="height:var(--s5)"></div>
        <h1 class="title">${esc(t('rec.title'))}</h1>

        <div class="section" style="margin-top:var(--s6)">
          <div class="caption">${esc(t('rec.sec.gear'))}</div>
          ${this.gearSummary()}
        </div>

        <div class="section">
          <div class="caption">${esc(t('rec.sec.bean'))}</div>
          <div style="height:var(--s3)"></div>

          <div class="field">
            <span class="field__label caption">${esc(t('rec.roast'))} · ${esc(t('common.required'))}</span>
            ${this.chips(ROASTS.map(v => ({ value: v, label: term('roast_level', v) })), rec.roast_level, 'set-roast', false)}
          </div>

          <div class="field">
            <span class="field__label caption">${esc(t('rec.process'))}</span>
            ${this.chips(PROCESSES.map(v => ({ value: v, label: term('process', v) })), rec.process, 'set-process', false)}
          </div>

          <div class="field">
            <span class="field__label caption">${esc(t('rec.flavor'))}</span>
            ${this.chips(Data.families().map(f => ({
                value: f.id, label: f.name[I18n.lang] || f.name.en, color: f.color
              })), rec.flavor_families, 'toggle-flavor', true)}
            <p class="dim field__hint">${esc(t('rec.flavorHint'))}</p>
          </div>

          <div class="field">
            <span class="field__label caption">${esc(t('rec.daysOffRoast'))}</span>
            <div class="numfield">
              <button class="stepper__btn" data-act="days" data-delta="-1" aria-label="−">−</button>
              <input type="number" inputmode="numeric" min="0" max="365" data-act="days-input"
                     value="${rec.days_off_roast ?? ''}" placeholder="${esc(t('rec.daysUnknown'))}">
              <button class="stepper__btn" data-act="days" data-delta="1" aria-label="+">+</button>
            </div>
          </div>
        </div>

        <div class="section">
          <div class="caption">${esc(t('rec.sec.goal'))}</div>
          <div style="height:var(--s3)"></div>
          ${this.chips(GOALS.map(v => ({ value: v, label: term('goal', v) })), rec.goals, 'toggle-goal', true)}
          <p class="dim field__hint">${esc(t('rec.goalHint'))}</p>

          <div class="field">
            <span class="field__label caption">${esc(t('rec.maxDifficulty'))}</span>
            <div class="segfull">${[1,2,3,4,5].map(n =>
              `<button data-act="set-diff" data-v="${n}" aria-pressed="${rec.max_difficulty === n}">${n}</button>`).join('')}</div>
            <p class="dim field__hint">${esc(t('rec.maxDifficultyHint'))}</p>
          </div>
        </div>
        <div style="height:var(--s8)"></div>
      </div>
      <div class="footer-actions">
        <button class="btn" data-act="submit-rec" ${rec.roast_level ? '' : 'disabled'}>
          ${esc(rec.roast_level ? t('rec.submit') : t('rec.needBean'))}
        </button>
      </div>
    </div>`;
  },

  /* ══════════ 추천 결과 ══════════ */
  viewRecResults() {
    const rec = this.settings.rec;
    const fitOk = this.results.filter(r => r.fit !== 'mismatch');
    const bad = this.results.filter(r => r.fit === 'mismatch');
    const nCriteria = [rec.process, ...(rec.flavor_families || []), ...(rec.goals || [])].filter(Boolean).length;

    return `<div class="screen is-active">
      <header class="topbar">
        <button class="topbar__action" data-act="go-rec">← ${esc(t('rec.editInput'))}</button>
        <span class="topbar__title">${esc(t('rec.results'))}</span>${this.langSeg()}
      </header>
      <div class="scroll pad">
        <div style="height:var(--s4)"></div>
        <p class="dim">${esc(t('rec.resultsFor', {
          roast: term('roast_level', rec.roast_level),
          process: rec.process ? term('process', rec.process) : '—',
          n: nCriteria
        }))}</p>
        <div style="height:var(--s5)"></div>

        ${fitOk.length ? fitOk.map((r, i) => this.card(r, i === 0)).join('')
                       : `<p class="dim">${esc(t('rec.noResults'))}</p>`}

        ${bad.length ? `
          <div style="height:var(--s8)"></div>
          <div class="caption">${esc(t('rec.mismatchGroup'))}</div>
          <div style="height:var(--s2)"></div>
          <p class="dim">${esc(t('rec.mismatchNote'))}</p>
          <div style="height:var(--s4)"></div>
          ${bad.map(r => this.card(r, false)).join('')}` : ''}
        <div style="height:var(--s8)"></div>
      </div>
      ${this.tabbar('brew')}
    </div>`;
  },

  card(r, isTop) {
    const rec = r.recipe;
    const mismatch = r.fit === 'mismatch';
    const badgeClass = r.fit === 'high' ? ' badge--high' : mismatch ? ' badge--mismatch' : '';

    /* 근거 */
    const why = r.why.map(w => `
      <div class="reason reason--${w.type}">
        <span class="reason__mark">${w.type === 'ok' ? '✓' : '△'}</span>
        <span>${esc(t(w.key, w.vars))}</span>
      </div>`).join('');

    /* 변환값 — 보정이 있을 때만 표 형태로 */
    const adjBy = f => r.adjustments.filter(a => a.field === f);
    const rows = [];

    const gAdj = adjBy('grind_band');
    const gf = this.fmtGrind(this.ctx().grinder, r.final.grind_setting);
    rows.push({
      label: t('param.grind'),
      was: gAdj.length ? `${this.bandLabel(gAdj[0].from)}` : null,
      now: `${gf.text}${gf.hint ? ` (${gf.hint})` : ''}`,
      sub: `${this.bandLabel(r.final.grind_band)}`,
      notes: gAdj.map(a => t(a.reasonKey, this.reasonVars(a)))
    });

    const tAdj = adjBy('temp_c');
    rows.push({
      label: t('param.temp'),
      was: tAdj.length ? `${tAdj[0].from} °C` : null,
      now: `${r.final.temp_c} °C`,
      notes: tAdj.map(a => t(a.reasonKey, this.reasonVars(a)))
    });

    rows.push({ label: t('param.ratio'), now: `${rec.water.ratio} · ${r.final.dose_g} g / ${r.final.water_g} g` });
    rows.push({ label: t('param.time'), now: this.mmss(r.final.total_time_s) });

    const conv = `<div class="conv">
      <div class="caption" style="margin-bottom:var(--s2)">${esc(
        r.adjustments.length ? t('rec.converted') : t('rec.noChange'))}</div>
      ${rows.map(row => `
        <div class="conv__row">
          <span class="conv__label">${esc(row.label)}</span>
          <span class="conv__value">
            ${row.was ? `<span class="conv__was">${esc(row.was)}</span>` : ''}${esc(row.now)}
            ${row.sub ? `<div class="conv__note">${esc(row.sub)}</div>` : ''}
            ${(row.notes || []).map(n => `<div class="conv__note">${esc(n)}</div>`).join('')}
          </span>
        </div>`).join('')}
    </div>`;

    /* 주의 — 특수 장비 대체 안내는 서술형이라 폴백 배지가 붙을 수 있습니다 */
    const cautions = r.cautions.length ? `
      <div class="caution">
        <div class="caption" style="margin-bottom:var(--s2)">${esc(t('rec.caution'))}</div>
        ${r.cautions.map(c => {
          const p = c.prose ? I18n.prose(c.prose) : null;
          return `<div class="caution__item">
            <span class="caution__mark">△</span>
            <span>${esc(t(c.key, this.reasonVars({ reasonVars: c.vars })))}
              ${p ? `<div class="conv__note">${p.isFallback
                ? `<span class="badge">${esc(t('fallback.koreanOnly'))}</span> ` : ''}${esc(p.text)}</div>` : ''}
            </span>
          </div>`;
        }).join('')}
      </div>` : '';

    return `<article class="rc${isTop ? ' rc--top' : ''}${mismatch ? ' rc--mismatch' : ''}">
      <div class="rc__head">
        <div>
          <div class="rc__name">${esc(Data.recipeTitle(rec))}</div>
          <div class="rc__meta">
            ${esc(term('source_type', rec.source_type))} · ${esc(t('rec.difficulty', { n: rec.difficulty }))}
            ${rec.author?.country ? ` · ${esc(rec.author.country)}` : ''}
          </div>
          <div style="margin-top:var(--s2)"><span class="badge${badgeClass}">${esc(t('fit.' + r.fit))}</span></div>
        </div>
        <div class="rc__score">
          <span class="metric">${r.score}</span><span class="unit">${esc(t('rec.score'))}</span>
        </div>
      </div>
      <div class="bar"><div class="bar__fill" style="width:${r.score}%"></div></div>
      ${why}
      ${conv}
      ${cautions}
      <div style="height:var(--s4)"></div>
      <button class="btn" data-act="open-brew" data-id="${esc(rec.id)}">${esc(t('rec.start'))}</button>
    </article>`;
  },

  /* ══════════ 추출 가이드 (Phase 1c) ══════════ */

  /** 추천 결과에서 추출 세션을 엽니다.
      변환된 steps(r.steps)를 씁니다 — 원본이 아니라 내 장비에 맞춰 보정된 타임라인입니다. */
  openBrew(recipeId, opts = {}) {
    const r = this.results?.find(x => x.recipe.id === recipeId)
           || (Data.byId.recipe[recipeId] ? this.makeResult(Data.byId.recipe[recipeId]) : null);
    if (!r) return false;              // 없는 레시피 id — 링크로 들어온 경우 호출부가 처리
    this.brew.result = r;
    this.brew.plan = BrewPlan.build(r.steps);
    this.brew.session = null;
    this.brew.wakeFailed = false;
    // silent는 주소를 보고 상태를 맞추는 중이라는 뜻입니다.
    // 여기서 go()를 부르면 히스토리가 한 칸 더 쌓여 뒤로가기가 두 번 필요해집니다.
    if (!opts.silent) this.go('brew-prep');
    return true;
  },

  stepName(step) {
    return term('step_type', step.type);
  },

  /** style / note 는 {ko,en} 또는 평문 문자열 둘 다 올 수 있습니다 */
  stepText(v) {
    if (v == null) return null;
    if (typeof v === 'string') return v;
    return v[I18n.lang] || v.en || v.ko || null;
  },

  viewBrewPrep() {
    const b = this.brew;
    const r = b.result;
    if (!r) return this.viewHome();
    const f = b.plan;

    const params = [
      [t('param.grind'), (() => {
        const g = this.fmtGrind(this.ctx().grinder, r.final.grind_setting);
        return `${g.text}${g.hint ? ` (${g.hint})` : ''}`;
      })()],
      [t('param.temp'), `${r.final.temp_c} °C`],
      [t('param.dose'), `${r.final.dose_g} g`],
      [t('param.water'), `${r.final.water_g} g`]
    ];

    const prep = f.prep.map(s => {
      const note = this.stepText(s.note);
      return `<div class="tl__item">
        <div class="tl__row">
          <span class="tl__time">—</span>
          <span class="tl__name">${esc(this.stepName(s))}</span>
          ${s.water_g ? `<span class="tl__g">${s.water_g} g</span>` : ''}
        </div>
        ${note ? `<div class="tl__sub" style="padding-left:52px">${esc(note)}</div>` : ''}
      </div>`;
    }).join('');

    // 단계마다 온도가 달라지는 레시피가 있습니다(2018 Fukahori 80→95→80 등).
    // 직전과 달라질 때만 배지를 붙입니다 — 매 줄에 붙이면 소음이 됩니다.
    let prevTemp = r.final.temp_c;
    const steps = f.timeline.map(s => {
      const style = this.stepText(s.style);
      const g = BrewPlan.targetAt(f, s.index);
      const raw = r.steps.find(x => x.index === s.index);
      const temp = raw?.temp_c ?? null;
      const showTemp = temp != null && temp !== prevTemp;
      if (temp != null) prevTemp = temp;
      return `<div class="tl__item">
        <div class="tl__row">
          <span class="tl__time">${esc(BrewPlan.mmss(s.startS))}</span>
          <span class="tl__name">${esc(this.stepName(s))}${
            showTemp ? `<span class="temp-badge">${temp} °C</span>` : ''}</span>
          ${g != null ? `<span class="tl__g">${g} g</span>` : ''}
        </div>
        ${style ? `<div class="tl__sub" style="padding-left:52px">${esc(style)}</div>` : ''}
      </div>`;
    }).join('');

    return `<div class="screen is-active">
      <header class="topbar">
        <button class="topbar__action" data-act="go-results">← ${esc(t('common.back'))}</button>
        <span class="topbar__title">${esc(t('brew.prep.title'))}</span>${this.langSeg()}
      </header>
      <div class="scroll pad">
        <div style="height:var(--s4)"></div>
        <h1 class="title">${esc(Data.recipeTitle(r.recipe))}</h1>
        <div style="height:var(--s5)"></div>

        <div class="caption">${esc(t('brew.prep.params'))}</div>
        <div style="height:var(--s2)"></div>
        <div class="metric-grid">${params.map(([k, v]) => `
          <div class="metric-card">
            <div class="caption">${esc(k)}</div>
            <div class="metric-card__value"><span class="metric-sm">${esc(v)}</span></div>
          </div>`).join('')}</div>

        ${prep ? `
          <div style="height:var(--s6)"></div>
          <div class="caption">${esc(t('brew.prep.before'))}</div>
          <div style="height:var(--s2)"></div>
          <div class="tl">${prep}</div>` : ''}

        <div style="height:var(--s6)"></div>
        <div class="caption">${esc(t('brew.prep.timeline'))} · ${esc(BrewPlan.mmss(f.totalS))}</div>
        <div style="height:var(--s2)"></div>
        ${f.timeline.length ? `<div class="tl">${steps}</div>`
                            : `<p class="dim">${esc(t('brew.prep.noSteps'))}</p>`}

        <div style="height:var(--s6)"></div>
        <p class="dim">${esc(t('brew.prep.armNote'))}</p>
        <div style="height:var(--s8)"></div>
      </div>
      <div class="footer-actions">
        <button class="btn" data-act="brew-start" ${f.timeline.length ? '' : 'disabled'}>
          ${esc(t('brew.prep.start'))}
        </button>
      </div>
    </div>`;
  },

  /** 타이머 화면은 한 번만 그리고, 이후에는 paintBrew()가 개별 노드만 갱신합니다.
      매 프레임 innerHTML을 다시 만들면 입력이 끊기고 배터리를 잡아먹습니다. */
  viewBrew() {
    const b = this.brew;
    if (!b.result) return this.viewHome();
    // 학습 루프를 닫는 지점 — 직전 기록에서 "다음에 바꿀 것"을 물려받아 띄웁니다
    const prev = LogEntry.findPrevious(this.logs, {
      recipeId: b.result.recipe.id, roastLevel: this.settings.rec.roast_level
    });
    const last = prev?.next_action || null;

    return `<div class="screen is-active brew">
      <div class="brew__top">
        <button data-act="brew-exit">${esc(t('brew.exit'))}</button>
        <span style="display:flex;gap:var(--s2)">
          <button data-act="brew-sound" aria-pressed="${b.sound}">
            ${b.sound ? '🔊' : '🔇'} ${esc(t('brew.sound'))}
          </button>
          <button data-act="brew-wake" aria-pressed="${b.wake}" ${b.wakeFailed ? 'disabled' : ''}>
            ${b.wake ? '🔒' : '🔓'} ${esc(t('brew.keepOn'))}
          </button>
        </span>
      </div>

      ${last ? `<div class="brew__memo">
        <div class="caption">${esc(t('brew.prevNote'))}</div>
        <div style="font-size:var(--f-label);color:var(--ink-2);margin-top:3px">${esc(last)}</div>
      </div>` : ''}

      <div class="brew__mid">
        <div class="brew__timer" id="bTimer">0:00</div>
        <div class="brew__prog">
          <div class="brew__prog-track"><div class="brew__prog-fill" id="bFill" style="width:0%"></div></div>
          <div class="caption brew__prog-label" id="bSteps"></div>
        </div>
        <div class="brew__rule"></div>
        <div class="brew__step" id="bStep"></div>
        <div class="caption brew__phase" id="bPhase"></div>
        <div class="brew__target"><span id="bTarget">—</span><span class="unit">g</span></div>
        <div class="brew__how" id="bHow"></div>
        <div class="caption brew__next" id="bNext"></div>
      </div>

      <div class="brew__bottom">
        <button class="btn btn--secondary" data-act="brew-pause" id="bPause">${esc(t('brew.pause'))}</button>
        <button class="btn" data-act="brew-next">${esc(t('brew.next'))}</button>
      </div>
    </div>`;
  },

  paintBrew(s) {
    const set = (id, v) => { const el = document.getElementById(id); if (el && el.textContent !== v) el.textContent = v; };
    const b = this.brew;
    if (!b.plan) return;

    if (s.finished) { this.finishBrew(); return; }

    const timer = document.getElementById('bTimer');
    if (timer) {
      timer.textContent = BrewPlan.mmss(s.t);
      timer.classList.toggle('is-alert', s.toNext > 0 && s.toNext <= 3);
      timer.classList.toggle('is-paused', !!s.paused);
    }

    const fill = document.getElementById('bFill');
    if (fill) fill.style.width = `${Math.round(s.progress * 100)}%`;

    set('bSteps', t('brew.stepOf', { c: s.i + 1, t: b.plan.timeline.length }));
    set('bStep', s.step ? this.stepName(s.step) : '—');
    set('bPhase', s.paused ? t('brew.pause') : t(s.phase === 'pouring' ? 'brew.pouring' : 'brew.waiting'));

    const g = BrewPlan.targetAt(b.plan, s.i);
    set('bTarget', g != null ? String(g) : '—');

    let how = this.stepText(s.step?.style) || '';
    if (s.step?.removeAtS != null) how = t('brew.removeAt', { time: BrewPlan.mmss(s.step.removeAtS) });
    // 단계별 온도가 지정된 레시피는 현재 단계의 물 온도를 함께 보여줍니다
    const raw = b.result?.steps?.find(x => x.index === s.step?.index);
    if (raw?.temp_c != null) how = `${raw.temp_c} °C · ${how}`;
    set('bHow', how);

    set('bNext', s.next ? t('brew.nextIn', { s: s.toNext }) : t('brew.doneIn', { s: s.toNext }));

    const pause = document.getElementById('bPause');
    if (pause) pause.textContent = s.paused ? t('brew.resume') : t('brew.pause');
  },

  /** 화면 꺼짐 방지 버튼을 현재 상태에 맞춥니다.
      전체 render()를 부르지 않습니다 — 추출 중에 화면을 통째로 다시 그리면
      스크롤과 애니메이션이 튑니다. */
  paintWakeButton() {
    const b = this.brew;
    const wb = document.querySelector('[data-act="brew-wake"]');
    if (!wb) return;
    wb.setAttribute('aria-pressed', String(b.wake));
    wb.textContent = `${b.wake ? '🔒' : '🔓'} ${t('brew.keepOn')}`;
    if (b.wakeFailed) wb.setAttribute('disabled', '');
    else wb.removeAttribute('disabled');
  },

  async beginTimer() {
    const b = this.brew;
    Alerts.enabled = b.sound;
    b.session = new BrewSession(b.plan, (s) => this.paintBrew(s));
    this.go('brew');

    /* 백그라운드에 갔다 돌아오면 브라우저가 잠금을 풀어둡니다.
       WakeLock이 알아서 다시 잡되, 성공 여부를 버튼에 반영해야
       사용자가 지금 화면이 꺼지는 상태인지 알 수 있습니다. */
    WakeLock.onChange = (ok) => {
      b.wake = ok;
      b.wakeFailed = !ok;
      this.paintWakeButton();
    };

    b.wake = await WakeLock.acquire();
    b.wakeFailed = !b.wake;
    b.session.start();
    this.paintWakeButton();
  },

  finishBrew() {
    const b = this.brew;
    b.session?.stop();
    WakeLock.release();
    /* replace를 씁니다 — 완료 화면에서 뒤로가기를 눌렀을 때 이미 끝난 타이머로
       돌아가면 아무것도 할 수 없는 화면을 보게 됩니다. 준비 화면으로 가야 합니다. */
    this.go('brew-done', { replace: true });
  },

  exitBrew() {
    if (!confirm(t('brew.exitConfirm'))) return;
    this.brew.session?.stop();
    WakeLock.release();
    this.brew.session = null;
    this.go('results');
  },

  viewBrewDone() {
    const b = this.brew;
    const r = b.result;
    if (!r || !b.session) return this.viewHome();

    const actual = b.session.elapsed;
    const target = b.plan.totalS;
    const diff = Math.round(actual - target);

    const marks = b.session.marks.map(m => {
      const st = b.plan.timeline[m.index];
      if (!st) return '';
      const d = Math.round(m.atS - st.startS);
      return `<div class="tl__item is-done">
        <div class="tl__row">
          <span class="tl__time">${esc(BrewPlan.mmss(m.atS))}</span>
          <span class="tl__name">${esc(this.stepName(st))}</span>
          ${d !== 0 ? `<span class="tl__delta">${d > 0 ? '+' : ''}${d}s</span>` : ''}
        </div>
        <div class="tl__sub" style="padding-left:52px">
          ${esc(t('brew.done.target'))} ${esc(BrewPlan.mmss(st.startS))} · ${esc(m.auto ? t('brew.done.auto') : t('brew.done.manual'))}
        </div>
      </div>`;
    }).join('');

    return `<div class="screen is-active">
      <header class="topbar">
        <span class="topbar__title">${esc(t('brew.done.title'))}</span>${this.langSeg()}
      </header>
      <div class="scroll pad">
        <div style="height:var(--s5)"></div>
        <p class="dim">${esc(Data.recipeTitle(r.recipe))}</p>
        <div style="height:var(--s4)"></div>

        <div class="metric-grid">
          <div class="metric-card">
            <div class="caption">${esc(t('brew.done.total'))}</div>
            <div class="metric-card__value"><span class="metric">${esc(BrewPlan.mmss(actual))}</span></div>
          </div>
          <div class="metric-card">
            <div class="caption">${esc(t('brew.done.diff'))}</div>
            <div class="metric-card__value"><span class="metric-sm">${diff > 0 ? '+' : ''}${diff}<span class="unit">s</span></span></div>
          </div>
        </div>
        <div style="height:var(--s2)"></div>
        <p class="dim">${esc(t('brew.done.target'))} ${esc(BrewPlan.mmss(target))}</p>

        <div style="height:var(--s6)"></div>
        <div class="caption">${esc(t('brew.done.marks'))}</div>
        <div style="height:var(--s2)"></div>
        <div class="tl">${marks}</div>

        <div style="height:var(--s8)"></div>
        <div class="hr"></div>
        <div style="height:var(--s6)"></div>

        <h2 class="title">${esc(t('tas.title'))}</h2>
        <div style="height:var(--s2)"></div>
        <p class="dim">${esc(t('tas.sub'))}</p>

        <div style="height:var(--s6)"></div>
        <div class="caption">${esc(t('tas.overall'))} · ${esc(t('common.required'))}</div>
        <div style="height:var(--s3)"></div>
        <div class="rate">${[1, 2, 3, 4, 5].map(v =>
          `<button data-act="tas-overall" data-v="${v}" aria-pressed="${this.tasting.overall === v}">${v}</button>`
        ).join('')}</div>

        <div style="height:var(--s6)"></div>
        <div class="caption">${esc(t('tas.flavor'))}</div>
        <div style="height:var(--s3)"></div>
        ${this.chips(Data.families().map(f => ({
            value: f.id, label: f.name[I18n.lang] || f.name.en, color: f.color
          })), this.tasting.flavor_nodes, 'tas-flavor', true)}
        <p class="dim field__hint">${esc(t('tas.flavorHint'))}</p>

        <div style="height:var(--s6)"></div>
        <div class="caption">${esc(t('tas.next'))}</div>
        <div style="height:var(--s3)"></div>
        <textarea class="textarea" rows="2" data-act="tas-next"
                  placeholder="${esc(t('tas.nextPh'))}">${esc(this.tasting.next_action)}</textarea>
        <p class="dim field__hint">${esc(t('tas.nextHint'))}</p>

        <div style="height:var(--s6)"></div>
        <div class="caption">${esc(t('tas.measured'))} · ${esc(t('common.optional'))}</div>
        <div style="height:var(--s3)"></div>
        <div class="grid2">
          <div class="numfield">
            <input type="number" inputmode="decimal" step="0.01" min="0" max="5" data-act="tas-tds"
                   value="${this.tasting.tds_pct ?? ''}" placeholder="${esc(t('tas.tds'))}" style="text-align:left">
          </div>
          <div class="numfield">
            <input type="number" inputmode="numeric" min="0" max="2000" data-act="tas-bev"
                   value="${this.tasting.beverage_g ?? ''}"
                   placeholder="${esc(t('tas.beverageEst', {
                     v: Extraction.estimateBeverage(r.final.water_g, r.final.dose_g) ?? '—' }))}"
                   style="text-align:left">
          </div>
        </div>
        ${(() => {
          const bev = this.tasting.beverage_g ?? Extraction.estimateBeverage(r.final.water_g, r.final.dose_g);
          const ey = Extraction.yield(this.tasting.tds_pct, bev, r.final.dose_g);
          if (ey == null) return `<p class="dim field__hint">${esc(t('tas.measuredHint'))}</p>`;
          const z = Extraction.zone(ey, this.tasting.tds_pct);
          return `<div style="height:var(--s3)"></div>
            <div class="note">${esc(t('tas.eyResult', { v: ey }))}
              <span class="zone zone--${z.ext}">${esc(t('an.zone.' + z.ext))}</span></div>`;
        })()}

        ${this.toast ? `<div style="height:var(--s4)"></div><div class="note">${esc(this.toast)}</div>` : ''}
        <div style="height:var(--s8)"></div>
      </div>
      <div class="footer-actions">
        <button class="btn btn--secondary" data-act="tas-skip">${esc(t('tas.skip'))}</button>
        <button class="btn" data-act="tas-save" ${this.tasting.overall ? '' : 'disabled'}>
          ${esc(this.tasting.overall ? t('tas.save') : t('tas.needOverall'))}
        </button>
      </div>
    </div>`;
  },

  /* ══════════ 분석 (Phase 4) ══════════ */

  /** 꺾은선 하나를 SVG로. 차트 라이브러리를 쓰지 않는 이유는 analysis.js 주석 참조 */
  chartSvg(label, values, opt = {}) {
    const W = 300, H = 110, PAD = 10;

    /* 기준선이 있는 차트는 y축이 기준선을 항상 포함하게 넓힙니다.
       내 수율이 전부 17%대면 데이터 범위가 16.9~17.9라 18% 선이 화면 밖으로 나갑니다.
       그러면 "내가 적정 구간 아래에 있다"는 가장 중요한 정보가 안 보입니다. */
    const range = {};
    if (opt.guides?.length) {
      const nums = values.filter(v => v != null);
      if (nums.length) {
        range.min = Math.min(...nums, ...opt.guides) - 1;
        range.max = Math.max(...nums, ...opt.guides) + 1;
      }
    }
    const c = Chart.line(values, { w: W, h: H, pad: PAD, ...opt, ...range });
    if (!c.points.length) {
      return `<div class="chart">
        <div class="chart__head"><span class="caption">${esc(label)}</span></div>
        <p class="dim">${esc(opt.emptyText || t('an.noEy'))}</p>
      </div>`;
    }

    const guides = (opt.guides || [])
      .map(g => Chart.guide(g, { w: W, h: H, pad: PAD, min: c.min, max: c.max }))
      .filter(Boolean)
      .map(g => `<path class="chart__guide" d="${g.d}"/>`).join('');

    const fmt = opt.format || (v => v);
    return `<div class="chart">
      <div class="chart__head">
        <span class="caption">${esc(label)}</span>
        <span class="chart__range">${esc(fmt(c.min))} – ${esc(fmt(c.max))}</span>
      </div>
      <svg viewBox="0 0 ${W} ${H + 14}" role="img"
           aria-label="${esc(label)} ${esc(fmt(c.min))}–${esc(fmt(c.max))}">
        ${guides}
        <path class="chart__line" d="${c.d}"/>
        ${c.points.map(p => `<circle class="chart__dot" cx="${p.x}" cy="${p.y}" r="3.5"/>`).join('')}
        ${c.points.map(p => `<text class="chart__xlabel" x="${p.x}" y="${H + 10}"
            text-anchor="middle">${p.i + 1}</text>`).join('')}
      </svg>
    </div>`;
  },

  viewAnalysis() {
    const logs = this.logs;
    if (!logs.length) {
      return `<div class="screen is-active">
        <header class="topbar">
          <span class="topbar__title">${esc(t('an.title'))}</span>${this.langSeg()}
        </header>
        <div class="scroll pad"><div class="empty">
          <div class="subtitle">${esc(t('an.empty'))}</div>
          <div style="height:var(--s2)"></div>
          <p class="dim">${esc(t('an.emptySub'))}</p>
        </div></div>
        ${this.tabbar('logs')}
      </div>`;
    }

    const s = Analysis.summary(logs);
    const counts = Analysis.recipeCounts(logs);
    const pick = this.analysis.recipeId || counts[0].recipe_id;
    const series = Analysis.dialIn(logs, pick);
    const picked = counts.find(c => c.recipe_id === pick) || counts[0];

    const charts = series.length < 2
      ? `<p class="dim">${esc(t('an.needTwo'))}</p>`
      : [
          this.chartSvg(t('an.chartScore'), series.map(x => x.score), { min: 1, max: 5 }),
          this.chartSvg(t('an.chartTemp'), series.map(x => x.temp), { format: v => `${v}°C` }),
          this.chartSvg(t('an.chartGrind'), series.map(x => x.grind)),
          this.chartSvg(t('an.chartEy'), series.map(x => x.ey),
            { guides: [18, 22], format: v => `${v}%`, emptyText: t('an.noEy') })
        ].join('');

    const steps = series.map(x => `<div class="tl__item is-done">
      <div class="tl__row">
        <span class="tl__time">${esc(t('an.attempt', { n: x.n }))}</span>
        <span class="tl__name">${x.temp ?? '—'} °C · ${x.grind ?? '—'}</span>
        <span class="tl__g">${x.score ?? '—'}</span>
      </div>
      <div class="tl__sub" style="padding-left:52px">
        ${x.changed.length
          ? x.changed.map(d => `${esc(t('diff.' + d.key))} ${d.delta > 0 ? '+' : ''}${d.delta}`).join(' · ')
          : esc(t('an.noChange'))}
        ${x.ey != null ? ` · ${x.ey}% <span class="zone zone--${Extraction.zone(x.ey).ext}">${
          esc(t('an.zone.' + Extraction.zone(x.ey).ext))}</span>` : ''}
        ${x.next_action ? `<br>→ ${esc(x.next_action)}` : ''}
      </div>
    </div>`).join('');

    const freq = Analysis.flavorFrequency(logs);
    const maxN = freq.length ? freq[0].n : 1;

    return `<div class="screen is-active">
      <header class="topbar">
        <span class="topbar__title">${esc(t('an.title'))}</span>
        <span style="display:flex;align-items:center;gap:var(--s2)">
          <button class="topbar__action" data-act="go-logs">${esc(t('log.title'))} ›</button>
          ${this.langSeg()}
        </span>
      </header>
      <div class="scroll pad">
        <div style="height:var(--s4)"></div>
        <p class="dim">${esc(t('an.sub'))}</p>

        <div style="height:var(--s5)"></div>
        <div class="caption">${esc(t('an.summary'))}</div>
        <div style="height:var(--s2)"></div>
        <div class="metric-grid">
          ${[[t('an.total'), s.total], [t('an.thisMonth'), s.thisMonth],
             [t('an.avg'), s.avgScore ?? '—'], [t('an.best'), s.bestScore ?? '—']]
            .map(([k, v]) => `<div class="metric-card">
              <div class="caption">${esc(k)}</div>
              <div class="metric-card__value"><span class="metric-sm">${esc(v)}</span></div>
            </div>`).join('')}
        </div>

        <div style="height:var(--s6)"></div>
        <div class="caption">${esc(t('an.pickRecipe'))}</div>
        <div style="height:var(--s2)"></div>
        <div class="filters">${counts.map(c => `
          <button class="chip" data-act="an-pick" data-v="${esc(c.recipe_id)}"
                  aria-pressed="${c.recipe_id === pick}">
            ${esc(c.title?.[I18n.lang] || c.title?.en || c.recipe_id)} · ${esc(t('an.attempts', { n: c.count }))}
          </button>`).join('')}</div>

        <div style="height:var(--s5)"></div>
        <div class="caption">${esc(t('an.dialIn'))} · ${esc(t('an.attempts', { n: picked.count }))}</div>
        <div style="height:var(--s3)"></div>
        ${charts}

        ${series.length >= 2 ? `
          <div style="height:var(--s5)"></div>
          <div class="tl">${steps}</div>` : ''}

        ${freq.length ? `
          <div style="height:var(--s6)"></div>
          <div class="caption">${esc(t('an.flavorFreq'))}</div>
          <div style="height:var(--s3)"></div>
          ${freq.map(f => {
            const node = FlavorTree.byId(Data.flavorNodes, f.id);
            return `<div class="freq">
              <span class="freq__label">
                <i class="chip__dot" style="background:${esc(this.nodeColor(node))}"></i>${esc(this.nodeName(node) || f.id)}
              </span>
              <span class="freq__bar"><i style="width:${Math.round(f.n / maxN * 100)}%"></i></span>
              <span class="freq__n">${f.n}</span>
            </div>`;
          }).join('')}
          <div style="height:var(--s2)"></div>
          <p class="dim">${esc(t('an.flavorFreqHint'))}</p>` : ''}

        <div style="height:var(--s8)"></div>
      </div>
      ${this.tabbar('logs')}
    </div>`;
  },

  /* ══════════ 위키 (Phase 4) ══════════ */

  viewWiki() {
    return `<div class="screen is-active">
      <header class="topbar">
        <span class="topbar__title">${esc(t('wiki.title'))}</span>${this.langSeg()}
      </header>
      <div class="scroll pad">
        <div style="height:var(--s4)"></div>
        <p class="dim">${esc(t('wiki.sub'))}</p>
        <div style="height:var(--s5)"></div>
        ${Data.wiki.map(a => {
          const ti = I18n.prose(a.title), su = I18n.prose(a.summary);
          return `<button class="wk" data-act="wiki-open" data-id="${esc(a.id)}">
            <span class="wk__title">${esc(ti?.text || a.id)}</span>
            <span class="wk__sum">${esc(su?.text || '')}</span>
          </button>`;
        }).join('')}
        <div style="height:var(--s8)"></div>
      </div>
      ${this.tabbar('wiki')}
    </div>`;
  },

  viewWikiDoc() {
    const a = Data.wiki.find(x => x.id === this.wikiId);
    if (!a) return this.viewWiki();
    const ti = I18n.prose(a.title);

    const lang = I18n.lang;
    const localized = (obj, fb) => {
      if (!obj) return null;
      const v = obj[lang] ?? null;
      if (v != null) return { v, fallback: false };
      const other = obj[lang === 'ko' ? 'en' : 'ko'];
      return other != null ? { v: other, fallback: true } : null;
    };

    const blocks = a.blocks.map(b => {
      if (b.type === 'heading') {
        const x = I18n.prose(b.text);
        return `<h2>${esc(x?.text || '')}</h2>`;
      }
      if (b.type === 'para' || b.type === 'note') {
        const x = I18n.prose(b.text);
        if (!x) return '';
        const inner = `${x.isFallback
          ? `<span class="badge" style="margin-right:6px">ⓘ ${esc(t('fallback.koreanOnly'))}</span>` : ''}${esc(x.text)}`;
        return b.type === 'note'
          ? `<div class="note" style="margin-bottom:var(--s4)">${inner}</div>`
          : `<p>${inner}</p>`;
      }
      if (b.type === 'list') {
        const x = localized(b.items);
        if (!x) return '';
        return `<ul>${x.v.map(i => `<li>${esc(i)}</li>`).join('')}</ul>`;
      }
      if (b.type === 'table') {
        const head = localized(b.head), rows = localized(b.rows);
        if (!head || !rows) return '';
        return `<div class="doc__wrap"><table>
          <thead><tr>${head.v.map(hh => `<th>${esc(hh)}</th>`).join('')}</tr></thead>
          <tbody>${rows.v.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody>
        </table></div>`;
      }
      if (b.type === 'kv') {
        return b.items.map(it => {
          const k = I18n.prose(it.k), v = I18n.prose(it.v);
          return `<div class="doc__kv">
            <div class="doc__k">${esc(k?.text || '')}</div>
            <div class="doc__v">${v?.isFallback
              ? `<span class="badge" style="margin-right:6px">ⓘ ${esc(t('fallback.koreanOnly'))}</span>` : ''}${esc(v?.text || '')}</div>
          </div>`;
        }).join('');
      }
      return '';
    }).join('');

    return `<div class="screen is-active">
      <header class="topbar">
        <button class="topbar__action" data-act="go-wiki">← ${esc(t('wiki.back'))}</button>
        <span class="topbar__title">${esc(t('wiki.title'))}</span>${this.langSeg()}
      </header>
      <div class="scroll pad">
        <div style="height:var(--s5)"></div>
        <h1 class="title">${esc(ti?.text || a.id)}</h1>
        <div style="height:var(--s6)"></div>
        <div class="doc">${blocks}</div>
        <div style="height:var(--s8)"></div>
      </div>
      ${this.tabbar('wiki')}
    </div>`;
  },

  /* ══════════ 플레이버 탐색 (Phase 3) ══════════ */

  nodeName(n) { return n ? (n.name[I18n.lang] || n.name.en) : ''; },
  beanName(b) { return b ? (b.name[I18n.lang] || b.name.en) : '—'; },
  nodeColor(n) {
    // level 3은 색이 없으므로 조상에서 물려받습니다
    if (!n) return 'var(--ink-4)';
    if (n.color) return n.color;
    const root = FlavorTree.byId(Data.flavorNodes, FlavorTree.family(n.id));
    return root?.color || 'var(--ink-4)';
  },

  viewFlavor() {
    const f = this.flavor;
    const nodes = Data.flavorNodes;
    const roots = FlavorTree.roots(nodes);
    const counts = FlavorTree.countByFamily(Data.beans, nodes);
    const matched = FlavorTree.matchBeans(Data.beans, f.selected, f.mode);

    /* ── 휠: 대분류 9개만 ──
       라벨이 짧아(Sweet, Floral 등) 방사형보다 수평이 읽기 쉽습니다. 회전하지 않습니다. */
    const sectors = Wheel.sectors(roots.length);
    const svg = `<svg width="260" height="260" viewBox="0 0 260 260"
        role="img" aria-label="${esc(t('fl.title'))}">
      ${sectors.map((s, i) => {
        const n = roots[i];
        const on = f.selected.some(x => FlavorTree.isDescendant(x, n.id)) || f.drill === n.id;
        const empty = counts[n.id] === 0;
        return `<path class="wheel__sector" d="${s.d}" fill="${esc(n.color)}"
          opacity="${on ? 1 : empty ? 0.12 : 0.28}"
          stroke="var(--paper)" stroke-width="2"
          data-act="fl-drill" data-v="${esc(n.id)}"><title>${esc(this.nodeName(n))}</title></path>`;
      }).join('')}
      ${sectors.map((s, i) => `<text class="wheel__label" x="${s.labelX}" y="${s.labelY + 3.5}"
          text-anchor="middle" fill="${
            f.selected.some(x => FlavorTree.isDescendant(x, roots[i].id)) || f.drill === roots[i].id
              ? '#fff' : 'var(--ink-3)'}"
          pointer-events="none">${esc(this.nodeName(roots[i]))}</text>`).join('')}
      <circle cx="130" cy="130" r="40" fill="var(--paper)" stroke="var(--line)"/>
      <text class="wheel__center-cap" x="130" y="124" text-anchor="middle"
            fill="var(--ink-3)">${esc(t('fl.selected'))}</text>
      <text class="wheel__center-n" x="130" y="144" text-anchor="middle"
            fill="var(--ink)">${f.selected.length}</text>
    </svg>`;

    /* ── 드릴다운 패널 ── */
    const drillNode = f.drill ? FlavorTree.byId(nodes, f.drill) : null;
    const kids = drillNode ? FlavorTree.children(nodes, drillNode.id) : [];
    const crumb = drillNode ? FlavorTree.path(nodes, drillNode.id) : [];

    const drill = drillNode ? `
      <div class="drill">
        <div class="drill__head">
          <span class="drill__crumb">
            <i style="background:${esc(this.nodeColor(drillNode))}"></i>
            ${crumb.map(c => esc(this.nodeName(c))).join(' <span class="drill__sep">›</span> ')}
          </span>
          <button class="topbar__action" data-act="fl-up">${esc(t('fl.back'))}</button>
        </div>
        <div class="chipset">
          <button class="chip" data-act="fl-toggle" data-v="${esc(drillNode.id)}"
                  aria-pressed="${f.selected.includes(drillNode.id)}">
            <i class="chip__dot" style="background:${esc(this.nodeColor(drillNode))}"></i>${esc(this.nodeName(drillNode))}
          </button>
          ${kids.map(k => `
            <button class="chip" data-act="${FlavorTree.children(nodes, k.id).length ? 'fl-drill' : 'fl-toggle'}"
                    data-v="${esc(k.id)}" aria-pressed="${f.selected.includes(k.id)}">
              <i class="chip__dot" style="background:${esc(this.nodeColor(k))}"></i>${esc(this.nodeName(k))}${
                FlavorTree.children(nodes, k.id).length ? ' ›' : ''}
            </button>`).join('')}
        </div>
      </div>` : `<p class="dim" style="text-align:center">${esc(t('fl.pick'))}</p>`;

    /* ── 선택 칩 ── */
    const chosen = f.selected.length ? `
      <div style="height:var(--s4)"></div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:var(--s3)">
        <span class="mode">
          <button data-act="fl-mode" data-v="or"  aria-pressed="${f.mode === 'or'}">${esc(t('fl.mode.or'))}</button>
          <button data-act="fl-mode" data-v="and" aria-pressed="${f.mode === 'and'}">${esc(t('fl.mode.and'))}</button>
        </span>
        <button class="topbar__action" data-act="fl-clear">${esc(t('fl.clear'))}</button>
      </div>
      <div style="height:var(--s2)"></div>
      <p class="dim">${esc(t('fl.modeHint.' + f.mode))}</p>
      <div style="height:var(--s3)"></div>
      <div class="chipset">${f.selected.map(id => {
        const n = FlavorTree.byId(nodes, id);
        return `<button class="chip" data-act="fl-toggle" data-v="${esc(id)}" aria-pressed="true">
          <i class="chip__dot" style="background:${esc(this.nodeColor(n))}"></i>${esc(this.nodeName(n))} ✕
        </button>`;
      }).join('')}</div>` : '';

    return `<div class="screen is-active">
      <header class="topbar">
        <span class="topbar__title">${esc(t('fl.title'))}</span>
        <span style="display:flex;align-items:center;gap:var(--s2)">
          <button class="topbar__action" data-act="go-archive">${esc(t('ar.title'))} ›</button>
          ${this.langSeg()}
        </span>
      </header>
      <div class="scroll pad">
        <div style="height:var(--s4)"></div>
        <p class="dim">${esc(t('fl.sub'))}</p>
        <div class="wheel">${svg}</div>
        ${drill}
        ${chosen}

        <div style="height:var(--s6)"></div>
        <div style="display:flex;align-items:baseline;justify-content:space-between;gap:var(--s3)">
          <span class="caption">${esc(t('fl.matched'))}</span>
          <span class="metric-sm">${matched.length}</span>
        </div>
        <div style="height:var(--s3)"></div>
        ${matched.length ? matched.map(b => this.beanCard(b, f.selected)).join('')
          : `<p class="dim">${esc(t('fl.none'))}</p>
             <div style="height:var(--s2)"></div>
             <p class="dim">${esc(t('fl.noneHint'))}</p>`}
        <div style="height:var(--s8)"></div>
      </div>
      ${this.tabbar('explore')}
    </div>`;
  },

  beanCard(b, selected = []) {
    const hits = FlavorTree.matchedNodes(b, selected);
    const tags = (b.flavor_nodes || []).slice(0, 4).map(id => {
      const n = FlavorTree.byId(Data.flavorNodes, id);
      const hit = hits.includes(id);
      return `<span class="mini${hit ? ' mini--hit' : ''}">
        <i style="background:${esc(this.nodeColor(n))}"></i>${esc(this.nodeName(n))}
      </span>`;
    }).join('');

    const meta = [
      term('process', b.process),
      (b.variety || []).slice(0, 2).join(' · '),
      b.origin.altitude_m ? `${b.origin.altitude_m[0]}–${b.origin.altitude_m[1]} m` : null
    ].filter(Boolean).join(' · ');

    return `<button class="bean" data-act="bean-open" data-id="${esc(b.id)}">
      <span class="bean__name">${esc(this.beanName(b))}</span>
      <span class="bean__meta">${esc(meta)}</span>
      <span class="bean__tags">${tags}</span>
    </button>`;
  },

  viewBeanDetail() {
    const b = Data.byId.bean[this.flavor.openBean];
    if (!b) return this.viewFlavor();

    const profile = I18n.prose(b.profile_note);
    const hint = I18n.prose(b.brewing_hint);
    const region = b.origin.region ? (b.origin.region[I18n.lang] || b.origin.region.en) : '';

    const flavors = (b.flavor_nodes || []).map(id => {
      const n = FlavorTree.byId(Data.flavorNodes, id);
      const p = FlavorTree.path(Data.flavorNodes, id);
      return `<span class="mini" title="${esc(p.map(x => this.nodeName(x)).join(' › '))}">
        <i style="background:${esc(this.nodeColor(n))}"></i>${esc(this.nodeName(n))}
      </span>`;
    }).join('');

    const rows = [
      [t('bean.origin'), [b.origin.country, region].filter(Boolean).join(' · ')],
      [t('bean.variety'), (b.variety || []).join(', ')],
      [t('bean.process'), term('process', b.process)],
      [t('bean.altitude'), b.origin.altitude_m ? `${b.origin.altitude_m[0]}–${b.origin.altitude_m[1]} m` : '—'],
      [t('bean.roasts'), (b.typical_roast_levels || []).map(r => term('roast_level', r)).join(', ')]
    ];

    return `<div class="screen is-active">
      <header class="topbar">
        <button class="topbar__action" data-act="go-flavor">← ${esc(t('common.back'))}</button>
        <span class="topbar__title">${esc(t('bean.detail'))}</span>${this.langSeg()}
      </header>
      <div class="scroll pad">
        <div style="height:var(--s5)"></div>
        <h1 class="title">${esc(this.beanName(b))}</h1>
        <div style="height:var(--s2)"></div>
        <span class="tag">${esc(t('bean.profileType'))}</span>

        <div style="height:var(--s5)"></div>
        ${rows.map(([k, v]) => `<div class="row">
          <span class="row__label">${esc(k)}</span>
          <span class="row__value">${esc(v || '—')}</span></div>`).join('')}

        <div style="height:var(--s6)"></div>
        <div class="caption">${esc(t('bean.flavors'))}</div>
        <div style="height:var(--s3)"></div>
        <div class="bean__tags">${flavors}</div>

        ${profile ? `
          <div style="height:var(--s6)"></div>
          <div class="caption">${esc(t('bean.profile'))}</div>
          <div style="height:var(--s2)"></div>
          <p class="bod">${esc(profile.text)}</p>` : ''}

        ${hint ? `
          <div style="height:var(--s5)"></div>
          <div class="caption">${esc(t('bean.hint'))}</div>
          <div style="height:var(--s2)"></div>
          <div class="note">${esc(hint.text)}</div>` : ''}

        <div style="height:var(--s5)"></div>
        <p class="dim">${esc(t('bean.profileTypeNote'))}</p>
        <div style="height:var(--s8)"></div>
      </div>
      <div class="footer-actions">
        <button class="btn" data-act="bean-recommend" data-id="${esc(b.id)}">${esc(t('bean.recommend'))}</button>
      </div>
    </div>`;
  },

  /** 원두 상세 → 추천 입력을 그 원두 조건으로 채우고 바로 결과로 보냅니다 */
  recommendForBean(beanId) {
    const b = Data.byId.bean[beanId];
    if (!b) return;
    const fams = [...new Set((b.flavor_nodes || []).map(n => FlavorTree.family(n)))];
    this.patchRec({
      roast_level: (b.typical_roast_levels || ['medium'])[0],
      process: b.process,
      flavor_families: fams
    });
    this.runRecommend();
    this.go('results');
  },

  /* ══════════ 레시피 아카이브 (Phase 2) ══════════ */

  /** 아카이브에서 바로 추출하려면 추천 결과와 같은 모양의 객체가 필요합니다.
      Score/Convert를 그 자리에서 돌려 만듭니다. */
  makeResult(recipe) {
    const c = this.ctx();
    const s = Score.evaluate(recipe, c);
    const conv = Convert.run(recipe, c);
    return { recipe, ...s, ...conv, fit: Score.fit(s), why: Engine.reasons({ ...s }, c) };
  },

  archiveList() {
    const f = this.archive;
    return Data.recipes.filter(r => {
      if (f.type !== 'all' && r.source_type !== f.type) return false;
      if (f.geometry) {
        const b = Data.byId.brewer[r.equipment.brewer_id];
        if (!b || b.geometry !== f.geometry) return false;
      }
      if (f.roast && !(r.coffee.suited_for.roast_levels || []).includes(f.roast)) return false;
      if (f.difficulty && r.difficulty !== f.difficulty) return false;
      return true;
    }).sort((a, b) => {
      // 챔피언은 최신 연도 순, 표준은 난이도 순
      const ay = a.author?.year ?? 0, by = b.author?.year ?? 0;
      if (ay !== by) return by - ay;
      return a.difficulty - b.difficulty;
    });
  },

  viewArchive() {
    const f = this.archive;
    const list = this.archiveList();
    const active = f.type !== 'all' || f.geometry || f.roast || f.difficulty;

    const chip = (act, val, label, cur) =>
      `<button class="chip" data-act="${act}" data-v="${esc(val)}" aria-pressed="${cur === val}">${esc(label)}</button>`;

    return `<div class="screen is-active">
      <header class="topbar">
        <span class="topbar__title">${esc(t('ar.title'))}</span>
        <span style="display:flex;align-items:center;gap:var(--s2)">
          <button class="topbar__action" data-act="go-flavor">${esc(t('fl.title'))} ›</button>
          ${this.langSeg()}
        </span>
      </header>
      <div class="scroll pad">
        <div style="height:var(--s4)"></div>
        <p class="dim">${esc(t('ar.sub'))}</p>

        <div style="height:var(--s4)"></div>
        <div class="filters">
          ${chip('ar-type', 'all', t('ar.all'), f.type)}
          ${chip('ar-type', 'championship', t('ar.champ'), f.type)}
          ${chip('ar-type', 'standard', t('ar.std'), f.type)}
        </div>
        <div style="height:var(--s2)"></div>
        <div class="filters">
          ${['cone', 'flat', 'immersion', 'hybrid_immersion', 'pressure_immersion']
            .map(g => chip('ar-geo', g, term('geometry', g), f.geometry)).join('')}
        </div>
        <div style="height:var(--s2)"></div>
        <div class="filters">
          ${['light', 'medium', 'full-city'].map(r => chip('ar-roast', r, term('roast_level', r), f.roast)).join('')}
          ${[1, 2, 3, 4, 5].map(d => chip('ar-diff', String(d), t('rec.difficulty', { n: d }), String(f.difficulty || ''))).join('')}
        </div>

        <div style="height:var(--s5)"></div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:var(--s3)">
          <span class="caption">${esc(t('ar.count', { n: list.length }))}</span>
          ${active ? `<button class="topbar__action" data-act="ar-clear">${esc(t('ar.clear'))}</button>` : ''}
        </div>
        <div style="height:var(--s2)"></div>

        ${list.length ? list.map(r => this.archiveCard(r)).join('')
                      : `<p class="dim">${esc(t('ar.none'))}</p>`}
        <div style="height:var(--s8)"></div>
      </div>
      ${this.tabbar('explore')}
    </div>`;
  },

  archiveCard(r) {
    const b = Data.byId.brewer[r.equipment.brewer_id];
    const a = r.author || {};
    const meta = [
      Data.brewerName(b),
      `${r.coffee.dose_g} g / ${r.water.total_g} g`,
      `${r.water.temp_c} °C`,
      BrewPlan.mmss(r.targets.total_time_s)
    ].join(' · ');

    return `<button class="ar" data-act="ar-open" data-id="${esc(r.id)}">
      <span class="ar__head">
        <span style="min-width:0">
          <span class="ar__name">${esc(Data.recipeTitle(r))}</span>
          <span class="ar__meta">${esc(meta)}</span>
          <span class="ar__tags">
            <span class="tag">${esc(term('source_type', r.source_type))}</span>
            <span class="tag">${esc(t('rec.difficulty', { n: r.difficulty }))}</span>
            ${a.country ? `<span class="tag">${esc(a.country)}</span>` : ''}
            ${r.verified ? '' : `<span class="tag">${esc(t('ar.unverified'))}</span>`}
          </span>
        </span>
        ${a.year ? `<span class="ar__year">${a.year}</span>` : ''}
      </span>
    </button>`;
  },

  viewArchiveDetail() {
    const r = Data.byId.recipe[this.archive.openId];
    if (!r) return this.viewArchive();

    const b = Data.byId.brewer[r.equipment.brewer_id];
    const a = r.author || {};
    const plan = BrewPlan.build(r.steps);
    const maxG = r.water.total_g || 1;

    // 온도 배지는 직전 단계와 달라질 때만 붙입니다. 매 줄에 붙이면 정보가 아니라 소음입니다.
    let prevTemp = r.water.temp_c;
    const rows = plan.timeline.map((s, i) => {
      const g = BrewPlan.targetAt(plan, s.index);
      const raw = r.steps.find(x => x.index === s.index || x.start_s === s.startS);
      const temp = raw?.temp_c ?? null;
      const showTemp = temp != null && temp !== prevTemp;
      if (temp != null) prevTemp = temp;
      const desc = this.stepText(s.style);

      return `<div class="vt__row ${s.type === 'pour' || s.type === 'bloom' ? 'vt__row--pour' : ''}">
        <span class="vt__time">${esc(BrewPlan.mmss(s.startS))}</span>
        <span class="vt__rail"><i class="vt__dot"></i></span>
        <span class="vt__body">
          <span class="vt__title">
            <span class="vt__name">${esc(this.stepName(s))}${
              showTemp ? `<span class="temp-badge">${temp} °C</span>` : ''}</span>
            ${g != null ? `<span class="vt__g">${g} g</span>` : ''}
          </span>
          ${desc ? `<span class="vt__desc">${esc(desc)}</span>` : ''}
          ${g != null ? `<span class="vt__bar"><i style="width:${Math.round(g / maxG * 100)}%"></i></span>` : ''}
        </span>
      </div>`;
    }).join('');

    const params = [
      [t('param.ratio'), `${r.water.ratio}`],
      [t('param.temp'), `${r.water.temp_c} °C`],
      [t('param.dose'), `${r.coffee.dose_g} g`],
      [t('param.time'), BrewPlan.mmss(r.targets.total_time_s)]
    ];

    const special = I18n.prose(r.coffee.special_note);
    const summary = I18n.prose(r.summary);
    const commentary = I18n.prose(r.curator_commentary);

    const proseBlock = (p) => p ? `<div class="${p.isFallback ? 'fallback' : ''}">
      ${p.isFallback ? `<div class="fallback__badge">ⓘ ${esc(t('fallback.koreanOnly'))}</div>` : ''}
      <p class="${p.isFallback ? 'fallback__body' : 'bod'}">${esc(p.text)}</p></div>` : '';

    return `<div class="screen is-active">
      <header class="topbar">
        <button class="topbar__action" data-act="go-archive">← ${esc(t('common.back'))}</button>
        <span class="topbar__title">${esc(t('ar.detail'))}</span>${this.langSeg()}
      </header>
      <div class="scroll pad">
        <div style="height:var(--s5)"></div>
        <h1 class="title">${esc(Data.recipeTitle(r))}</h1>
        <div style="height:var(--s2)"></div>
        <p class="dim">${esc([
          a.name, a.country,
          a.competition && a.year ? `${a.competition} ${a.year}` : null,
          Data.brewerName(b), r.equipment.filter
        ].filter(Boolean).join(' · '))}</p>

        <div style="height:var(--s5)"></div>
        <div class="caption">${esc(t('ar.original'))}</div>
        <div style="height:var(--s2)"></div>
        <div class="metric-grid">${params.map(([k, v]) => `
          <div class="metric-card">
            <div class="caption">${esc(k)}</div>
            <div class="metric-card__value"><span class="metric-sm">${esc(v)}</span></div>
          </div>`).join('')}</div>
        ${r.equipment.grind_original_note ? `
          <div style="height:var(--s2)"></div>
          <p class="dim">${esc(t('param.grind'))} · ${esc(r.equipment.grind_original_note)}</p>` : ''}

        ${summary ? `<div style="height:var(--s6)"></div>${proseBlock(summary)}` : ''}
        ${special ? `<div style="height:var(--s4)"></div><div class="note">${esc(special.text)}</div>` : ''}

        <div style="height:var(--s6)"></div>
        <div class="caption">${esc(t('ar.timeline'))} · ${esc(t('ar.cumulative'))}</div>
        <div style="height:var(--s3)"></div>
        <div class="vt">${rows}</div>

        <div style="height:var(--s4)"></div>
        <div class="caption">${esc(t('ar.technique'))}</div>
        <div style="height:var(--s2)"></div>
        <div class="ar__tags">${(r.technique_tags || []).map(x => `<span class="tag">${esc(x)}</span>`).join('')}</div>

        <div style="height:var(--s5)"></div>
        <div class="caption">${esc(t('ar.suited'))}</div>
        <div style="height:var(--s2)"></div>
        <div class="ar__tags">
          ${(r.coffee.suited_for.roast_levels || []).map(x => `<span class="tag">${esc(term('roast_level', x))}</span>`).join('')}
          ${(r.coffee.suited_for.processes || []).map(x => `<span class="tag">${esc(term('process', x))}</span>`).join('')}
          ${(r.coffee.suited_for.varieties || []).map(x => `<span class="tag">${esc(x)}</span>`).join('')}
        </div>

        <div style="height:var(--s6)"></div>
        <div class="caption">${esc(t('ar.commentary'))}</div>
        <div style="height:var(--s2)"></div>
        ${commentary ? proseBlock(commentary) : `<p class="dim">${esc(t('ar.noCommentary'))}</p>`}

        ${r.verify_note ? `
          <div style="height:var(--s5)"></div>
          <div class="caption">${esc(t('ar.verifyNote'))}</div>
          <div style="height:var(--s2)"></div>
          <p class="dim">${esc(r.verify_note)}</p>` : ''}

        ${(r.source_urls || []).length ? `
          <div style="height:var(--s5)"></div>
          <div class="caption">${esc(t('ar.sources'))}</div>
          <div style="height:var(--s2)"></div>
          <div class="src">${r.source_urls.map(u =>
            `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(u)}</a>`).join('<br>')}</div>` : ''}

        <div style="height:var(--s8)"></div>
      </div>
      <div class="footer-actions" style="flex-direction:column;gap:var(--s2)">
        <button class="btn" data-act="ar-brew" data-id="${esc(r.id)}">${esc(t('ar.convert'))}</button>
        <p class="dim" style="text-align:center">${esc(t('ar.convertSub'))}</p>
      </div>
    </div>`;
  },

  /* ══════════ 브루잉 로그 (Phase 1d) ══════════ */

  saveLog() {
    const b = this.brew;
    if (!b.result || !b.session) return;

    const entry = LogEntry.build({
      result: b.result, plan: b.plan, session: b.session,
      settings: this.settings, rec: this.settings.rec, tasting: this.tasting
    });
    // 측정값은 선택 입력이라 LogEntry가 아니라 여기서 붙입니다
    const bev = this.tasting.beverage_g ?? Extraction.estimateBeverage(b.result.final.water_g, b.result.final.dose_g);
    entry.measured = {
      tds_pct: this.tasting.tds_pct ?? null,
      beverage_g: this.tasting.tds_pct != null ? bev : (this.tasting.beverage_g ?? null),
      beverage_estimated: this.tasting.beverage_g == null
    };

    const res = LogStore.add(entry);
    if (!res.ok) {
      // 조용히 실패하면 사용자가 기록을 잃은 줄 모릅니다
      this.toast = res.reason === 'quota' ? t('tas.quotaFull') : t('tas.saveFailed');
      this.render();
      return;
    }
    this.logs = LogStore.all();
    this.resetTasting();
    this.go('logs');
  },

  resetTasting() {
    this.tasting = { overall: null, flavor_nodes: [], next_action: '', tds_pct: null, beverage_g: null };
    this.toast = null;
  },

  logDate(iso) {
    const d = new Date(iso);
    return I18n.lang === 'ko'
      ? `${d.getMonth() + 1}/${d.getDate()}`
      : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  },

  logTitle(l) {
    const ti = l.recipe_title || {};
    return ti[I18n.lang] || ti.en || ti.ko || l.recipe_id;
  },

  viewLogs() {
    const rows = this.logs.map((l, i) => {
      // 목록에서 다이얼인 과정을 스크롤만으로 읽히게 하는 부분
      const prev = this.logs.slice(i + 1).find(p => p.recipe_id === l.recipe_id);
      const diff = LogEntry.diff(l, prev);
      const g = this.fmtGrind(Data.byId.grinder[l.gear.grinder_id], l.planned.grind_setting);

      return `<button class="log" data-act="log-open" data-id="${esc(l.id)}">
        <span class="log__date">${esc(this.logDate(l.brewed_at))}</span>
        <span class="log__body">
          <span class="log__name">${esc(this.logTitle(l))}</span>
          <span class="log__params">${esc([
            Data.brewerName(Data.byId.brewer[l.gear.brewer_id]),
            `${l.planned.temp_c} °C`,
            g.text,
            BrewPlan.mmss(l.actual.total_time_s)
          ].join(' · '))}</span>
          ${diff.length ? `<span class="log__diff">${diff.map(d =>
            `<span>${esc(t('diff.' + d.key))} ${d.delta > 0 ? '+' : ''}${d.delta}${d.unit ? esc(d.unit) : ''}</span>`
          ).join('')}</span>` : ''}
          ${l.next_action ? `<span class="log__next">→ ${esc(l.next_action)}</span>` : ''}
        </span>
        <span class="log__score metric-sm">${l.sensory.overall ?? '—'}</span>
      </button>`;
    }).join('');

    return `<div class="screen is-active">
      <header class="topbar">
        <span class="topbar__title">${esc(t('log.title'))}</span>
        <span style="display:flex;align-items:center;gap:var(--s2)">
          ${this.logs.length ? `<button class="topbar__action" data-act="go-analysis">${esc(t('an.title'))} ›</button>` : ''}
          ${this.langSeg()}
        </span>
      </header>
      <div class="scroll pad">
        <div style="height:var(--s4)"></div>
        ${this.toast ? `<div class="note">${esc(this.toast)}</div><div style="height:var(--s4)"></div>` : ''}

        ${this.logs.length ? `
          <div class="caption">${esc(t('log.count', { n: this.logs.length }))}</div>
          <div style="height:var(--s2)"></div>
          ${rows}
        ` : `<div class="empty">
              <div class="subtitle">${esc(t('log.empty'))}</div>
              <div style="height:var(--s2)"></div>
              <p class="dim">${esc(t('log.emptySub'))}</p>
            </div>`}

        <div style="height:var(--s8)"></div>
        <div class="filerow">
          <button class="btn btn--secondary" data-act="log-export" ${this.logs.length ? '' : 'disabled'}>
            ${esc(t('log.export'))}
          </button>
          <button class="btn btn--secondary" data-act="log-import">${esc(t('log.import'))}</button>
        </div>
        <input type="file" accept="application/json,.json" id="logFile" class="hidden" data-act="log-file">
        <div style="height:var(--s4)"></div>
        <p class="dim">${esc(t('log.backupNote'))}</p>
        <div style="height:var(--s8)"></div>
      </div>
      ${this.tabbar('logs')}
    </div>`;
  },

  viewLogDetail() {
    const l = this.logs.find(x => x.id === this.logDetailId);
    if (!l) return this.viewLogs();

    const g = this.fmtGrind(Data.byId.grinder[l.gear.grinder_id], l.planned.grind_setting);
    const attempt = LogEntry.attemptNumber(this.logs, l.recipe_id, l.brewed_at);

    const vs = [
      [t('param.time'), BrewPlan.mmss(l.planned.total_time_s), BrewPlan.mmss(l.actual.total_time_s)],
      [t('param.temp'), `${l.planned.temp_c} °C`, '—'],
      [t('param.grind'), g.text, '—'],
      [t('param.dose'), `${l.planned.dose_g} g`, '—'],
      [t('param.water'), `${l.planned.water_g} g`, l.measured?.beverage_g ? `${l.measured.beverage_g} g` : '—']
    ];
    const ey = Extraction.yield(l.measured?.tds_pct, l.measured?.beverage_g, l.planned?.dose_g);
    if (ey != null) {
      const z = Extraction.zone(ey, l.measured.tds_pct);
      vs.push([t('an.chartEy'), `${l.measured.tds_pct} %`,
               `${ey}% · ${t('an.zone.' + z.ext)}`]);
    }

    const marks = (l.actual.marks || []).map(m =>
      `<div class="tl__item is-done">
        <div class="tl__row">
          <span class="tl__time">${esc(BrewPlan.mmss(m.at_s))}</span>
          <span class="tl__name">${esc(t('rec.steps'))} ${m.index + 1}</span>
          <span class="tl__delta">${esc(m.auto ? t('brew.done.auto') : t('brew.done.manual'))}</span>
        </div>
      </div>`).join('');

    const flavors = (l.flavor_nodes || []).map(id => {
      const n = Data.byId.flavor[id];
      return n ? `<span class="chip" style="pointer-events:none">
        <i class="chip__dot" style="background:${esc(n.color || 'var(--ink-4)')}"></i>${esc(n.name[I18n.lang] || n.name.en)}
      </span>` : '';
    }).join('');

    return `<div class="screen is-active">
      <header class="topbar">
        <button class="topbar__action" data-act="go-logs">← ${esc(t('common.back'))}</button>
        <span class="topbar__title">${esc(t('log.detail'))}</span>${this.langSeg()}
      </header>
      <div class="scroll pad">
        <div style="height:var(--s5)"></div>
        <h1 class="title">${esc(this.logTitle(l))}</h1>
        <div style="height:var(--s2)"></div>
        <p class="dim">${esc(new Date(l.brewed_at).toLocaleString(I18n.lang === 'ko' ? 'ko-KR' : 'en-US'))}
          · ${esc(t('log.attempt', { n: attempt }))}</p>

        <div style="height:var(--s6)"></div>
        <div class="metric-grid">
          <div class="metric-card">
            <div class="caption">${esc(t('tas.overall'))}</div>
            <div class="metric-card__value"><span class="metric">${l.sensory.overall ?? '—'}</span></div>
          </div>
          <div class="metric-card">
            <div class="caption">${esc(t('log.actual'))}</div>
            <div class="metric-card__value"><span class="metric-sm">${esc(BrewPlan.mmss(l.actual.total_time_s))}</span></div>
          </div>
        </div>

        <div style="height:var(--s6)"></div>
        <div class="caption">${esc(t('log.vs'))}</div>
        <div style="height:var(--s2)"></div>
        <div class="vs__row">
          <span class="vs__label vs__head"></span>
          <span class="vs__planned vs__head">${esc(t('log.planned'))}</span>
          <span class="vs__actual vs__head">${esc(t('log.actual'))}</span>
        </div>
        ${vs.map(([k, p, a]) => `<div class="vs__row">
          <span class="vs__label">${esc(k)}</span>
          <span class="vs__planned">${esc(p)}</span>
          <span class="vs__actual">${esc(a)}</span>
        </div>`).join('')}

        ${flavors ? `
          <div style="height:var(--s6)"></div>
          <div class="caption">${esc(t('tas.flavor'))}</div>
          <div style="height:var(--s3)"></div>
          <div class="chipset">${flavors}</div>` : ''}

        <div style="height:var(--s6)"></div>
        <div class="caption">${esc(t('tas.next'))}</div>
        <div style="height:var(--s2)"></div>
        <p class="bod">${esc(l.next_action || t('log.noNext'))}</p>

        ${marks ? `
          <div style="height:var(--s6)"></div>
          <div class="caption">${esc(t('log.marks'))}</div>
          <div style="height:var(--s2)"></div>
          <div class="tl">${marks}</div>` : ''}

        <div style="height:var(--s6)"></div>
        <div class="caption">${esc(t('log.beanCond'))}</div>
        <div class="row"><span class="row__label">${esc(t('rec.roast'))}</span>
          <span class="row__value">${esc(term('roast_level', l.bean.roast_level))}</span></div>
        <div class="row"><span class="row__label">${esc(t('rec.process'))}</span>
          <span class="row__value">${esc(l.bean.process ? term('process', l.bean.process) : '—')}</span></div>
        <div class="row"><span class="row__label">${esc(t('rec.daysOffRoast'))}</span>
          <span class="row__value">${l.bean.days_off_roast ?? '—'}</span></div>

        <div style="height:var(--s8)"></div>
        <button class="btn btn--ghost" data-act="log-delete" data-id="${esc(l.id)}"
                style="color:var(--danger)">${esc(t('log.delete'))}</button>
        <div style="height:var(--s8)"></div>
      </div>
    </div>`;
  },

  exportLogs() {
    const payload = LogStore.exportPayload(this.logs);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = LogStore.filename();
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },

  importLogs(file) {
    const reader = new FileReader();
    reader.onload = () => {
      let payload;
      try { payload = JSON.parse(reader.result); }
      catch (e) { this.toast = t('log.importFailed'); this.render(); return; }

      const res = LogStore.importPayload(payload, this.logs);
      if (!res.ok) { this.toast = t('log.importFailed'); this.render(); return; }

      const saved = LogStore.save(res.merged);
      if (!saved.ok) {
        this.toast = saved.reason === 'quota' ? t('tas.quotaFull') : t('tas.saveFailed');
      } else {
        this.logs = LogStore.all();
        this.toast = t('log.imported', { added: res.added, skipped: res.skipped });
      }
      this.render();
    };
    reader.readAsText(file);
  },

  /** 보정 사유의 코드값을 사람이 읽는 표시명으로 바꿉니다 */
  reasonVars(a) {
    const v = { ...(a.reasonVars || a.vars || {}) };
    if (v.from && I18n.terms.flow_rate?.[v.from]) v.from = term('flow_rate', v.from);
    if (v.to && I18n.terms.flow_rate?.[v.to]) v.to = term('flow_rate', v.to);
    if (v.roast) v.roast = term('roast_level', v.roast);
    return v;
  },

  mmss(s) {
    if (s == null) return '—';
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  },

  /* ══════════ 이벤트 ══════════ */
  bind(root) {
    root.addEventListener('click', async (e) => {
      const el = e.target.closest('[data-act]');
      if (!el) return;
      const act = el.dataset.act;
      const rec = this.settings.rec;

      switch (act) {
        case 'reload': location.reload(); break;
        case 'lang':  this.setLang(el.dataset.v); break;
        case 'theme': this.patch({ theme: el.dataset.v }); this.applyTheme(); this.render(); break;

        case 'pick-brewer': this.patch({ brewer_id: el.dataset.id }); this.render(); break;
        case 'pick-grinder': {
          const g = Data.byId.grinder[el.dataset.id];
          // 그라인더를 바꾸면 앵커는 그 기종 기본값으로 되돌립니다.
          this.patch({ grinder_id: el.dataset.id, grind_anchor: g?.pour_over_anchor?.setting ?? 20 });
          this.render(); break;
        }
        case 'toggle-brewers':  this.showAllBrewers  = !this.showAllBrewers;  this.render(); break;
        case 'toggle-grinders': this.showAllGrinders = !this.showAllGrinders; this.render(); break;
        case 'anchor': {
          const g = Data.byId.grinder[this.settings.grinder_id];
          const unit = (g?.step_per_band ?? 1) % 1 !== 0 ? 0.1 : 1;
          const next = Math.round(((this.settings.grind_anchor ?? 20) + Number(el.dataset.delta) * unit) * 10) / 10;
          this.patch({ grind_anchor: Math.max(0, next) }); this.render(); break;
        }
        case 'prev': this.onboardStep = Math.max(1, this.onboardStep - 1); this.render(); break;
        case 'next': this.onboardStep = Math.min(4, this.onboardStep + 1); this.render(); break;
        // 온보딩 중에는 주소를 쓰지 않습니다(단계는 히스토리에 남길 만한 게 아닙니다).
        // 끝나고 나서야 홈 주소를 잡습니다.
        case 'finish': this.patch({ onboarded: true }); this.page = 'home'; this.go('home', { replace: true }); break;

        case 'go-rec':  this.go('recommend'); break;
        case 'go-home': this.go('home'); break;

        case 'set-roast':   this.patchRec({ roast_level: rec.roast_level === el.dataset.v ? null : el.dataset.v }); this.render(); break;
        case 'set-process': this.patchRec({ process: rec.process === el.dataset.v ? null : el.dataset.v }); this.render(); break;
        case 'set-diff':    this.patchRec({ max_difficulty: Number(el.dataset.v) }); this.render(); break;

        case 'toggle-flavor': this.patchRec({ flavor_families: toggle(rec.flavor_families, el.dataset.v) }); this.render(); break;
        case 'toggle-goal':   this.patchRec({ goals: toggle(rec.goals, el.dataset.v) }); this.render(); break;

        case 'days': {
          const cur = rec.days_off_roast ?? 0;
          this.patchRec({ days_off_roast: Math.max(0, Math.min(365, cur + Number(el.dataset.delta))) });
          this.render(); break;
        }

        case 'submit-rec': this.runRecommend(); this.go('results'); break;
        case 'go-results': this.go('results'); break;

        case 'open-brew':   this.openBrew(el.dataset.id); break;
        case 'brew-start':  this.beginTimer(); break;
        case 'brew-exit':   this.exitBrew(); break;
        case 'brew-pause':
          this.brew.session?.[this.brew.session.paused ? 'resume' : 'pause']();
          this.paintBrew(this.brew.session.state());
          break;
        case 'brew-next':   this.brew.session?.skipToNext(); break;
        case 'brew-sound': {
          this.brew.sound = !this.brew.sound;
          Alerts.enabled = this.brew.sound;
          if (this.brew.sound) Alerts.arm();
          el.setAttribute('aria-pressed', String(this.brew.sound));
          el.textContent = `${this.brew.sound ? '🔊' : '🔇'} ${t('brew.sound')}`;
          break;
        }
        case 'brew-wake': {
          if (this.brew.wake) { WakeLock.release(); this.brew.wake = false; }
          else { this.brew.wake = await WakeLock.acquire(); this.brew.wakeFailed = !this.brew.wake; }
          this.paintWakeButton();
          break;
        }
        case 'brew-again':  this.resetTasting(); this.openBrew(this.brew.result.recipe.id); break;

        case 'tas-overall': this.tasting.overall = Number(el.dataset.v); this.render(); break;
        case 'tas-flavor':
          this.tasting.flavor_nodes = toggle(this.tasting.flavor_nodes, el.dataset.v);
          this.render(); break;
        case 'tas-save': this.saveLog(); break;
        case 'tas-skip': this.resetTasting(); this.go('home'); break;

        case 'go-archive': this.archive.openId = null; this.go('archive'); break;
        case 'go-flavor':  this.flavor.openBean = null; this.go('flavor'); break;
        case 'go-analysis': this.go('analysis'); break;
        case 'an-pick':    this.analysis.recipeId = el.dataset.v; this.render(); break;
        case 'go-wiki':    this.wikiId = null; this.go('wiki'); break;
        case 'wiki-open':  this.wikiId = el.dataset.id; this.go('wiki-doc'); break;

        /* 드릴다운은 필터가 아니라 이동입니다. 주소에 남겨야 뒤로가기가
           "위로 올라가기"가 됩니다. 반대로 fl-toggle(다중 선택)은 남기지 않습니다 —
           칩 누를 때마다 히스토리가 쌓이면 뒤로가기를 열두 번 눌러야 합니다. */
        case 'fl-drill':   this.flavor.drill = el.dataset.v; this.go('flavor'); break;
        case 'fl-up': {
          const cur = FlavorTree.byId(Data.flavorNodes, this.flavor.drill);
          this.flavor.drill = cur?.parent || null;
          this.go('flavor'); break;
        }
        case 'fl-toggle':  this.flavor.selected = toggle(this.flavor.selected, el.dataset.v); this.render(); break;
        case 'fl-mode':    this.flavor.mode = el.dataset.v; this.render(); break;
        case 'fl-clear':   this.flavor.selected = []; this.render(); break;
        case 'bean-open':  this.flavor.openBean = el.dataset.id; this.go('bean'); break;
        case 'bean-recommend': this.recommendForBean(el.dataset.id); break;
        case 'ar-open':   this.archive.openId = el.dataset.id; this.go('archive-detail'); break;
        case 'ar-brew':   this.openBrew(el.dataset.id); break;
        case 'ar-type':   this.archive.type = el.dataset.v; this.render(); break;
        case 'ar-geo':    this.archive.geometry = this.archive.geometry === el.dataset.v ? null : el.dataset.v; this.render(); break;
        case 'ar-roast':  this.archive.roast = this.archive.roast === el.dataset.v ? null : el.dataset.v; this.render(); break;
        case 'ar-diff': {
          const v = Number(el.dataset.v);
          this.archive.difficulty = this.archive.difficulty === v ? null : v;
          this.render(); break;
        }
        case 'ar-clear':
          this.archive = { type:'all', geometry:null, roast:null, difficulty:null, openId:this.archive.openId };
          this.render(); break;

        case 'go-logs':   this.toast = null; this.go('logs'); break;
        case 'log-open':  this.logDetailId = el.dataset.id; this.go('log-detail'); break;
        case 'log-export': this.exportLogs(); break;
        case 'log-import': document.getElementById('logFile')?.click(); break;
        case 'log-delete':
          if (confirm(t('log.deleteConfirm'))) {
            LogStore.remove(el.dataset.id);
            this.logs = LogStore.all();
            this.go('logs');
          }
          break;

        case 'reset':
          if (confirm(t('settings.resetConfirm'))) {
            Store.clear();
            this.settings = Store.load();
            this.onboardStep = 1; this.page = 'home';
            I18n.setLang(this.settings.lang || I18n.detect());
            this.render();
          }
          break;
      }
    });

    /* 한글 입력은 조합(composition) 단위로 동작합니다.
       조합 중에 재렌더가 끼어들면 글자가 깨지므로 끝날 때까지 미룹니다. */
    root.addEventListener('compositionstart', () => { this._composing = true; });
    root.addEventListener('compositionend', () => {
      this._composing = false;
      if (this._renderPending) { this._renderPending = false; this.render(); }
    });

    root.addEventListener('change', (e) => {
      const el = e.target.closest('[data-act="log-file"]');
      if (el && el.files?.[0]) this.importLogs(el.files[0]);
    });

    root.addEventListener('input', (e) => {
      const el = e.target.closest('[data-act]');
      if (!el) return;
      if (el.dataset.act === 'custom-name') this.patch({ grinder_custom_name: el.value });
      if (el.dataset.act === 'tas-next') this.tasting.next_action = el.value;
      if (el.dataset.act === 'tas-tds') {
        const v = el.value.trim();
        this.tasting.tds_pct = v === '' ? null : Math.max(0, Math.min(5, Number(v)));
      }
      if (el.dataset.act === 'tas-bev') {
        const v = el.value.trim();
        this.tasting.beverage_g = v === '' ? null : Math.max(0, Math.min(2000, Number(v)));
      }
      if (el.dataset.act === 'log-file' && el.files?.[0]) this.importLogs(el.files[0]);
      if (el.dataset.act === 'days-input') {
        const v = el.value.trim();
        this.patchRec({ days_off_roast: v === '' ? null : Math.max(0, Math.min(365, Number(v))) });
      }
    });
  }
};

/** 배열 토글 — 있으면 빼고 없으면 넣습니다 */
function toggle(arr, v) {
  const a = arr || [];
  return a.includes(v) ? a.filter(x => x !== v) : [...a, v];
}

/** HTML 이스케이프 — 데이터가 그대로 innerHTML에 들어가므로 필수 */
function esc(v) {
  if (v == null) return '';
  return String(v).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

document.addEventListener('DOMContentLoaded', () => App.init());
