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
  brewers: [], grinders: [], flavorNodes: [], recipes: [],
  byId: { brewer: {}, grinder: {}, flavor: {}, recipe: {} },

  async loadAll(lang) {
    const get = async (path) => {
      const res = await fetch(path, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
      return res.json();
    };
    const [brewers, grinders, flavor, recipes, terms, dict] = await Promise.all([
      get('data/brewers.json'), get('data/grinders.json'),
      get('data/flavor-nodes.json'), get('data/recipes.json'),
      get('data/i18n/terms.json'), get(`data/i18n/${lang}.json`)
    ]);

    this.brewers = brewers.brewers;
    this.grinders = grinders.grinders;
    this.flavorNodes = flavor.nodes;
    this.recipes = recipes.recipes;
    I18n.terms = terms;
    I18n.dict = dict;

    const index = (arr, key) => arr.reduce((m, x) => (m[x.id] = x, m), this.byId[key]);
    index(this.brewers, 'brewer'); index(this.grinders, 'grinder');
    index(this.flavorNodes, 'flavor'); index(this.recipes, 'recipe');
  },

  async loadDict(lang) {
    const res = await fetch(`data/i18n/${lang}.json`, { cache: 'no-cache' });
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
  page: 'home',   // home | recommend | results | brew-prep | brew | brew-done | logs | log-detail
  onboardStep: 1,
  showAllBrewers: false,
  showAllGrinders: false,
  results: null,

  // Phase 1c — 추출 세션
  brew: { result: null, plan: null, session: null, sound: true, wake: false, wakeFailed: false },

  // Phase 1d — 테이스팅 입력 / 로그
  tasting: { overall: null, flavor_nodes: [], next_action: '' },
  logs: [],
  logDetailId: null,
  toast: null,

  async init() {
    this.settings = Store.load();
    I18n.setLang(this.settings.lang || I18n.detect());
    this.applyTheme();
    try { await Data.loadAll(I18n.lang); }
    catch (err) { this.renderError(err); return; }
    this.logs = LogStore.all();
    this.render();
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

  render() {
    const root = document.getElementById('root');
    if (!this.settings.onboarded)        root.innerHTML = this.viewOnboard();
    else if (this.page === 'recommend')  root.innerHTML = this.viewRecInput();
    else if (this.page === 'results')    root.innerHTML = this.viewRecResults();
    else if (this.page === 'brew-prep')  root.innerHTML = this.viewBrewPrep();
    else if (this.page === 'brew')       root.innerHTML = this.viewBrew();
    else if (this.page === 'brew-done')  root.innerHTML = this.viewBrewDone();
    else if (this.page === 'logs')       root.innerHTML = this.viewLogs();
    else if (this.page === 'log-detail') root.innerHTML = this.viewLogDetail();
    else                                 root.innerHTML = this.viewHome();
    root.scrollTop = 0;
    this.bind(root);
    if (this.page === 'brew' && this.brew.session) this.paintBrew(this.brew.session.state());
  },

  go(page) { this.page = page; this.render(); },

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
    document.querySelector('[data-act="reload"]')?.addEventListener('click', () => location.reload());
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
          <span class="card-select__tag">${esc(term('confidence', g.confidence))}</span>
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

    return `
      <h1 class="title">${esc(t('onboard.q3.title'))}</h1>
      <div style="height:var(--s2)"></div>
      <p class="dim">${esc(t('onboard.q3.sub'))}</p>
      <div style="height:var(--s6)"></div>
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
        <span class="row__value">${esc(f.text)}</span></div>`;
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
    const counts = [['data.brewers', Data.brewers.length], ['data.grinders', Data.grinders.length],
                    ['data.flavorNodes', Data.flavorNodes.length], ['data.recipes', Data.recipes.length]];
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
      ['🔍', 'tab.explore', 'explore', null],      // Phase 3
      ['📓', 'tab.log',     'logs',    'go-logs'],
      ['📖', 'tab.wiki',    'wiki',    null]       // Phase 4
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
  openBrew(recipeId) {
    const r = this.results?.find(x => x.recipe.id === recipeId);
    if (!r) return;
    this.brew.result = r;
    this.brew.plan = BrewPlan.build(r.steps);
    this.brew.session = null;
    this.brew.wakeFailed = false;
    this.go('brew-prep');
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

    const steps = f.timeline.map(s => {
      const style = this.stepText(s.style);
      const g = BrewPlan.targetAt(f, s.index);
      return `<div class="tl__item">
        <div class="tl__row">
          <span class="tl__time">${esc(BrewPlan.mmss(s.startS))}</span>
          <span class="tl__name">${esc(this.stepName(s))}</span>
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
    set('bHow', how);

    set('bNext', s.next ? t('brew.nextIn', { s: s.toNext }) : t('brew.doneIn', { s: s.toNext }));

    const pause = document.getElementById('bPause');
    if (pause) pause.textContent = s.paused ? t('brew.resume') : t('brew.pause');
  },

  async beginTimer() {
    const b = this.brew;
    Alerts.enabled = b.sound;
    b.session = new BrewSession(b.plan, (s) => this.paintBrew(s));
    this.page = 'brew';
    this.render();
    b.wake = await WakeLock.acquire();
    b.wakeFailed = !b.wake;
    b.session.start();
    // Wake Lock 결과를 버튼에 반영
    const wb = document.querySelector('[data-act="brew-wake"]');
    if (wb) {
      wb.setAttribute('aria-pressed', String(b.wake));
      wb.textContent = `${b.wake ? '🔒' : '🔓'} ${t('brew.keepOn')}`;
      if (b.wakeFailed) wb.setAttribute('disabled', '');
    }
  },

  finishBrew() {
    const b = this.brew;
    b.session?.stop();
    WakeLock.release();
    this.page = 'brew-done';
    this.render();
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

  /* ══════════ 브루잉 로그 (Phase 1d) ══════════ */

  saveLog() {
    const b = this.brew;
    if (!b.result || !b.session) return;

    const entry = LogEntry.build({
      result: b.result, plan: b.plan, session: b.session,
      settings: this.settings, rec: this.settings.rec, tasting: this.tasting
    });

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
    this.tasting = { overall: null, flavor_nodes: [], next_action: '' };
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
        <span class="topbar__title">${esc(t('log.title'))}</span>${this.langSeg()}
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
      [t('param.water'), `${l.planned.water_g} g`, '—']
    ];

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
        case 'finish': this.patch({ onboarded: true }); this.render(); break;

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
          el.setAttribute('aria-pressed', String(this.brew.wake));
          el.textContent = `${this.brew.wake ? '🔒' : '🔓'} ${t('brew.keepOn')}`;
          break;
        }
        case 'brew-again':  this.resetTasting(); this.openBrew(this.brew.result.recipe.id); break;

        case 'tas-overall': this.tasting.overall = Number(el.dataset.v); this.render(); break;
        case 'tas-flavor':
          this.tasting.flavor_nodes = toggle(this.tasting.flavor_nodes, el.dataset.v);
          this.render(); break;
        case 'tas-save': this.saveLog(); break;
        case 'tas-skip': this.resetTasting(); this.go('home'); break;

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

    root.addEventListener('change', (e) => {
      const el = e.target.closest('[data-act="log-file"]');
      if (el && el.files?.[0]) this.importLogs(el.files[0]);
    });

    root.addEventListener('input', (e) => {
      const el = e.target.closest('[data-act]');
      if (!el) return;
      if (el.dataset.act === 'custom-name') this.patch({ grinder_custom_name: el.value });
      if (el.dataset.act === 'tas-next') this.tasting.next_action = el.value;
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
