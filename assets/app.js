/* ══════════════════════════════════════════════════════════
   Special Coffee Wiki — UI 레이어

   Phase 1a  데이터 로딩 · 온보딩 · 다국어
   Phase 1b  추천 입력 · 추천 결과

   순수 로직(Grind · Score · Convert · Engine)은 engine.js에 있습니다.
   이 파일은 화면과 이벤트만 다룹니다.
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
  page: 'home',                 // home | recommend | results
  onboardStep: 1,
  showAllBrewers: false,
  showAllGrinders: false,
  results: null,

  async init() {
    this.settings = Store.load();
    I18n.setLang(this.settings.lang || I18n.detect());
    this.applyTheme();
    try { await Data.loadAll(I18n.lang); }
    catch (err) { this.renderError(err); return; }
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
  },

  render() {
    const root = document.getElementById('root');
    if (!this.settings.onboarded)      root.innerHTML = this.viewOnboard();
    else if (this.page === 'recommend') root.innerHTML = this.viewRecInput();
    else if (this.page === 'results')   root.innerHTML = this.viewRecResults();
    else                                root.innerHTML = this.viewHome();
    root.scrollTop = 0;
    this.bind(root);
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
      ${this.tabbar()}
    </div>`;
  },

  tabbar() {
    return `<nav class="tabbar">${
      [['☕','tab.brew'],['🔍','tab.explore'],['📓','tab.log'],['📖','tab.wiki']].map(([ic, k], i) =>
        `<button class="tabbar__item" ${i === 0 ? 'aria-current="page"' : ''}>
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
      ${this.tabbar()}
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
      <button class="btn" disabled title="${esc(t('rec.startSoon'))}">${esc(t('rec.start'))}</button>
      <p class="dim" style="text-align:center;margin-top:var(--s2)">${esc(t('rec.startSoon'))}</p>
    </article>`;
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
    root.addEventListener('click', (e) => {
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

    root.addEventListener('input', (e) => {
      const el = e.target.closest('[data-act]');
      if (!el) return;
      if (el.dataset.act === 'custom-name') this.patch({ grinder_custom_name: el.value });
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
