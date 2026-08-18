/* ══════════════════════════════════════════════════════════
   Special Coffee Wiki — 추천 엔진 (Phase 1b)

   이 파일에는 DOM 의존이 없습니다. 순수 함수만 두어
   Node에서 그대로 단위 테스트할 수 있게 했습니다.

   구성
     Grind    앵커 + 밴드 환산            (기획서 3.4)
     Score    100점 규칙 기반 스코어링     (기획서 P3)
     Convert  내 장비 기준 파라미터 변환   (기획서 P3 변환 규칙)
     Engine   위 셋을 묶은 진입점

   설계 원칙
     · ML이 아니라 규칙 기반입니다. 추천 근거를 화면에 설명할 수 있어야
       공부가 되기 때문입니다.
     · 근거·주의 문구는 완성된 문장이 아니라 {key, vars}로 반환합니다.
       문장을 조각내어 이으면 어순이 다른 언어에서 깨집니다.
   ══════════════════════════════════════════════════════════ */
'use strict';

/* ── 순서가 있는 열거형 ── */
const ROAST_ORDER = ['light', 'light-medium', 'medium', 'medium-dark', 'full-city', 'dark'];
const FLOW_ORDER  = ['very_slow', 'slow', 'medium', 'fast', 'very_fast'];

/* 로스트 레벨별 기준선 (기획서 P3)
   본인이 체득한 원칙 — "파라미터는 로스팅 레벨에 맞춰 조정한다" — 을 코드화한 것 */
const ROAST_BASELINE = {
  'light':        { temp: [93, 96], band: -1, agitation: 'strong' },
  'light-medium': { temp: [92, 94], band:  0, agitation: 'medium-strong' },
  'medium':       { temp: [90, 93], band:  0, agitation: 'medium' },
  'medium-dark':  { temp: [88, 91], band:  1, agitation: 'gentle' },
  'full-city':    { temp: [87, 90], band:  2, agitation: 'gentle' },
  'dark':         { temp: [83, 88], band:  3, agitation: 'minimal' }
};

const clampNum = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const idx = (arr, v) => arr.indexOf(v);

/* ══════════════════════════════════════════════════════════
   Grind — 앵커 + 밴드

   마이크론 절대 환산은 그라인더 간 성립하지 않습니다.
   버 형상·직경·제로포인트가 달라 같은 800µm이 같은 입도 분포를
   뜻하지 않기 때문입니다. 각 그라인더의 "V60 표준 세팅"을
   앵커(밴드 0)로 두고 상대 오프셋으로 다룹니다.
   ══════════════════════════════════════════════════════════ */
const Grind = {
  toSetting(grinder, band, anchorOverride) {
    if (!grinder) return null;
    const anchor = anchorOverride ?? grinder.pour_over_anchor?.setting;
    const step = grinder.step_per_band;
    if (anchor == null || step == null) return null;

    const raw = anchor + band * step;
    const fractional = step % 1 !== 0 || anchor % 1 !== 0;
    const value = fractional ? Math.round(raw * 10) / 10 : Math.round(raw);
    return this.clamp(grinder, value);
  },

  clamp(grinder, value) {
    const r = grinder.usable_range;
    if (!Array.isArray(r)) return { value, clamped: false };
    if (value < r[0]) return { value: r[0], clamped: true, direction: 'min' };
    if (value > r[1]) return { value: r[1], clamped: true, direction: 'max' };
    return { value, clamped: false };
  },

  /** 표시용. 클릭 수가 많은 기종은 회전 + 클릭 힌트를 함께 냅니다.
      i18n에 의존하지 않도록 힌트는 구조체로 반환합니다. */
  format(grinder, value) {
    if (!grinder || value == null) return { main: '—', unit: null, rot: null };
    const adj = grinder.adjustment || {};
    const per = adj.clicks_per_rotation;
    const out = { main: String(value), unit: adj.unit || 'user_defined', rot: null };
    if (adj.unit === 'click' && per && value > per) {
      out.rot = { rot: Math.floor(value / per), rem: value % per };
    }
    return out;
  }
};

/* ══════════════════════════════════════════════════════════
   Score — 100점 가중 스코어링

   드리퍼 30 · 로스트 20 · 프로세스·향미 20 · 목표 15 · 난이도 10 · 검증 5
   ══════════════════════════════════════════════════════════ */
const Score = {
  MAX: { brewer: 30, roast: 20, bean: 20, goal: 15, difficulty: 10, verified: 5 },

  /**
   * @param recipe  레시피
   * @param ctx     { brewer, brewerOf, bean, goals, maxDifficulty }
   *                brewerOf(id) → brewer 객체 조회 함수
   */
  evaluate(recipe, ctx) {
    const parts = [
      this.brewer(recipe, ctx),
      this.roast(recipe, ctx),
      this.bean(recipe, ctx),
      this.goal(recipe, ctx),
      this.difficulty(recipe, ctx),
      this.verified(recipe)
    ];
    const total = parts.reduce((s, p) => s + p.points, 0);
    return {
      score: Math.round(clampNum(total, 0, 100)),
      breakdown: parts
    };
  },

  brewer(recipe, ctx) {
    const max = this.MAX.brewer;
    const mine = ctx.brewer;
    const rid = recipe.equipment.brewer_id;
    if (!mine) return { key: 'brewer', points: 0, max, reason: 'unknown' };

    if (rid === mine.id) return { key: 'brewer', points: 30, max, reason: 'exact' };

    if ((recipe.equipment.compatible_brewers || []).includes(mine.id))
      return { key: 'brewer', points: 27, max, reason: 'listed_compatible' };

    const theirs = ctx.brewerOf(rid);
    if (!theirs) return { key: 'brewer', points: 4, max, reason: 'unknown' };

    const sameGeo  = theirs.geometry === mine.geometry;
    const sameFlow = theirs.flow_rate === mine.flow_rate;
    if (sameGeo && sameFlow) return { key: 'brewer', points: 24, max, reason: 'same_geo_flow' };
    if (sameGeo)             return { key: 'brewer', points: 16, max, reason: 'same_geo' };
    if (sameFlow)            return { key: 'brewer', points: 10, max, reason: 'same_flow' };
    return { key: 'brewer', points: 4, max, reason: 'different' };
  },

  roast(recipe, ctx) {
    const max = this.MAX.roast;
    const mine = ctx.bean?.roast_level;
    const list = recipe.coffee.suited_for.roast_levels || [];
    if (!mine || !list.length) return { key: 'roast', points: 0, max, reason: 'unknown' };

    const d = Math.min(...list.map(r => Math.abs(idx(ROAST_ORDER, r) - idx(ROAST_ORDER, mine))));
    const pts = d === 0 ? 20 : d === 1 ? 12 : d === 2 ? 5 : 0;
    return { key: 'roast', points: pts, max, reason: d === 0 ? 'exact' : 'distance', distance: d };
  },

  /** 프로세스 10 + 향미 계열 10 */
  bean(recipe, ctx) {
    const max = this.MAX.bean;
    const sf = recipe.coffee.suited_for;
    const b = ctx.bean || {};
    let pts = 0;
    const detail = {};

    if (b.process) {
      detail.process = (sf.processes || []).includes(b.process);
      if (detail.process) pts += 10;
    }

    const mineFam = b.flavor_families || [];
    if (mineFam.length) {
      const hit = mineFam.filter(f => (sf.flavor_families || []).includes(f));
      detail.flavorHit = hit;
      pts += 10 * (hit.length / mineFam.length);
    }

    return { key: 'bean', points: Math.round(pts), max, reason: 'overlap', detail };
  },

  goal(recipe, ctx) {
    const max = this.MAX.goal;
    const mine = ctx.goals || [];
    if (!mine.length) return { key: 'goal', points: 0, max, reason: 'none' };
    const hit = mine.filter(g => (recipe.goal_tags || []).includes(g));
    return {
      key: 'goal',
      points: Math.round(max * (hit.length / mine.length)),
      max, reason: hit.length ? 'match' : 'miss', detail: { hit }
    };
  },

  difficulty(recipe, ctx) {
    const max = this.MAX.difficulty;
    const limit = ctx.maxDifficulty;
    if (limit == null) return { key: 'difficulty', points: max, max, reason: 'no_limit' };
    const over = recipe.difficulty - limit;
    if (over <= 0) return { key: 'difficulty', points: max, max, reason: 'fits' };
    return {
      key: 'difficulty',
      points: Math.max(0, max - 4 * over),
      max, reason: 'over', detail: { over }
    };
  },

  verified(recipe) {
    return {
      key: 'verified',
      points: recipe.verified ? this.MAX.verified : 0,
      max: this.MAX.verified,
      reason: recipe.verified ? 'verified' : 'unverified'
    };
  },

  /* ── 적합도 분류 ──
     점수만으로는 오해를 부릅니다. 난이도 항목이 쉬운 레시피 모두에게
     10점을 주고, 드리퍼도 같은 geometry면 16점을 주기 때문에
     전혀 맞지 않는 레시피도 40점대가 나옵니다.

     점수는 어디까지나 '순위를 매기기 위한 상대값'이고,
     절대적인 적합 여부는 이 함수가 따로 판정합니다.
     화면에서는 mismatch면 "조건에 맞지 않음"을 명시해
     40점대를 '그럭저럭'으로 읽지 않게 합니다. */
  fit(result) {
    const bd = k => result.breakdown.find(b => b.key === k);
    const roastD = bd('roast').distance ?? 0;
    const flavorHit = bd('bean').detail?.flavorHit?.length ?? 0;
    const goalHit = bd('goal').detail?.hit?.length ?? 0;
    const goalAsked = bd('goal').reason !== 'none';

    // 향미도 목표도 하나도 안 맞고 로스트까지 2단계 이상 벌어지면 부적합
    if (roastD >= 2 && flavorHit === 0 && (!goalAsked || goalHit === 0)) return 'mismatch';
    if (roastD >= 3) return 'mismatch';

    if (result.score >= 80) return 'high';
    if (result.score >= 62) return 'mid';
    return 'low';
  }
};

/* ══════════════════════════════════════════════════════════
   Convert — 내 장비·원두 기준으로 파라미터 보정

   반환하는 adjustment는 {field, from, to, reasonKey, reasonVars} 구조입니다.
   화면에서 원본값에 취소선을 긋고 보정값을 보여주는 데 그대로 씁니다.
   ══════════════════════════════════════════════════════════ */
const Convert = {
  run(recipe, ctx) {
    const adjustments = [];
    const cautions = [];

    let band = recipe.equipment.grind_band ?? 0;
    let temp = recipe.water.temp_c;
    let intervalScale = 1;

    /* ── 1. 드리퍼 유속 차이 ──
       유속이 빠른 브루어로 옮기면 접촉 시간이 줄어드니 곱게 갈고 간격을 줄입니다. */
    const mine = ctx.brewer;
    const theirs = ctx.brewerOf(recipe.equipment.brewer_id);
    if (mine && theirs && mine.id !== theirs.id) {
      const di = idx(FLOW_ORDER, mine.flow_rate) - idx(FLOW_ORDER, theirs.flow_rate);
      if (di !== 0 && idx(FLOW_ORDER, mine.flow_rate) >= 0 && idx(FLOW_ORDER, theirs.flow_rate) >= 0) {
        const shift = clampNum(-di, -2, 2);         // 내 쪽이 빠르면(di>0) 곱게(음수)
        if (shift !== 0) {
          adjustments.push({
            field: 'grind_band', from: band, to: band + shift,
            reasonKey: di > 0 ? 'conv.flowFaster' : 'conv.flowSlower',
            reasonVars: { from: theirs.flow_rate, to: mine.flow_rate }
          });
          band += shift;
        }
        if (di > 0) { intervalScale = 0.75; }
        else if (di < 0 && temp != null) {
          const nt = temp - Math.min(2, -di);
          adjustments.push({
            field: 'temp_c', from: temp, to: nt,
            reasonKey: 'conv.flowSlowerTemp', reasonVars: {}
          });
          temp = nt;
        }
      }
    }

    /* ── 2. 로스트 레벨 기준선 ──
       레시피가 겨냥한 로스트와 내 원두가 다르면 온도·분쇄를 원두 쪽 기준선으로 당깁니다. */
    const myRoast = ctx.bean?.roast_level;
    const theirRoast = (recipe.coffee.suited_for.roast_levels || [])[0];
    if (myRoast && theirRoast && myRoast !== theirRoast) {
      const bl = ROAST_BASELINE[myRoast];
      const rl = ROAST_BASELINE[theirRoast];
      if (bl && rl) {
        if (temp != null && (temp < bl.temp[0] || temp > bl.temp[1])) {
          const nt = clampNum(temp, bl.temp[0], bl.temp[1]);
          adjustments.push({
            field: 'temp_c', from: temp, to: nt,
            reasonKey: 'conv.roastTemp',
            reasonVars: { roast: myRoast, lo: bl.temp[0], hi: bl.temp[1] }
          });
          temp = nt;
        }
        const shift = clampNum(bl.band - rl.band, -2, 2);
        if (shift !== 0) {
          adjustments.push({
            field: 'grind_band', from: band, to: band + shift,
            reasonKey: 'conv.roastGrind', reasonVars: { roast: myRoast }
          });
          band += shift;
        }
      }
    }

    /* ── 3. 열관성 — 예열 누락 시 실제 추출 온도가 목표보다 낮아집니다 ── */
    if (mine?.preheat_required) {
      cautions.push({ key: 'conv.preheat', vars: { brewer: mine.id } });
    }

    /* ── 4. 로스팅 경과일 ── */
    const dor = ctx.bean?.days_off_roast;
    if (dor != null) {
      if (dor <= 3) cautions.push({ key: 'conv.freshBloom', vars: { days: dor } });
      else if (dor > 21 && temp != null) {
        const nt = temp + 2;
        adjustments.push({
          field: 'temp_c', from: temp, to: nt,
          reasonKey: 'conv.staleTemp', reasonVars: { days: dor }
        });
        temp = nt;
      }
    }

    /* ── 5. 특수 장비 미보유 → 대체 안내 ── */
    for (const ex of recipe.requires_extras || []) {
      const g = recipe.fallback_guidance?.[ex];
      cautions.push({ key: 'conv.missingExtra', vars: { extra: ex }, prose: g || null });
    }

    /* ── 6. 물 ──
       챔피언 레시피의 저미네랄 물은 정수로 근사할 수 있습니다. */
    if (recipe.water.tds_ppm != null && recipe.water.tds_ppm <= 60 && ctx.waterPreset === 'filtered') {
      cautions.push({ key: 'conv.lowTdsOk', vars: { ppm: recipe.water.tds_ppm } });
    }

    /* ── 최종 파라미터 ── */
    const grind = Grind.toSetting(ctx.grinder, band, ctx.anchor);
    if (grind?.clamped) {
      cautions.push({ key: 'conv.grindClamped', vars: { direction: grind.direction } });
    }

    const steps = intervalScale === 1
      ? recipe.steps
      : this.scaleIntervals(recipe.steps, intervalScale);

    return {
      adjustments, cautions,
      final: {
        dose_g: recipe.coffee.dose_g,
        water_g: recipe.water.total_g,
        ratio: recipe.water.ratio,
        temp_c: temp,
        grind_band: band,
        grind_setting: grind?.value ?? null,
        grind_format: Grind.format(ctx.grinder, grind?.value),
        total_time_s: steps[steps.length - 1]?.target_end_s ?? recipe.targets.total_time_s
      },
      steps
    };
  },

  /** 대기 구간만 비율로 줄입니다. 붓는 시간은 물량이 같으므로 그대로 둡니다. */
  scaleIntervals(steps, scale) {
    let shift = 0;
    return steps.map(s => {
      const out = { ...s };
      if (out.start_s != null) out.start_s = Math.round(out.start_s + shift);
      if (out.wait_s != null) {
        const nw = Math.round(out.wait_s * scale);
        shift += nw - out.wait_s;
        out.wait_s = nw;
      }
      if (out.target_end_s != null) out.target_end_s = Math.round(out.target_end_s + shift);
      return out;
    });
  }
};

/* ══════════════════════════════════════════════════════════
   Engine — 진입점
   ══════════════════════════════════════════════════════════ */
const Engine = {
  /** 전체 레시피를 평가해 점수순으로 정렬 */
  recommend(recipes, ctx, limit = 10) {
    return recipes
      .map(r => {
        const s = Score.evaluate(r, ctx);
        const c = Convert.run(r, ctx);
        return { recipe: r, ...s, ...c, fit: Score.fit(s) };
      })
      .sort((a, b) => {
        const mm = (a.fit === 'mismatch') - (b.fit === 'mismatch');
        return mm || b.score - a.score || a.recipe.difficulty - b.recipe.difficulty;
      })
      .slice(0, limit);
  },

  /** 점수 항목 → 화면에 띄울 근거 목록 {type, key, vars} */
  reasons(result, ctx) {
    const out = [];
    const bd = k => result.breakdown.find(b => b.key === k);

    const br = bd('brewer');
    if (br.reason === 'exact')
      out.push({ type: 'ok', key: 'why.brewerExact', vars: { brewer: ctx.brewer?.id } });
    else if (br.reason === 'listed_compatible')
      out.push({ type: 'ok', key: 'why.brewerCompatible', vars: {} });
    else if (br.reason === 'same_geo_flow' || br.reason === 'same_geo')
      out.push({ type: 'warn', key: 'why.brewerSimilar', vars: {} });
    else
      out.push({ type: 'warn', key: 'why.brewerDifferent', vars: {} });

    const ro = bd('roast');
    if (ro.reason === 'exact') out.push({ type: 'ok', key: 'why.roastExact', vars: {} });
    else if (ro.distance >= 2) out.push({ type: 'warn', key: 'why.roastFar', vars: {} });

    const be = bd('bean');
    if (be.detail?.process) out.push({ type: 'ok', key: 'why.processMatch', vars: {} });
    if (be.detail?.flavorHit?.length)
      out.push({ type: 'ok', key: 'why.flavorMatch', vars: { n: be.detail.flavorHit.length } });

    const go = bd('goal');
    if (go.reason === 'match') out.push({ type: 'ok', key: 'why.goalMatch', vars: {} });
    else if (go.reason === 'miss') out.push({ type: 'warn', key: 'why.goalMiss', vars: {} });

    const df = bd('difficulty');
    if (df.reason === 'over') out.push({ type: 'warn', key: 'why.tooHard', vars: { over: df.detail.over } });

    if (bd('verified').reason === 'unverified')
      out.push({ type: 'warn', key: 'why.unverified', vars: {} });

    return out;
  }
};

/* 브라우저 · Node 양쪽 지원 */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Grind, Score, Convert, Engine, ROAST_ORDER, FLOW_ORDER, ROAST_BASELINE };
}
