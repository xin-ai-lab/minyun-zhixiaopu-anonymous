/* ============================================================================
 * modules/graph.js —— 知识图谱可视化（纯原生 SVG，零第三方图库）
 *
 * 【为什么自研 SVG 而非引入 ECharts / D3 / G6？】
 *   1. 本场景图谱规模固定且不大（≤ 30 节点），力导向布局的收益有限；
 *   2. 引入图库将增加约 300KB~1MB 体积与 CDN 依赖，牺牲了「开箱即用、离线可用」；
 *   3. 自研环形放射布局（Radial Layout）算法仅约 40 行，完全可控、可秒级渲染。
 *
 * 布局算法：中心节点居中，一级关联节点分布在内环，二级节点分布在外环，
 *   角度按节点数均分（i / n × 2π），保证任意节点数下都不重叠。
 * ==========================================================================*/
window.MYX = window.MYX || {};

(function (MYX) {
  'use strict';

  var CATS = MYX.CATS;
  var SITES = MYX.SITES;

  function el(id) { return document.getElementById(id); }

  /* ---------------- 图谱一：全局知识图谱（类别 -> 项目） ---------------- */
  function openGlobal() {
    var wrap = el('graphWrap');
    el('graphTitle').textContent = '福建非遗知识图谱';
    el('graphSub').textContent = SITES.length + ' 项非遗 · ' + Object.keys(CATS).length + ' 大类别 · 10 地市';

    var center = { id: 'root', label: '福建非遗', emoji: '🏮', color: '#8B2E2E' };
    var nodes = [];
    var links = [];

    Object.keys(CATS).forEach(function (k) {
      var c = CATS[k];
      var inCat = SITES.filter(function (x) { return x.cat === k; });
      if (!inCat.length) return;
      nodes.push({ id: 'cat_' + k, label: c.name + '(' + inCat.length + ')', emoji: c.emoji, color: c.color, ring: 'inner' });
      links.push({ source: 'root', target: 'cat_' + k, label: '分类' });
      inCat.slice(0, 3).forEach(function (x) {
        nodes.push({ id: x.id, label: x.name, emoji: c.emoji, color: c.color, ring: 'outer' });
        links.push({ source: 'cat_' + k, target: x.id, label: '' });
      });
    });

    wrap.innerHTML = renderSVG(center, nodes, links);
    el('graphModal').classList.add('show');
  }

  /* ---------------- 图谱二：以单个项目为中心的关系网 ---------------- */
  function openSite(siteId) {
    var s = SITES.find(function (x) { return x.id === siteId; });
    if (!s) { openGlobal(); return; }

    var wrap = el('graphWrap');
    var c = CATS[s.cat];
    el('graphTitle').textContent = s.name + ' · 知识图谱';
    el('graphSub').textContent = '以该项目为中心展示关联';

    var center = { id: s.id, label: s.name, emoji: c.emoji, color: c.color };
    var nodes = [];
    var links = [];

    if (s.inheritor && s.inheritor !== '—') {
      nodes.push({ id: 'i', label: s.inheritor, emoji: '👤', color: '#7D5BA6', ring: 'inner' });
      links.push({ source: s.id, target: 'i', label: '传承' });
    }
    nodes.push({ id: 'r', label: s.city, emoji: '📍', color: '#3A7D5C', ring: 'inner' });
    links.push({ source: s.id, target: 'r', label: '地域' });

    SITES.filter(function (x) { return x.cat === s.cat && x.id !== s.id; }).slice(0, 3).forEach(function (x) {
      nodes.push({ id: x.id, label: x.name, emoji: c.emoji, color: c.color, ring: 'outer' });
      links.push({ source: s.id, target: x.id, label: '同类' });
    });

    wrap.innerHTML = renderSVG(center, nodes, links);
    el('graphModal').classList.add('show');
  }

  /** 对外统一入口 */
  function open(siteId) {
    if (siteId) openSite(siteId); else openGlobal();
  }

  function close() { el('graphModal').classList.remove('show'); }

  /**
   * 环形放射布局 + SVG 生成（纯函数，便于单测）
   * @param {Object} center 中心节点
   * @param {Array} nodes 其余节点（含 ring: 'inner' | 'outer'）
   * @param {Array} links 边
   * @returns {string} SVG 字符串
   */
  function renderSVG(center, nodes, links) {
    var W = 860, H = 480, cx = W / 2, cy = H / 2;
    var pos = {};
    pos[center.id] = { x: cx, y: cy };

    var inner = nodes.filter(function (n) { return n.ring === 'inner'; });
    var outer = nodes.filter(function (n) { return n.ring === 'outer'; });

    inner.forEach(function (n, i) {
      var a = (i / Math.max(inner.length, 1)) * Math.PI * 2 - Math.PI / 2;
      pos[n.id] = { x: cx + Math.cos(a) * 150, y: cy + Math.sin(a) * 150 };
    });
    outer.forEach(function (n, i) {
      var a = (i / Math.max(outer.length, 1)) * Math.PI * 2 - Math.PI / 2 + 0.3;
      pos[n.id] = { x: cx + Math.cos(a) * 215, y: cy + Math.sin(a) * 215 };
    });

    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="非遗知识图谱">';

    // 先画边，保证节点覆盖在连线之上
    links.forEach(function (l) {
      var a = pos[l.source], b = pos[l.target];
      if (!a || !b) return;
      var strong = (l.source === center.id || l.target === center.id);
      svg += '<line class="link-line ' + (strong ? 'strong' : '') + '" x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '"/>';
      if (l.label) {
        svg += '<text class="link-label" x="' + ((a.x + b.x) / 2) + '" y="' + ((a.y + b.y) / 2 - 4) + '">' + l.label + '</text>';
      }
    });

    // 再画节点
    [center].concat(nodes).forEach(function (n) {
      var p = pos[n.id];
      if (!p) return;
      var isCenter = n.id === center.id;
      var isCat = n.id.indexOf('cat_') === 0;
      var r = isCenter ? 40 : (isCat ? 26 : 20);
      var fs = isCenter ? 26 : (isCat ? 16 : 13);
      svg += '<circle cx="' + p.x + '" cy="' + p.y + '" r="' + r + '" fill="' + n.color + '" opacity="' + (isCenter ? 1 : 0.88) + '" stroke="#fff" stroke-width="3"/>';
      svg += '<text x="' + p.x + '" y="' + (p.y + fs * 0.32) + '" font-size="' + fs + '" text-anchor="middle">' + n.emoji + '</text>';
      svg += '<text class="node-label" x="' + p.x + '" y="' + (p.y + r + 14) + '">' + n.label + '</text>';
    });

    return svg + '</svg>';
  }

  MYX.Graph = { open: open, openGlobal: openGlobal, openSite: openSite, close: close, renderSVG: renderSVG };
})(window.MYX);
