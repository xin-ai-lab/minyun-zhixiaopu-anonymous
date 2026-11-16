/* ============================================================================
 * modules/planner.js —— 智能路线规划与时间调度引擎
 *
 * 【核心算法：贪心最近邻（Greedy Nearest Neighbor）】
 *   给定候选景点集合与出发点锚点，每一步都选择「距离当前位置最近」的未访问节点，
 *   直到遍历完毕。时间复杂度 O(n²)，在本场景（n ≤ 4）下性能与效果俱佳，
 *   能在毫秒级给出接近最优的游览顺序。
 *
 * 【AI 协同说明】：Prompt 引导 AI 生成初版贪心骨架：
 *   "请用原生 JS 写一个贪心算法，计算多个经纬度点之间的最短距离，
 *    并生成从早上 9 点开始、每点游玩 90 分钟的时间轴。"
 * 【关键人工干预】：AI 初版未计入景点间车程，导致时间轴严重偏乐观；
 *   选手在迭代中加入 TRAVEL_MINUTES（30 分钟）交通缓冲，修复时间戳进位格式，
 *   并增加 MAX_STOPS 上限与空集合保护，避免结果溢出与 NaN。
 * ==========================================================================*/
window.MYX = window.MYX || {};

(function (MYX) {
  'use strict';

  var CONFIG = MYX.CONFIG;
  var EARTH_KM_PER_DEG = 111; // 1 纬度 ≈ 111km，用于粗估里程

  /** 两点欧氏距离（度），本场景用于排序足够精确 */
  function euclid(lng1, lat1, lng2, lat2) {
    var dx = lng1 - lng2;
    var dy = lat1 - lat2;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /** 分钟数 -> "HH:MM" */
  function fmt(minutes) {
    var h = Math.floor(minutes / 60);
    var m = minutes % 60;
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  }

  /**
   * 为指定地市规划半日游路线
   * @param {string} city 地市名（如 '泉州'）
   * @param {Object} [options] 覆盖默认配置
   * @returns {Object|null} 规划结果，null 表示该地市无数据
   */
  function plan(city, options) {
    var opt = Object.assign({}, CONFIG.PLANNER, options || {});
    var pool = MYX.SITES.filter(function (s) { return s.city === city; }).slice(0, opt.MAX_STOPS);
    if (!pool.length) return null;

    // ---- 贪心选点 ----
    var anchor = opt.ANCHOR;
    var current = [anchor[0], anchor[1]];
    var route = [];
    var remaining = pool.slice();

    while (remaining.length > 0) {
      var nearestIdx = 0;
      var minDist = Infinity;
      for (var i = 0; i < remaining.length; i++) {
        var d = euclid(remaining[i].lng, remaining[i].lat, current[0], current[1]);
        if (d < minDist) { minDist = d; nearestIdx = i; }
      }
      var next = remaining.splice(nearestIdx, 1)[0];
      route.push(next);
      current = [next.lng, next.lat];
    }

    // ---- 生成时间轴 ----
    var startMins = opt.START_MINUTES;
    var cursor = startMins;
    var timeline = [];
    var totalDeg = 0;

    for (var j = 0; j < route.length; j++) {
      var arrive = cursor;
      var leave = arrive + opt.VISIT_MINUTES;
      timeline.push({
        index: j + 1,
        site: route[j],
        arrive: fmt(arrive),
        leave: fmt(leave)
      });
      cursor = leave + opt.TRAVEL_MINUTES; // 游玩 + 车程
    }

    // 累计直线里程（分段求和）
    for (var t = 1; t < route.length; t++) {
      totalDeg += euclid(route[t].lng, route[t].lat, route[t - 1].lng, route[t - 1].lat);
    }

    return {
      city: city,
      route: route,
      timeline: timeline,
      startTime: fmt(startMins),
      endTime: fmt(cursor - opt.TRAVEL_MINUTES),
      approxKm: (totalDeg * EARTH_KM_PER_DEG * Math.cos(route[0].lat * Math.PI / 180)).toFixed(1)
    };
  }

  MYX.Planner = { plan: plan, euclid: euclid, fmt: fmt };
})(window.MYX);
