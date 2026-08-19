/* ══════════════════════════════════════════════════════════
   Special Coffee Wiki — 추출 가이드 (Phase 1c)

   BrewPlan   레시피 steps → 타임라인 정규화 및 조회  (순수 함수, 테스트 가능)
   Alerts     진동 · 소리                              (부수효과)
   WakeLock   화면 꺼짐 방지                            (부수효과)
   BrewSession 타이머 상태 관리                         (부수효과)

   설계 전제 (docs/02-design-system.md 원칙 5)
     이 화면은 "손에 주전자를 들고 있는 상태"에서 씁니다.
     따라서 조작을 최소화하고, 화면을 보지 않아도 진동과 소리로
     다음 단계를 알 수 있어야 합니다.
   ══════════════════════════════════════════════════════════ */
'use strict';

/* ══════════════════════════════════════════════════════════
   BrewPlan — 순수 함수
   ══════════════════════════════════════════════════════════ */
const BrewPlan = {
  /**
   * 레시피 steps를 타임라인으로 정규화합니다.
   *
   *   prep      타이머 시작 전에 하는 것 (예열 등). start_s가 없는 단계
   *   timeline  타이머가 순회하는 단계. startS 오름차순
   *
   * 각 단계의 endS는 "다음 단계 시작 시각"입니다.
   * 마지막 단계는 target_end_s를, 그것도 없으면 pour+wait 합을 씁니다.
   */
  build(steps) {
    const prep = [];
    const raw = [];

    for (const s of steps || []) {
      if (s.start_s == null && s.target_end_s == null) prep.push(s);
      else raw.push(s);
    }
    raw.sort((a, b) => (a.start_s ?? Infinity) - (b.start_s ?? Infinity));

    /* start_s 없이 target_end_s만 있는 단계(주로 드로우다운)의 시작 시각을 채웁니다.
       그대로 두면 startS = target_end_s가 되어 "끝나는 순간 시작"하는 꼴이 되고,
       화면에 한 프레임도 뜨지 않습니다. 앞 단계가 자연히 끝나는 시각을 시작으로 봅니다. */
    const startOf = [];
    for (let i = 0; i < raw.length; i++) {
      const s = raw[i];
      if (s.start_s != null) { startOf[i] = s.start_s; continue; }
      const prev = raw[i - 1];
      const prevStart = prev ? startOf[i - 1] : 0;
      const prevNatural = prev ? prevStart + (prev.pour_s || 0) + (prev.wait_s || 0) : 0;
      startOf[i] = Math.min(prevNatural, s.target_end_s);
    }

    const timeline = raw.map((s, i) => {
      const startS = startOf[i];
      const next = raw[i + 1];
      const own = s.target_end_s ?? (startS + (s.pour_s || 0) + (s.wait_s || 0));
      const endS = next ? startOf[i + 1] : own;
      return {
        index: i,
        type: s.type,
        startS,
        endS: Math.max(endS, startS),
        pourS: s.pour_s || 0,
        waitS: s.wait_s || 0,
        cumulativeG: s.cumulative_g ?? null,
        style: s.style ?? null,
        note: s.note ?? null,
        removeAtS: s.remove_at_s ?? null
      };
    });

    return {
      prep,
      timeline,
      totalS: timeline.length ? timeline[timeline.length - 1].endS : 0
    };
  },

  /**
   * 경과 t초 시점의 상태를 조회합니다.
   * @returns {{i, step, next, phase, toNext, progress, done}}
   *   phase    'pouring' | 'waiting'   붓는 중인지 기다리는 중인지
   *   toNext   다음 단계 시작까지 남은 초 (마지막이면 종료까지)
   */
  at(plan, t) {
    const tl = plan.timeline;
    if (!tl.length) return { i: -1, step: null, next: null, phase: 'waiting', toNext: 0, progress: 0, done: true };

    let i = 0;
    while (i < tl.length - 1 && t >= tl[i + 1].startS) i++;

    const step = tl[i];
    const next = tl[i + 1] || null;
    const boundary = next ? next.startS : step.endS;

    return {
      i,
      step,
      next,
      phase: t < step.startS + step.pourS ? 'pouring' : 'waiting',
      toNext: Math.max(0, Math.ceil(boundary - t)),
      progress: plan.totalS > 0 ? Math.min(1, t / plan.totalS) : 0,
      done: !next && t >= step.endS
    };
  },

  /** 화면에 띄울 "이번 단계 목표 누적 물량". 값이 없는 단계는 직전 값을 물려받습니다. */
  targetAt(plan, i) {
    const tl = plan.timeline;
    for (let k = Math.min(i, tl.length - 1); k >= 0; k--) {
      if (tl[k]?.cumulativeG != null) return tl[k].cumulativeG;
    }
    return null;
  },

  mmss(s) {
    if (s == null || !isFinite(s)) return '—';
    const v = Math.max(0, Math.floor(s));
    return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;
  }
};

/* ══════════════════════════════════════════════════════════
   Alerts — 진동 · 소리
   시각·청각·촉각 3중으로 알립니다. 하나만 쓰면 놓칩니다.
   ══════════════════════════════════════════════════════════ */
const Alerts = {
  enabled: true,
  ctx: null,

  /** 오디오는 사용자 제스처 안에서 만들어야 자동재생 정책에 걸리지 않습니다 */
  arm() {
    if (this.ctx || !this.enabled) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) { this.ctx = new AC(); this.ctx.resume?.(); }
    } catch (e) { /* 소리 없이 진행 */ }
  },

  beep(freq = 880, ms = 90, gain = 0.05) {
    if (!this.enabled || !this.ctx) return;
    try {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'sine'; o.frequency.value = freq;
      g.gain.value = gain;
      o.connect(g); g.connect(this.ctx.destination);
      const now = this.ctx.currentTime;
      o.start(now);
      // 뚝 끊기면 클릭음이 나므로 짧게 감쇠시킵니다
      g.gain.setValueAtTime(gain, now + ms / 1000 - 0.02);
      g.gain.linearRampToValueAtTime(0, now + ms / 1000);
      o.stop(now + ms / 1000);
    } catch (e) { /* noop */ }
  },

  vibrate(pattern) {
    if (!this.enabled) return;
    try { navigator.vibrate?.(pattern); } catch (e) { /* noop */ }
  },

  countdown() { this.beep(660, 70); this.vibrate(40); },
  stepChange() { this.beep(990, 140, 0.07); this.vibrate([0, 90, 60, 90]); },
  finish() { this.beep(1320, 260, 0.07); this.vibrate([0, 140, 80, 140, 80, 220]); }
};

/* ══════════════════════════════════════════════════════════
   WakeLock — 추출 3분 동안 화면이 꺼지면 안 됩니다
   ══════════════════════════════════════════════════════════ */
const WakeLock = {
  lock: null,

  async acquire() {
    try {
      if ('wakeLock' in navigator) {
        this.lock = await navigator.wakeLock.request('screen');
        // 탭을 벗어났다 돌아오면 해제되므로 다시 잡습니다
        this.lock.addEventListener?.('release', () => { this.lock = null; });
        return true;
      }
    } catch (e) { /* 사용자가 거부했거나 미지원 */ }
    return false;
  },

  async release() {
    try { await this.lock?.release?.(); } catch (e) { /* noop */ }
    this.lock = null;
  },

  get active() { return !!this.lock; }
};

/* ══════════════════════════════════════════════════════════
   BrewSession — 타이머

   경과 시간은 절대 시각(Date.now) 기준으로 계산합니다.
   requestAnimationFrame 누적으로 재면 탭이 백그라운드로 갔다 오는 동안
   프레임이 멈춰 시간이 어긋납니다.
   ══════════════════════════════════════════════════════════ */
class BrewSession {
  constructor(plan, onTick) {
    this.plan = plan;
    this.onTick = onTick;
    this.startedAt = null;     // epoch ms
    this.pausedAt = null;      // 일시정지 시점의 경과 초
    this.raf = null;
    this.lastIndex = -1;
    this.lastCountdown = null;
    this.marks = [];           // 실제 단계 전환 시각 — Phase 1d 로그로 넘깁니다
    this.finished = false;
  }

  get elapsed() {
    if (this.pausedAt != null) return this.pausedAt;
    if (this.startedAt == null) return 0;
    return (Date.now() - this.startedAt) / 1000;
  }

  get paused() { return this.pausedAt != null; }

  start() {
    Alerts.arm();
    this.startedAt = Date.now();
    this.pausedAt = null;
    this.finished = false;
    this.marks = [{ index: 0, atS: 0, auto: true }];
    this.lastIndex = 0;
    this.loop();
  }

  pause() {
    if (this.paused || this.startedAt == null) return;
    this.pausedAt = this.elapsed;
    cancelAnimationFrame(this.raf);
    this.onTick?.(this.state());
  }

  resume() {
    if (!this.paused) return;
    this.startedAt = Date.now() - this.pausedAt * 1000;
    this.pausedAt = null;
    this.loop();
  }

  /** 다음 단계로 앞당깁니다.
      스케줄대로 두면 자동 진행되지만, 목표 물량을 일찍 채웠을 때 기다릴 필요가 없습니다.
      누른 시각을 marks에 남겨 실제 추출 기록으로 씁니다. */
  skipToNext() {
    const st = BrewPlan.at(this.plan, this.elapsed);
    if (!st.next) { this.finish(); return; }
    const actual = this.elapsed;
    this.startedAt = Date.now() - st.next.startS * 1000;
    if (this.paused) this.pausedAt = st.next.startS;
    this.marks.push({ index: st.next.index, atS: round1(actual), auto: false });
    this.lastIndex = st.next.index;
    Alerts.stepChange();
    this.onTick?.(this.state());
  }

  finish() {
    if (this.finished) return;
    this.finished = true;
    cancelAnimationFrame(this.raf);
    Alerts.finish();
    this.onTick?.(this.state());
  }

  stop() { cancelAnimationFrame(this.raf); }

  loop() {
    const tick = () => {
      if (this.paused || this.finished) return;
      const s = this.state();

      // 단계 전환 알림
      if (s.i !== this.lastIndex) {
        this.lastIndex = s.i;
        this.marks.push({ index: s.i, atS: round1(s.t), auto: true });
        Alerts.stepChange();
        this.lastCountdown = null;
      }

      // 3 · 2 · 1초 전 카운트다운 — 매초 한 번만
      if (s.toNext > 0 && s.toNext <= 3 && s.toNext !== this.lastCountdown) {
        this.lastCountdown = s.toNext;
        Alerts.countdown();
      }
      if (s.toNext > 3) this.lastCountdown = null;

      if (s.done) { this.finish(); return; }

      this.onTick?.(s);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  state() {
    const t = this.elapsed;
    const at = BrewPlan.at(this.plan, t);
    return { ...at, t, paused: this.paused, finished: this.finished };
  }
}

const round1 = v => Math.round(v * 10) / 10;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { BrewPlan, Alerts, WakeLock, BrewSession };
}
