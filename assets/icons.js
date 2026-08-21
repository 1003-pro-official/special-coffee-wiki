/* ══════════════════════════════════════════════════════════
   Special Coffee Wiki — 드리퍼 형태 아이콘

   왜 사진이 아니라 선화인가
     1) 제조사 제품 사진은 저작권이 있어 쓸 수 없습니다.
     2) 이 프로젝트의 디자인 방향이 "계측기"입니다. 사진은 배경·조명·재질이
        같이 들어와 정보 밀도를 떨어뜨립니다.
     3) 형태만 남기면 오히려 구분이 쉽습니다. 사용자가 알아야 할 것은
        "원뿔이냐 평바닥이냐, 구멍이 크냐 작냐"이지 색이나 브랜드 로고가 아닙니다.
     4) stroke를 currentColor로 두면 다크 모드가 저절로 따라옵니다.

   좌표계는 40×40이고 stroke만 씁니다(fill 없음).
   ══════════════════════════════════════════════════════════ */
'use strict';

const BrewerIcon = {
  /* 형태별 path.
     작은 크기에서 읽히려면 선이 적어야 합니다. 처음엔 리브를 여러 개 그렸는데
     40px 안에서 선 6개가 겹쳐 뭉개졌습니다.
     지금은 "닫힌 실루엣 1개 + 특징 선 최대 2개" 원칙으로 다시 그렸습니다. */
  SHAPES: {
    /* 원뿔 · 큰 배출구 · 나선 리브 (V60 계열)
       나선은 곡선으로 그려야 직선 리브를 쓰는 다른 원뿔과 구분됩니다 */
    cone: [
      'M4 9 H36 L22.5 30 H17.5 Z',
      'M12 12 Q20 19 20 29',
      'M28 12 Q20 19 20 29'
    ],

    /* 원뿔 · 세로 주름 (오리가미 · 카페크) — 직선 주름 */
    flute: [
      'M4 9 H36 L22.5 30 H17.5 Z',
      'M12 11 L16.5 29',
      'M20 10 V30',
      'M28 11 L23.5 29'
    ],

    /* 사다리꼴 · 작은 배출구 (멜리타)
       바닥이 좁고 한 방울씩 떨어지는 것으로 느린 유속을 표현 */
    cone_small: [
      'M7 9 H33 L21 30 H19 Z',
      'M20 33 V36'
    ],

    /* 평바닥 · 배출구 3개 (칼리타 웨이브) */
    flat3: [
      'M5 10 H35 L27 28 H13 Z',
      'M12 17 H28',
      'M17 30 V33', 'M20 30 V33', 'M23 30 V33'
    ],

    /* 평바닥 · 큰 단일 배출구 (오레아 · 스태그) */
    flat1: [
      'M4 11 H36 L28 27 H12 Z',
      'M15 30 H25'
    ],

    /* 밸브형 (하리오 스위치 · 클레버) */
    valve: [
      'M5 9 H35 L22 28 H18 Z',
      'M22.5 28 L29 32',
      'M17 31 H23'
    ],

    /* 모래시계 · 일체형 (케멕스) */
    hourglass: [
      'M9 5 H31 L22 19 L27 34 H13 L18 19 Z',
      'M16 14 H24'
    ],

    /* 가압 (에어로프레스) */
    press: [
      'M14 14 H26 V33 H14 Z',
      'M20 4 V14',
      'M15 4 H25'
    ]
  },

  /** brewer 객체 → 형태 키. icon 필드가 있으면 그것을, 없으면 구조에서 추정합니다. */
  shapeOf(brewer) {
    if (!brewer) return 'cone';
    if (brewer.icon && this.SHAPES[brewer.icon]) return brewer.icon;

    // 폴백 — 카탈로그에 icon이 빠져도 형태가 나오게
    if (brewer.geometry === 'pressure_immersion') return 'press';
    if (brewer.geometry === 'immersion' || brewer.geometry === 'hybrid_immersion') return 'valve';
    if (brewer.geometry === 'flat') return (brewer.hole?.count ?? 1) >= 3 ? 'flat3' : 'flat1';
    return (brewer.hole?.diameter_mm ?? 20) < 10 ? 'cone_small' : 'cone';
  },

  /**
   * SVG 문자열을 반환합니다.
   * @param brewer  brewers.json 항목
   * @param size    표시 크기(px)
   * @param label   접근성용 이름 (aria-label)
   */
  svg(brewer, size = 40, label = '') {
    const paths = this.SHAPES[this.shapeOf(brewer)] || this.SHAPES.cone;
    return `<svg class="dripper-icon" width="${size}" height="${size}" viewBox="0 0 40 40"
      fill="none" stroke="currentColor" stroke-width="1.8"
      stroke-linecap="round" stroke-linejoin="round"
      role="img" aria-label="${label}" focusable="false">
      ${paths.map(d => `<path d="${d}"/>`).join('')}
    </svg>`;
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { BrewerIcon };
}
