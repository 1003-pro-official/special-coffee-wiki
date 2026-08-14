/* ══════════════════════════════════════════════════════════
   Special Coffee Wiki — Phase 1a
   데이터 로딩 · 온보딩 · 다국어(i18n) 구조

   docs/01-project-plan.md 9절(다국어) / 3.4절(분쇄도 앵커)
   ══════════════════════════════════════════════════════════ */
'use strict';

/* ────────────────────────────────────────────
   Store — localStorage 래퍼
   설정과 로그는 이 브라우저에만 저장됩니다(로그인 없음).
   ──────────────────────────────────────────── */
const Store = {
  KEY: 'scw.settings',
  VERSION: 1,

  defaults() {
    return {
      version: this.VERSION,
      lang: null,          // null이면 navigator.language로 감지
      theme: 'auto',       // auto | light | dark
      brewer_id: null,
      grinder_id: null,
      grinder_custom_name: null,
      grind_anchor: null,  // 사용자가 조정한 기준 세팅 (밴드 0)
      water_preset: 'filtered',
      onboarded: false
    };
  },

  load() {
    try {
      const raw = localStorage.getItem(this.KEY);
      if (!raw) return this.defaults();
      const saved = JSON.parse(raw);
      if (saved.version !== this.VERSION) return this.migrate(saved);
      return Object.assign(this.defaults(), saved);
    } catch (e) {
      console.warn('설정을 읽지 못해 기본값으로 시작합니다.', e);
      return this.defaults();
    }
  },

  // 스키마 버전이 오르면 여기서 변환합니다. 지금은 초기화만.
  migrate(old) {
    console.info('설정 스키마 버전이 달라 기본값으로 초기화합니다.', old.version, '→', this.VERSION);
    return this.defaults();
  },

  save(settings) {
    try {
      localStorage.setItem(this.KEY, JSON.stringify(settings));
      return true;
    } catch (e) {
      // 사파리 프라이빗 모드 등에서 실패할 수 있습니다.
      console.error('설정 저장 실패', e);
      return false;
    }
  },

  clear() { try { localStorage.removeItem(this.KEY); } catch (e) { /* noop */ } }
};

/* ────────────────────────────────────────────
   I18n
   - 문장을 조각내어 잇지 않습니다. {var} 치환만 씁니다.
   - 누락 키는 키 이름 그대로 노출해 발견이 늦지 않게 합니다.
   ──────────────────────────────────────────── */
const I18n = {
  lang: 'ko',
  dict: {},
  terms: {},

  detect() {
    const nav = (navigator.language || '').toLowerCase();
    return nav.startsWith('ko') ? 'ko' : 'en';
  },

  setLang(lang) {
    this.lang = lang;
    document.documentElement.lang = lang;
  },

  /** UI 문자열 */
  t(key, vars) {
    let s = this.dict[key];
    if (s === undefined) { console.warn('i18n 누락 키:', key); return key; }
    if (vars) for (const k in vars) s = s.split('{' + k + '}').join(vars[k]);
    return s;
  },

  /** 열거형 코드 → 표시명. 예: term('material','plastic') */
  term(type, code) {
    const g = this.terms[type];
    if (!g || !g[code]) return code == null ? '' : String(code);
    return g[code][this.lang] ?? g[code].en ?? code;
  },

  /** {ko, en, source_lang} 구조의 서술형 필드를 폴백 정보와 함께 반환 */
  prose(field) {
    if (!field) return null;
    const mine = field[this.lang];
    if (mine) return { text: mine, isFallback: false };
    const other = this.lang === 'ko' ? field.en : field.ko;
    if (!other) return null;
    return { text: other, isFallback: true, sourceLang: field.source_lang || (this.lang === 'ko' ? 'en' : 'ko') };
  }
};
const t = (k, v) => I18n.t(k, v);
const term = (ty, c) => I18n.term(ty, c);

/* ────────────────────────────────────────────
   Data — JSON 로딩 및 인덱싱
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
      get('data/brewers.json'),
      get('data/grinders.json'),
      get('data/flavor-nodes.json'),
      get('data/recipes.json'),
      get('data/i18n/terms.json'),
      get(`data/i18n/${lang}.json`)
    ]);

    this.brewers = brewers.brewers;
    this.grinders = grinders.grinders;
    this.flavorNodes = flavor.nodes;
    this.recipes = recipes.recipes;

    I18n.terms = terms;
    I18n.dict = dict;

    const index = (arr, key) => arr.reduce((m, x) => (m[x.id] = x, m), this.byId[key]);
    index(this.brewers, 'brewer');
    index(this.grinders, 'grinder');
    index(this.flavorNodes, 'flavor');
    index(this.recipes, 'recipe');
  },

  /** 언어만 바꿀 때는 사전만 다시 읽습니다 */
  async loadDict(lang) {
    const res = await fetch(`data/i18n/${lang}.json`, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`i18n/${lang}.json → HTTP ${res.status}`);
    I18n.dict = await res.json();
  },

  brewerName(b) {
    if (!b) return '';
    if (b.aka) return `${b.name_base} (${b.aka[I18n.lang] || b.aka.en})`;
    if (b.show_material) return `${b.name_base} (${term('material', b.material)})`;
    return b.name_base;
  },

  popularBrewers(min = 4) {
    return this.brewers.filter(b => (b.popularity_kr ?? 0) >= min);
  },
  popularGrinders(min = 4) {
    return this.grinders.filter(g => (g.popularity_kr ?? 0) >= min && g.id !== 'custom');
  }
};

/* ────────────────────────────────────────────
   Grind — 앵커 + 밴드 환산 (기획서 3.4절)

   마이크론 절대 환산은 그라인더 간 성립하지 않습니다.
   버 형상·직경·제로포인트가 모두 달라 같은 800µm이
   같은 입도 분포를 뜻하지 않기 때문입니다.

   대신 각 그라인더의 "V60 표준 세팅"을 앵커(밴드 0)로 두고
   레시피는 거기서의 상대 오프셋으로 저장합니다.

   이 모듈은 Phase 1b 추천 엔진에서 그대로 재사용됩니다.
   ──────────────────────────────────────────── */
const Grind = {
  /** 밴드 → 실제 세팅값 */
  toSetting(grinder, band, anchorOverride) {
    if (!grinder) return null;
    const anchor = anchorOverride ?? grinder.pour_over_anchor?.setting;
    const step = grinder.step_per_band;
    if (anchor == null || step == null) return null;

    const raw = anchor + band * step;
    // 소수 눈금(DF64 등)은 한 자리까지, 클릭·스텝은 정수로
    const isFractional = step % 1 !== 0 || anchor % 1 !== 0;
    const value = isFractional ? Math.round(raw * 10) / 10 : Math.round(raw);

    return this.clamp(grinder, value);
  },

  clamp(grinder, value) {
    const r = grinder.usable_range;
    if (!Array.isArray(r)) return { value, clamped: false };
    if (value < r[0]) return { value: r[0], clamped: true, direction: 'min' };
    if (value > r[1]) return { value: r[1], clamped: true, direction: 'max' };
    return { value, clamped: false };
  },

  /** 화면 표시 문자열. 클릭 수가 많은 기종은 회전 + 클릭을 함께 보여줍니다 */
  format(grinder, value) {
    if (grinder == null || value == null) return { main: '—', hint: null, unit: '' };

    const adj = grinder.adjustment || {};
    const unit = term('adjust_unit', adj.unit || 'user_defined');
    const out = { main: String(value), unit, hint: null };

    const per = adj.clicks_per_rotation;
    if (adj.unit === 'click' && per && value > per) {
      out.hint = t('gear.rotationHint', { rot: Math.floor(value / per), rem: value % per });
    }
    return out;
  },

  /** 밴드 라벨. 예: "+2 · 중간-굵게" */
  bandLabel(band) {
    const sign = band > 0 ? '+' : '';
    return `${sign}${band} · ${term('band', String(band))}`;
  }
};

/* ────────────────────────────────────────────
   App
   ──────────────────────────────────────────── */
const App = {
  settings: null,
  onboardStep: 1,
  showAllBrewers: false,
  showAllGrinders: false,

  async init() {
    this.settings = Store.load();

    I18n.setLang(this.settings.lang || I18n.detect());
    this.applyTheme();

    try {
      await Data.loadAll(I18n.lang);
    } catch (err) {
      this.renderError(err);
      return;
    }

    this.render();
  },

  applyTheme() {
    const th = this.settings.theme;
    if (th === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', th);
  },

  patch(changes) {
    Object.assign(this.settings, changes);
    Store.save(this.settings);
  },

  async setLang(lang) {
    if (lang === I18n.lang) return;
    I18n.setLang(lang);
    this.patch({ lang });
    await Data.loadDict(lang);
    this.render();
  },

  render() {
    const root = document.getElementById('root');
    root.innerHTML = this.settings.onboarded ? this.viewHome() : this.viewOnboard();
    this.bind(root);
  },

  /* ── 오류 화면 ──
     file:// 로 열면 fetch가 차단됩니다. 그 경우를 구분해 안내합니다. */
  renderError(err) {
    const isFile = location.protocol === 'file:';
    document.getElementById('root').innerHTML = `
      <div class="center">
        <div class="title">${esc(t('error.dataFailed'))}</div>
        ${isFile ? `
          <p class="dim">${esc(t('error.fileProtocol'))}</p>
          <p class="dim">${esc(t('error.howToRun'))}</p>
          <pre class="code">python -m http.server 8000
npx serve .</pre>
        ` : `<p class="dim">${esc(String(err && err.message || err))}</p>`}
        <button class="btn btn--secondary" data-act="reload">${esc(t('error.retry'))}</button>
      </div>`;
    document.querySelector('[data-act="reload"]')
      ?.addEventListener('click', () => location.reload());
  },

  /* ══════════ 온보딩 ══════════ */
  viewOnboard() {
    const step = this.onboardStep;
    const body =
      step === 1 ? this.stepBrewer() :
      step === 2 ? this.stepGrinder() :
      step === 3 ? this.stepAnchor() : this.stepDone();

    const canNext =
      step === 1 ? !!this.settings.brewer_id :
      step === 2 ? !!this.settings.grinder_id : true;

    return `
      <div class="screen is-active">
        <header class="topbar">
          <span class="topbar__title">${esc(t('app.name'))}</span>
          ${this.langSeg()}
        </header>

        <div class="scroll pad">
          <div style="height:var(--s5)"></div>
          <div class="steps">
            ${[1, 2, 3, 4].map(i => `<i class="steps__bar${i <= step ? ' is-done' : ''}"></i>`).join('')}
          </div>
          <div style="height:var(--s6)"></div>
          ${body}
          <div style="height:var(--s8)"></div>
        </div>

        <div class="footer-actions">
          ${step > 1 && step < 4
            ? `<button class="btn btn--secondary" data-act="prev" style="flex:0 0 96px">${esc(t('common.back'))}</button>`
            : ''}
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

      <div class="grid2">
        ${list.map(b => `
          <button class="card-select" data-act="pick-brewer" data-id="${b.id}"
                  aria-pressed="${this.settings.brewer_id === b.id}">
            <div class="card-select__name">${esc(Data.brewerName(b))}</div>
            <div class="card-select__meta">${esc(term('material', b.material))} · ${esc(term('geometry', b.geometry))}</div>
            <span class="card-select__tag">${esc(b.preheat_required
              ? t('gear.preheatRequired')
              : term('flow_rate', b.flow_rate))}</span>
          </button>`).join('')}
      </div>

      <div style="height:var(--s4)"></div>
      <button class="btn btn--secondary" data-act="toggle-brewers">
        ${esc(this.showAllBrewers ? t('common.seeLess') : t('common.seeAll', { n: Data.brewers.length }))}
      </button>`;
  },

  stepGrinder() {
    const list = this.showAllGrinders
      ? Data.grinders.filter(g => g.id !== 'custom')
      : Data.popularGrinders();
    const isCustom = this.settings.grinder_id === 'custom';

    return `
      <h1 class="title">${esc(t('onboard.q2.title'))}</h1>
      <div style="height:var(--s2)"></div>
      <p class="dim">${esc(t('onboard.q2.sub'))}</p>
      <div style="height:var(--s6)"></div>

      <div class="grid2">
        ${list.map(g => `
          <button class="card-select" data-act="pick-grinder" data-id="${g.id}"
                  aria-pressed="${this.settings.grinder_id === g.id}">
            <div class="card-select__name">${esc(g.name)}</div>
            <div class="card-select__meta">${esc(term('grinder_type', g.type))} · ${esc(t('gear.burr', {
              shape: term('burr_shape', g.burr.shape), size: g.burr.size_mm ?? '?'
            }))}</div>
            <span class="card-select__tag">${esc(term('confidence', g.confidence))}</span>
          </button>`).join('')}
      </div>

      <div style="height:var(--s4)"></div>
      <button class="btn btn--secondary" data-act="toggle-grinders">
        ${esc(this.showAllGrinders
          ? t('common.seeLess')
          : t('common.seeAll', { n: Data.grinders.length - 1 }))}
      </button>

      <div style="height:var(--s2)"></div>
      <button class="card-select" data-act="pick-grinder" data-id="custom"
              aria-pressed="${isCustom}" style="width:100%">
        <div class="card-select__name">${esc(t('onboard.q2.custom'))}</div>
        <div class="card-select__meta">${esc(t('onboard.q3.sub'))}</div>
      </button>

      ${isCustom ? `
        <div style="height:var(--s4)"></div>
        <label class="caption" for="customName">${esc(t('onboard.q2.customName'))}</label>
        <div style="height:var(--s2)"></div>
        <input id="customName" class="stepper" style="width:100%;padding:var(--s3) var(--s4)"
               placeholder="${esc(t('onboard.q2.customNamePh'))}"
               value="${esc(this.settings.grinder_custom_name || '')}" data-act="custom-name">
      ` : ''}`;
  },

  stepAnchor() {
    const g = Data.byId.grinder[this.settings.grinder_id];
    const anchor = this.settings.grind_anchor;
    const fmt = Grind.format(g, anchor);

    // 이 앵커로 실제 레시피가 어떻게 보이는지 미리 확인시켜 줍니다.
    const preview = [-1, 0, 2].map(band => {
      const r = Grind.toSetting(g, band, anchor);
      const f = Grind.format(g, r?.value);
      return `<div class="row">
                <span class="row__label">${esc(Grind.bandLabel(band))}</span>
                <span class="row__value">${esc(f.main)} ${esc(f.unit)}${
                  f.hint ? ` <span style="color:var(--ink-3);font-weight:400">(${esc(f.hint)})</span>` : ''}</span>
              </div>`;
    }).join('');

    return `
      <h1 class="title">${esc(t('onboard.q3.title'))}</h1>
      <div style="height:var(--s2)"></div>
      <p class="dim">${esc(t('onboard.q3.sub'))}</p>
      <div style="height:var(--s6)"></div>

      <div class="caption">${esc(t('onboard.q3.anchorLabel'))}${g && g.id !== 'custom' ? ` · ${esc(g.name)}` : ''}</div>
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
        <div class="note__title">${esc(t('onboard.q3.why.title'))}</div>
        ${esc(t('onboard.q3.why.body'))}
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

  gearSummary() {
    const b = Data.byId.brewer[this.settings.brewer_id];
    const g = Data.byId.grinder[this.settings.grinder_id];
    const fmt = Grind.format(g, this.settings.grind_anchor);
    const gname = g?.id === 'custom' ? (this.settings.grinder_custom_name || g.name) : (g?.name || '—');

    return `
      <div class="row"><span class="row__label">${esc(t('gear.dripper'))}</span>
        <span class="row__value">${esc(Data.brewerName(b))}</span></div>
      <div class="row"><span class="row__label">${esc(t('gear.grinder'))}</span>
        <span class="row__value">${esc(gname)}</span></div>
      <div class="row"><span class="row__label">${esc(t('gear.anchor'))}</span>
        <span class="row__value">${esc(fmt.main)} ${esc(fmt.unit)}</span></div>`;
  },

  /* ══════════ 홈 (Phase 1a 확인용) ══════════ */
  viewHome() {
    const counts = [
      ['data.brewers', Data.brewers.length],
      ['data.grinders', Data.grinders.length],
      ['data.flavorNodes', Data.flavorNodes.length],
      ['data.recipes', Data.recipes.length]
    ];

    return `
      <div class="screen is-active">
        <header class="topbar">
          <span class="topbar__title">${esc(t('home.title'))}</span>
          ${this.langSeg()}
        </header>

        <div class="scroll pad">
          <div style="height:var(--s5)"></div>

          <div class="caption">${esc(t('home.yourGear'))}</div>
          ${this.gearSummary()}

          <div style="height:var(--s6)"></div>
          <div class="caption">${esc(t('home.dataLoaded', {
            n: counts.reduce((s, c) => s + c[1], 0)
          }))}</div>
          <div style="height:var(--s2)"></div>
          <div class="metric-grid">
            ${counts.map(([k, n]) => `
              <div class="metric-card">
                <div class="caption">${esc(t(k))}</div>
                <div class="metric-card__value"><span class="metric-sm">${n}</span></div>
              </div>`).join('')}
          </div>

          <div style="height:var(--s6)"></div>
          <div class="note">
            <div class="note__title">${esc(t('home.phase'))}</div>
            ${esc(t('home.next'))}
          </div>

          <div style="height:var(--s6)"></div>
          <div class="caption">${esc(t('settings.display'))}</div>
          <div class="row">
            <span class="row__label">${esc(t('common.theme'))}</span>
            <span class="seg">
              ${['auto', 'light', 'dark'].map(v => `
                <button data-act="theme" data-v="${v}"
                        aria-pressed="${this.settings.theme === v}">${esc(t('common.theme.' + v))}</button>`).join('')}
            </span>
          </div>

          <div style="height:var(--s6)"></div>
          <p class="dim">${esc(t('settings.storageNote'))}</p>
          <div style="height:var(--s4)"></div>
          <button class="btn btn--ghost" data-act="reset">${esc(t('settings.reset'))}</button>
          <div style="height:var(--s8)"></div>
        </div>

        <nav class="tabbar">
          ${[['☕', 'tab.brew'], ['🔍', 'tab.explore'], ['📓', 'tab.log'], ['📖', 'tab.wiki']]
            .map(([ic, k], i) => `
              <button class="tabbar__item" ${i === 0 ? 'aria-current="page"' : ''}>
                <span class="tabbar__icon">${ic}</span>
                <span class="tabbar__label">${esc(t(k))}</span>
              </button>`).join('')}
        </nav>
      </div>`;
  },

  langSeg() {
    return `<span class="seg">
      ${['ko', 'en'].map(l => `
        <button data-act="lang" data-v="${l}" aria-pressed="${I18n.lang === l}">
          ${l === 'ko' ? '한국어' : 'EN'}
        </button>`).join('')}
    </span>`;
  },

  /* ══════════ 이벤트 ══════════ */
  bind(root) {
    root.addEventListener('click', (e) => {
      const el = e.target.closest('[data-act]');
      if (!el) return;
      const act = el.dataset.act;

      switch (act) {
        case 'lang':  this.setLang(el.dataset.v); break;
        case 'theme': this.patch({ theme: el.dataset.v }); this.applyTheme(); this.render(); break;

        case 'pick-brewer': this.patch({ brewer_id: el.dataset.id }); this.render(); break;

        case 'pick-grinder': {
          const id = el.dataset.id;
          const g = Data.byId.grinder[id];
          // 그라인더를 바꾸면 앵커는 그 기종의 기본값으로 되돌립니다.
          this.patch({ grinder_id: id, grind_anchor: g?.pour_over_anchor?.setting ?? 20 });
          this.render();
          break;
        }

        case 'toggle-brewers':  this.showAllBrewers  = !this.showAllBrewers;  this.render(); break;
        case 'toggle-grinders': this.showAllGrinders = !this.showAllGrinders; this.render(); break;

        case 'anchor': {
          const g = Data.byId.grinder[this.settings.grinder_id];
          const step = (g?.step_per_band ?? 1) % 1 !== 0 ? 0.1 : 1;
          const next = Math.round(((this.settings.grind_anchor ?? 20) + Number(el.dataset.delta) * step) * 10) / 10;
          this.patch({ grind_anchor: Math.max(0, next) });
          this.render();
          break;
        }

        case 'prev': this.onboardStep = Math.max(1, this.onboardStep - 1); this.render(); break;
        case 'next': this.onboardStep = Math.min(4, this.onboardStep + 1); this.render(); break;

        case 'finish': this.patch({ onboarded: true }); this.render(); break;

        case 'reset':
          if (confirm(t('settings.resetConfirm'))) {
            Store.clear();
            this.settings = Store.load();
            this.onboardStep = 1;
            I18n.setLang(this.settings.lang || I18n.detect());
            this.render();
          }
          break;
      }
    });

    root.addEventListener('input', (e) => {
      const el = e.target.closest('[data-act="custom-name"]');
      if (el) this.patch({ grinder_custom_name: el.value });
    });
  }
};

/** HTML 이스케이프 — 데이터가 그대로 innerHTML에 들어가므로 필수 */
function esc(v) {
  if (v == null) return '';
  return String(v).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

document.addEventListener('DOMContentLoaded', () => App.init());
