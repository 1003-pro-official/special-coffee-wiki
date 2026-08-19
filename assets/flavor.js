/* ══════════════════════════════════════════════════════════
   Special Coffee Wiki — 플레이버 탐색 (Phase 3)

   FlavorTree  향미 계층 조회 · 원두 매칭   (순수 함수)
   Wheel       휠 섹터 SVG path 계산         (순수 함수)

   설계 전제 (docs/02-design-system.md P2)
     모바일에서 3중 링에 110개 노드를 그리면 터치 타깃이 5px가 됩니다.
     그래서 휠은 대분류 9개만 원형으로 그리고, 하위는 칩으로 드릴다운합니다.

   저작권
     SCA 공식 휠 이미지를 쓰지 않습니다. 좌표와 색상은 이 프로젝트에서
     직접 계산·정의한 것입니다. 자세한 내용은 flavor-nodes.json의 _meta 참조.
   ══════════════════════════════════════════════════════════ */
'use strict';

const FlavorTree = {
  /** id가 점 경로라 문자열만으로 조상 판별이 됩니다 */
  isDescendant(nodeId, ancestorId) {
    return nodeId === ancestorId || nodeId.startsWith(ancestorId + '.');
  },

  family(nodeId) { return nodeId.split('.')[0]; },

  children(nodes, parentId) {
    return nodes.filter(n => n.parent === parentId);
  },

  roots(nodes) { return nodes.filter(n => n.level === 1); },

  byId(nodes, id) { return nodes.find(n => n.id === id) || null; },

  /** 루트부터 해당 노드까지의 경로 */
  path(nodes, id) {
    const out = [];
    let cur = this.byId(nodes, id);
    while (cur) { out.unshift(cur); cur = cur.parent ? this.byId(nodes, cur.parent) : null; }
    return out;
  },

  /**
   * 선택한 향미로 원두를 거릅니다.
   *
   * 계층을 고려합니다 — 'fruity'를 고르면 'fruity.berry.blueberry'를 가진 원두도 걸립니다.
   * 상위를 골랐는데 하위 태그 원두가 안 나오면 사용자는 데이터가 없다고 오해합니다.
   *
   * @param mode 'or' 하나라도 포함 (탐색용) | 'and' 전부 포함 (정밀 검색용)
   */
  matchBeans(beans, selected, mode = 'or') {
    if (!selected || !selected.length) return beans;
    const hit = (bean, sel) => (bean.flavor_nodes || []).some(n => this.isDescendant(n, sel));
    return beans.filter(b => mode === 'and'
      ? selected.every(s => hit(b, s))
      : selected.some(s => hit(b, s)));
  },

  /** 원두가 선택 조건 중 어느 것에 걸렸는지 — 화면에서 근거를 보여주기 위함 */
  matchedNodes(bean, selected) {
    const out = [];
    for (const n of bean.flavor_nodes || []) {
      if (selected.some(s => this.isDescendant(n, s))) out.push(n);
    }
    return out;
  },

  /** 계열별 원두 수 — 휠에서 비어 있는 섹터를 흐리게 하는 데 씁니다 */
  countByFamily(beans, nodes) {
    const c = {};
    for (const r of this.roots(nodes)) c[r.id] = 0;
    for (const b of beans) {
      const fams = new Set((b.flavor_nodes || []).map(n => this.family(n)));
      for (const f of fams) if (f in c) c[f]++;
    }
    return c;
  }
};

/* ══════════════════════════════════════════════════════════
   Wheel — 도넛 섹터 좌표

   SVG에는 부채꼴 프리미티브가 없어서 path를 직접 계산합니다.
   ══════════════════════════════════════════════════════════ */
const Wheel = {
  /**
   * @param n     섹터 개수
   * @param opt   { cx, cy, r0, r1, gap }  gap은 섹터 사이 간격(라디안)
   * @returns [{ index, d, labelX, labelY, midAngle }]
   */
  sectors(n, opt = {}) {
    const { cx = 130, cy = 130, r0 = 42, r1 = 118, gap = 0.014 } = opt;
    const out = [];
    for (let i = 0; i < n; i++) {
      // 12시 방향에서 시작하도록 -90° 회전
      const a0 = (i / n) * 2 * Math.PI - Math.PI / 2 + gap;
      const a1 = ((i + 1) / n) * 2 * Math.PI - Math.PI / 2 - gap;
      const p = (r, a) => [
        Math.round((cx + r * Math.cos(a)) * 100) / 100,
        Math.round((cy + r * Math.sin(a)) * 100) / 100
      ];
      const [x1, y1] = p(r0, a0), [x2, y2] = p(r1, a0);
      const [x3, y3] = p(r1, a1), [x4, y4] = p(r0, a1);
      // 한 섹터가 반원을 넘으면 large-arc 플래그가 필요합니다 (섹터가 3개 이하일 때)
      const large = (a1 - a0) > Math.PI ? 1 : 0;
      const mid = (a0 + a1) / 2;
      const [lx, ly] = p((r0 + r1) / 2, mid);

      out.push({
        index: i,
        d: `M${x1} ${y1}L${x2} ${y2}A${r1} ${r1} 0 ${large} 1 ${x3} ${y3}L${x4} ${y4}A${r0} ${r0} 0 ${large} 0 ${x1} ${y1}Z`,
        labelX: lx, labelY: ly, midAngle: mid
      });
    }
    return out;
  },

  /** 라벨을 방사형으로 놓을 때의 회전각.
      아래쪽 절반이면 뒤집어야 거꾸로 읽히지 않습니다.
      경계 포함(>=)입니다 — 정확히 90°(6시 방향)도 뒤집어야 합니다.

      참고: 이 프로젝트의 휠은 라벨이 짧아(Sweet, Floral 등)
      방사형보다 수평이 읽기 쉬워 실제 화면에서는 회전을 쓰지 않습니다.
      라벨이 길어질 경우를 대비해 남겨둡니다. */
  labelRotation(midAngle) {
    const deg = midAngle * 180 / Math.PI;
    return (deg >= 90 || deg < -90) ? deg + 180 : deg;
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { FlavorTree, Wheel };
}
