/* ══════════════════════════════════════════════════════════
   Special Coffee Wiki — 로그 분석 (Phase 4)

   Extraction  추출 수율 계산
   Analysis    다이얼인 시계열 · 통계
   Chart       SVG 좌표 계산 (순수)

   DOM 의존이 없습니다.

   왜 이 화면이 필요한가
     기획서 1.3절에서 "지난번에 뭘 바꿨는지 기억 안 난다"를 문제로 꼽았습니다.
     로그 목록의 diff는 바로 앞 기록과의 차이만 보여줍니다.
     여러 번의 조정이 점수를 어느 방향으로 움직였는지는 시계열로 봐야 보입니다.
   ══════════════════════════════════════════════════════════ */
'use strict';

const Extraction = {
  /** 커피 가루가 머금는 물의 양. 통상 원두 1g당 약 2g으로 봅니다. */
  ABSORPTION_G_PER_G: 2.0,

  /** 추출량을 재지 않았을 때의 추정값 */
  estimateBeverage(waterG, doseG) {
    if (waterG == null || doseG == null) return null;
    return Math.max(0, Math.round(waterG - doseG * this.ABSORPTION_G_PER_G));
  },

  /**
   * 추출 수율 = (TDS% × 추출량) / 도징
   * @returns 백분율. 입력이 하나라도 없으면 null
   */
  yield(tdsPct, beverageG, doseG) {
    if (!tdsPct || !beverageG || !doseG) return null;
    return Math.round((tdsPct / 100 * beverageG) / doseG * 1000) / 10;
  },

  /** SCA 권장 구간 기준 판정 — 절대 기준이 아니라 참고선입니다 */
  zone(yieldPct, tdsPct) {
    if (yieldPct == null) return null;
    const ext = yieldPct < 18 ? 'under' : yieldPct > 22 ? 'over' : 'ideal';
    if (tdsPct == null) return { ext, strength: null };
    const strength = tdsPct < 1.15 ? 'weak' : tdsPct > 1.45 ? 'strong' : 'ideal';
    return { ext, strength };
  }
};

const Analysis = {
  /**
   * 같은 레시피의 다이얼인 시계열.
   * 오래된 것부터 정렬해 "몇 회차에 무엇을 바꿨고 점수가 어떻게 됐는가"를 봅니다.
   */
  dialIn(logs, recipeId) {
    const rows = logs
      .filter(l => l.recipe_id === recipeId)
      .sort((a, b) => a.brewed_at.localeCompare(b.brewed_at));

    return rows.map((l, i) => {
      const prev = rows[i - 1];
      return {
        n: i + 1,
        id: l.id,
        brewed_at: l.brewed_at,
        temp: l.planned?.temp_c ?? null,
        grind: l.planned?.grind_setting ?? null,
        score: l.sensory?.overall ?? null,
        time: l.actual?.total_time_s ?? null,
        ey: Extraction.yield(l.measured?.tds_pct, l.measured?.beverage_g, l.planned?.dose_g),
        changed: prev ? this.changes(l, prev) : [],
        next_action: l.next_action || null
      };
    });
  },

  /** 직전 대비 무엇이 바뀌었는가 */
  changes(cur, prev) {
    const out = [];
    const d = (key, a, b) => {
      if (a == null || b == null) return;
      const v = Math.round((a - b) * 10) / 10;
      if (v !== 0) out.push({ key, delta: v });
    };
    d('temp', cur.planned?.temp_c, prev.planned?.temp_c);
    d('grind', cur.planned?.grind_setting, prev.planned?.grind_setting);
    d('dose', cur.planned?.dose_g, prev.planned?.dose_g);
    return out;
  },

  /** 어떤 레시피를 몇 번 내렸는지 — 다이얼인 대상 고르기용 */
  recipeCounts(logs) {
    const m = new Map();
    for (const l of logs) {
      const e = m.get(l.recipe_id) || { recipe_id: l.recipe_id, count: 0, best: null, title: l.recipe_title };
      e.count++;
      const s = l.sensory?.overall;
      if (s != null && (e.best == null || s > e.best)) e.best = s;
      m.set(l.recipe_id, e);
    }
    return [...m.values()].sort((a, b) => b.count - a.count);
  },

  /** 내가 자주 감지하는 향미 — 내 감각의 편향을 보여줍니다 */
  flavorFrequency(logs, topN = 8) {
    const c = new Map();
    for (const l of logs) for (const f of l.flavor_nodes || []) c.set(f, (c.get(f) || 0) + 1);
    return [...c.entries()]
      .map(([id, n]) => ({ id, n }))
      .sort((a, b) => b.n - a.n || a.id.localeCompare(b.id))
      .slice(0, topN);
  },

  summary(logs) {
    const scores = logs.map(l => l.sensory?.overall).filter(v => v != null);
    const now = new Date();
    const thisMonth = logs.filter(l => {
      const d = new Date(l.brewed_at);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }).length;
    return {
      total: logs.length,
      thisMonth,
      avgScore: scores.length ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length * 10) / 10 : null,
      bestScore: scores.length ? Math.max(...scores) : null,
      recipes: new Set(logs.map(l => l.recipe_id)).size
    };
  }
};

/* ══════════════════════════════════════════════════════════
   Chart — SVG 좌표

   차트 라이브러리를 쓰지 않습니다. 필요한 것이 꺾은선 하나뿐이고,
   의존성을 늘리면 오프라인 동작과 배포가 복잡해집니다.
   ══════════════════════════════════════════════════════════ */
const Chart = {
  /**
   * 값 배열 → 꺾은선 좌표.
   * null 값은 건너뛰되 인덱스는 유지합니다 (측정 안 한 회차가 있어도 x축이 안 밀리게).
   *
   * @param values [number|null]
   * @param opt { w, h, pad, min, max }
   * @returns { d, points, min, max }  값이 없으면 d는 빈 문자열
   */
  line(values, opt = {}) {
    const { w = 300, h = 120, pad = 8 } = opt;
    const nums = values.filter(v => v != null);
    if (!nums.length) return { d: '', points: [], min: null, max: null };

    let min = opt.min ?? Math.min(...nums);
    let max = opt.max ?? Math.max(...nums);
    // 값이 전부 같으면 선이 위아래 끝에 붙어버립니다. 여유를 줍니다.
    if (min === max) { min -= 1; max += 1; }

    const n = values.length;
    const x = i => n === 1 ? w / 2 : pad + (w - pad * 2) * (i / (n - 1));
    const y = v => h - pad - (h - pad * 2) * ((v - min) / (max - min));

    const points = values.map((v, i) => v == null ? null : {
      i, v,
      x: Math.round(x(i) * 100) / 100,
      y: Math.round(y(v) * 100) / 100
    }).filter(Boolean);

    // null로 끊긴 구간은 선을 잇지 않고 M으로 다시 시작합니다
    let d = '', prevI = null;
    for (const p of points) {
      d += (prevI == null || p.i !== prevI + 1) ? `M${p.x} ${p.y}` : `L${p.x} ${p.y}`;
      prevI = p.i;
    }
    return { d, points, min, max };
  },

  /** 가로 기준선 (예: 수율 18% / 22%) */
  guide(value, opt = {}) {
    const { w = 300, h = 120, pad = 8, min, max } = opt;
    if (min == null || max == null || max === min) return null;
    if (value < min || value > max) return null;
    const y = h - pad - (h - pad * 2) * ((value - min) / (max - min));
    return { y: Math.round(y * 100) / 100, d: `M${pad} ${y} L${w - pad} ${y}` };
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Extraction, Analysis, Chart };
}
