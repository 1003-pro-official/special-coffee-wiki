/* ══════════════════════════════════════════════════════════
   Special Coffee Wiki — 브루잉 로그 (Phase 1d)

   LogEntry   추출 결과 + 테이스팅을 한 건으로 묶는 순수 함수
   LogStore   localStorage 저장소 + 내보내기 / 불러오기

   설계 결정
   1) 설정(scw.settings)과 다른 키에 저장합니다.
      로그는 계속 늘어나고 설정은 거의 안 늘어납니다. 같이 두면
      용량 초과 시 장비 설정까지 함께 날아갑니다.

   2) 로그에는 그 시점의 파라미터를 통째로 스냅숏해 둡니다.
      recipes.json을 나중에 고쳐도 과거 기록의 의미가 변하지 않아야 합니다.

   3) next_action이 이 프로젝트에서 가장 값어치 있는 한 줄입니다.
      다음 추출 화면 맨 위에 자동으로 띄워 학습 루프를 닫습니다.
   ══════════════════════════════════════════════════════════ */
'use strict';

const LogEntry = {
  VERSION: 1,

  /**
   * 추출 세션 + 테이스팅 입력 → 로그 한 건
   * @param o {result, plan, session, settings, rec, tasting}
   */
  build(o) {
    const r = o.result;
    const s = o.session;
    const now = new Date();

    return {
      version: this.VERSION,
      id: `log-${now.toISOString().replace(/[:.]/g, '-')}-${Math.random().toString(36).slice(2, 6)}`,
      brewed_at: now.toISOString(),

      recipe_id: r.recipe.id,
      // 레시피 제목은 스냅숏합니다. 나중에 recipes.json이 바뀌어도 기록은 그대로여야 합니다.
      recipe_title: { ...(r.recipe.title || {}) },
      source_type: r.recipe.source_type,

      gear: {
        brewer_id: o.settings.brewer_id,
        grinder_id: o.settings.grinder_id,
        grinder_custom_name: o.settings.grinder_custom_name || null,
        grind_anchor: o.settings.grind_anchor
      },

      // 계획값 — 추천 엔진이 내 장비로 변환한 결과
      planned: {
        dose_g: r.final.dose_g,
        water_g: r.final.water_g,
        ratio: r.final.ratio,
        temp_c: r.final.temp_c,
        grind_band: r.final.grind_band,
        grind_setting: r.final.grind_setting,
        total_time_s: o.plan.totalS
      },

      // 실제값
      actual: {
        total_time_s: Math.round(s.elapsed),
        marks: (s.marks || []).map(m => ({ index: m.index, at_s: m.atS, auto: m.auto }))
      },

      bean: {
        roast_level: o.rec.roast_level,
        process: o.rec.process,
        flavor_families: [...(o.rec.flavor_families || [])],
        days_off_roast: o.rec.days_off_roast
      },
      goals: [...(o.rec.goals || [])],

      sensory: { overall: o.tasting.overall ?? null },
      flavor_nodes: [...(o.tasting.flavor_nodes || [])],
      next_action: (o.tasting.next_action || '').trim() || null
    };
  },

  /** 이전 기록 대비 파라미터 차이. 목록에서 다이얼인 과정을 스크롤만으로 읽게 합니다. */
  diff(log, prev) {
    if (!prev) return [];
    const out = [];
    const push = (key, a, b, unit) => {
      if (a == null || b == null) return;
      const d = Math.round((a - b) * 10) / 10;
      if (d !== 0) out.push({ key, delta: d, unit });
    };
    push('temp', log.planned.temp_c, prev.planned.temp_c, '°C');
    push('grind', log.planned.grind_setting, prev.planned.grind_setting, null);
    push('dose', log.planned.dose_g, prev.planned.dose_g, 'g');
    push('time', log.actual.total_time_s, prev.actual.total_time_s, 's');
    return out;
  },

  /** 같은 원두 프로파일로 본 직전 기록 — next_action을 물려주는 기준 */
  findPrevious(logs, { recipeId, roastLevel }) {
    const sorted = [...logs].sort((a, b) => b.brewed_at.localeCompare(a.brewed_at));
    return sorted.find(l => l.recipe_id === recipeId)
        || sorted.find(l => l.bean?.roast_level === roastLevel)
        || null;
  },

  /** 같은 레시피의 다이얼인 회차 */
  attemptNumber(logs, recipeId, brewedAt) {
    return logs.filter(l => l.recipe_id === recipeId && l.brewed_at <= brewedAt).length;
  }
};

/* ══════════════════════════════════════════════════════════
   LogStore
   ══════════════════════════════════════════════════════════ */
const LogStore = {
  KEY: 'scw.logs',
  VERSION: 1,

  all() {
    try {
      const raw = localStorage.getItem(this.KEY);
      if (!raw) return [];
      const box = JSON.parse(raw);
      const list = Array.isArray(box) ? box : (box.logs || []);
      return list.sort((a, b) => b.brewed_at.localeCompare(a.brewed_at));
    } catch (e) {
      console.error('로그를 읽지 못했습니다. 기록을 덮어쓰지 않도록 빈 목록을 반환합니다.', e);
      return [];
    }
  },

  /** @returns {{ok:boolean, reason?:string}} */
  save(list) {
    try {
      localStorage.setItem(this.KEY, JSON.stringify({ version: this.VERSION, logs: list }));
      return { ok: true };
    } catch (e) {
      // 용량 초과가 대표적입니다. 조용히 실패하면 사용자가 기록을 잃은 줄 모릅니다.
      const quota = e && (e.name === 'QuotaExceededError' || e.code === 22);
      console.error('로그 저장 실패', e);
      return { ok: false, reason: quota ? 'quota' : 'unknown' };
    }
  },

  add(entry) {
    const list = this.all();
    list.unshift(entry);
    return this.save(list);
  },

  remove(id) {
    return this.save(this.all().filter(l => l.id !== id));
  },

  clear() { try { localStorage.removeItem(this.KEY); } catch (e) { /* noop */ } },

  /* ── 내보내기 / 불러오기 ──
     localStorage는 브라우저 데이터를 지우면 함께 사라집니다.
     파일 백업 경로를 처음부터 제공하는 이유입니다. */

  exportPayload(list) {
    return {
      format: 'special-coffee-wiki/brew-logs',
      version: this.VERSION,
      exported_at: new Date().toISOString(),
      count: list.length,
      logs: list
    };
  },

  /**
   * 불러오기. 기존 기록을 지우지 않고 병합합니다.
   * id가 같으면 건너뛰어 같은 파일을 두 번 불러와도 중복되지 않습니다.
   * @returns {{ok, added, skipped, error?}}
   */
  importPayload(payload, existing) {
    if (!payload || typeof payload !== 'object')
      return { ok: false, error: 'shape' };
    const incoming = Array.isArray(payload) ? payload : payload.logs;
    if (!Array.isArray(incoming))
      return { ok: false, error: 'shape' };

    const valid = incoming.filter(l => l && typeof l.id === 'string' && typeof l.brewed_at === 'string');
    if (!valid.length) return { ok: false, error: 'empty' };

    const seen = new Set(existing.map(l => l.id));
    const added = valid.filter(l => !seen.has(l.id));
    const merged = [...existing, ...added].sort((a, b) => b.brewed_at.localeCompare(a.brewed_at));

    return { ok: true, added: added.length, skipped: valid.length - added.length, merged };
  },

  filename() {
    const d = new Date().toISOString().slice(0, 10);
    return `special-coffee-wiki-logs-${d}.json`;
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { LogEntry, LogStore };
}
