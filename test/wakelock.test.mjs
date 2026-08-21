/* WakeLock — 화면 꺼짐 방지 재획득

   여기서 검증하려는 실제 사고:
     추출 도중에 알림을 확인하러 나갔다 돌아오면, 브라우저가 잠금을 이미
     풀어놓은 상태입니다. 그리고 스스로 복구하지 않습니다.
     돌아왔을 때 다시 잡히는지가 핵심입니다.

   브라우저를 흉내 내는 스텁을 씁니다 — 숨김 상태가 되면 잠금을 강제 해제하고
   release 이벤트를 쏘는 것까지 실제 동작을 따라합니다. */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

let fail = 0, n = 0;
const ok = (c, m) => { n++; console.log((c ? '  OK   ' : '  ★NG  ') + m); if (!c) fail++; };
const eq = (a, b, m) => ok(a === b, `${m}  →  ${JSON.stringify(a)}${a === b ? '' : ' (기대 ' + JSON.stringify(b) + ')'}`);

/* ── 브라우저 스텁 ───────────────────────────────── */
const Browser = {
  listeners: [],
  visibility: 'visible',
  granted: true,          // 잠금 요청을 허용할 것인가
  requests: 0,
  live: null,

  reset() {
    this.listeners = []; this.visibility = 'visible';
    this.granted = true; this.requests = 0; this.live = null;
  },

  install() {
    const self = this;
    const def = (name, value) =>
      Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });

    def('document', {
      get visibilityState() { return self.visibility; },
      addEventListener(type, fn) { if (type === 'visibilitychange') self.listeners.push(fn); }
    });

    def('navigator', {
      wakeLock: {
        async request() {
          self.requests++;
          if (!self.granted) throw new Error('거부됨');
          const handlers = [];
          const lock = {
            released: false,
            addEventListener(type, fn) { if (type === 'release') handlers.push(fn); },
            async release() { this.released = true; handlers.forEach(f => f()); },
            _fire() { this.released = true; handlers.forEach(f => f()); }
          };
          self.live = lock;
          return lock;
        }
      }
    });
  },

  /** 탭이 백그라운드로 감 — 브라우저가 잠금을 강제로 풉니다 */
  hide() {
    this.visibility = 'hidden';
    this.live?._fire();
    this.live = null;
    return this.fire();
  },

  show() { this.visibility = 'visible'; return this.fire(); },

  /** 리스너는 async라서 결과를 기다려야 합니다 */
  async fire() { for (const f of this.listeners) await f(); }
};

Browser.install();
const { WakeLock } = require('../assets/brew.js');

const fresh = () => {
  Browser.reset();
  WakeLock.lock = null; WakeLock.wanted = false;
  WakeLock.onChange = null; WakeLock._bound = false;
  Browser.install();
};

/* ── 1. 기본 동작 ───────────────────────────────── */
console.log('\n════ 획득과 해제 ════');
{
  fresh();
  ok(WakeLock.supported(), 'wakeLock이 있으면 지원으로 판정');
  const got = await WakeLock.acquire();
  eq(got, true, '획득 성공');
  eq(WakeLock.active, true, 'active = true');
  eq(WakeLock.wanted, true, 'wanted = true (추출 중 표시)');
  eq(Browser.requests, 1, '요청 1회');

  await WakeLock.acquire();
  eq(Browser.requests, 1, '이미 잡혀 있으면 다시 요청하지 않음');

  await WakeLock.release();
  eq(WakeLock.active, false, '해제하면 active = false');
  eq(WakeLock.wanted, false, '해제하면 wanted = false');
}

/* ── 2. 이 커밋의 핵심 ──────────────────────────── */
console.log('\n════ 백그라운드 왕복 (핵심) ════');
{
  fresh();
  await WakeLock.acquire();
  eq(WakeLock.active, true, '추출 시작 — 잠금 있음');

  await Browser.hide();
  eq(WakeLock.active, false, '탭을 벗어나면 브라우저가 잠금을 풂');
  eq(WakeLock.wanted, true, '그래도 "원하는 상태"는 유지 — 이게 재획득의 근거');

  await Browser.show();
  eq(WakeLock.active, true, '★ 돌아오면 다시 잡힘 (이게 없으면 화면이 꺼짐)');
  eq(Browser.requests, 2, '요청 2회 = 최초 + 재획득');
}

console.log('\n════ 여러 번 왕복해도 계속 살아남는가 ════');
{
  fresh();
  await WakeLock.acquire();
  for (let i = 0; i < 5; i++) { await Browser.hide(); await Browser.show(); }
  eq(WakeLock.active, true, '5회 왕복 후에도 잠금 유지');
  eq(Browser.requests, 6, '최초 1 + 재획득 5');
}

/* ── 3. 재획득하면 안 되는 경우 ─────────────────── */
console.log('\n════ 재획득하지 말아야 할 때 ════');
{
  fresh();
  await WakeLock.acquire();
  await WakeLock.release();
  const before = Browser.requests;
  await Browser.hide(); await Browser.show();
  eq(Browser.requests, before, '사용자가 껐으면(wanted=false) 돌아와도 다시 잡지 않음');
  eq(WakeLock.active, false, '꺼진 상태 유지');
}
{
  fresh();
  await WakeLock.acquire();
  const before = Browser.requests;
  await Browser.hide();
  eq(Browser.requests, before, '숨김 상태에서는 요청하지 않음 (어차피 브라우저가 거부)');
}
{
  fresh();
  await WakeLock.acquire();
  const before = Browser.requests;
  await Browser.show();   // 이미 visible인데 이벤트만 온 경우
  eq(Browser.requests, before, '잠금이 살아 있으면 중복 요청하지 않음');
}

/* ── 4. 리스너 누적 ─────────────────────────────── */
console.log('\n════ 리스너 누적 방지 ════');
{
  fresh();
  await WakeLock.acquire();
  await WakeLock.release();
  await WakeLock.acquire();
  await WakeLock.release();
  await WakeLock.acquire();
  eq(Browser.listeners.length, 1, 'acquire를 세 번 해도 visibilitychange 리스너는 1개');
}

/* ── 5. 실패 처리 ───────────────────────────────── */
console.log('\n════ 실패해도 앱이 죽지 않아야 함 ════');
{
  fresh();
  Browser.granted = false;
  const got = await WakeLock.acquire();
  eq(got, false, '거부되면 false 반환 (예외가 새어나가지 않음)');
  eq(WakeLock.active, false, 'active = false');
  eq(WakeLock.wanted, true, '의도는 남아 있어 — 다음 기회에 다시 시도');

  Browser.granted = true;
  await Browser.hide(); await Browser.show();
  eq(WakeLock.active, true, '거부됐다가 나중에 허용되면 복구됨');
}
{
  fresh();
  await WakeLock.acquire();
  const seen = [];
  WakeLock.onChange = (v) => seen.push(v);

  Browser.granted = false;
  await Browser.hide(); await Browser.show();
  eq(seen.length, 1, '재획득 실패도 onChange로 알림');
  eq(seen[0], false, '실패는 false로 — 버튼이 꺼짐 상태를 보여줘야 함');

  Browser.granted = true;
  await Browser.hide(); await Browser.show();
  eq(seen[1], true, '성공하면 true');
}
{
  fresh();
  const seen = [];
  WakeLock.onChange = (v) => seen.push(v);
  await WakeLock.acquire();
  eq(seen.length, 0, '최초 acquire는 onChange를 부르지 않음 (호출부가 반환값을 이미 씀)');
}

/* ── 6. 미지원 브라우저 ─────────────────────────── */
console.log('\n════ 미지원 환경 ════');
{
  fresh();
  Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true, writable: true });
  ok(!WakeLock.supported(), 'wakeLock이 없으면 미지원');
  const got = await WakeLock.acquire();
  eq(got, false, '미지원이면 조용히 false');
  await Browser.show();
  ok(true, '미지원 환경에서 visibilitychange가 와도 예외 없음');
  Browser.install();
}

console.log(`\n${fail ? '★ 실패 ' + fail + '건 / ' + n : '전체 통과 ' + n + '건'}`);
process.exit(fail ? 1 : 0);
