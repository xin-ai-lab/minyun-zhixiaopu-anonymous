/* ============================================================================
 * modules/rag.js —— RAG 检索增强问答引擎（本地轻量级知识库）
 *
 * 架构分层：
 *   ① 意图识别（Intent Routing）：先用关键词规则把用户问句路由到「功能型意图」
 *      （图谱 / 两岸 / 地市清单 / 全省概览），避免误触发大范围检索；
 *   ② 召回（Retrieval）：对剩余问句做「名称 + 标签 + 简介」三路关键词召回；
 *   ③ 排序截断（Rank）：按命中权重排序，取 Top-K 返回；
 *   ④ 生成（Generation）：由 UI 层将召回结果渲染为「非遗卡片」作答。
 *
 * 防幻觉策略：本引擎只从本地结构化知识库中「检索」事实，不做开放式生成，
 *   从而杜绝大模型常见的张冠李戴与事实编造问题；同时保留 AI.ENABLED 开关，
 *   可在配置在线大模型后把召回结果作为「唯一上下文」喂给模型润色（RAG 增强）。
 *
 * 【AI 协同说明】：引导 AI 产出检索与意图识别骨架；选手补充了标点清洗、
 *   多关键词权重排序、以及空结果的兜底引导话术。
 * ==========================================================================*/
window.MYX = window.MYX || {};

(function (MYX) {
  'use strict';

  var CONFIG = MYX.CONFIG;

  /** 清洗问句：去除标点与疑问词，提升关键词命中率 */
  function normalize(text) {
    return String(text).replace(/[？?。，,、！!\s]/g, '');
  }

  /**
   * 多路召回：名称 / 标签 / 简介 三路匹配，按权重排序
   * @param {string} keyword 关键词
   * @param {number} [limit] 返回上限
   * @returns {Array<Object>} 命中的非遗项目（已排序）
   */
  function search(keyword, limit) {
    limit = limit || CONFIG.RAG.TOP_K;
    var kw = String(keyword).trim();
    if (!kw) return [];

    var scored = [];
    MYX.SITES.forEach(function (s) {
      var score = 0;
      if (s.name.includes(kw)) score += 10;                       // 名称命中权重最高
      (s.tags || []).forEach(function (t) { if (t.includes(kw) || kw.includes(t)) score += 6; });
      if (s.brief.includes(kw)) score += 4;
      if (s.history && s.history.includes(kw)) score += 2;
      if (s.city === kw) score += 5;
      if (score > 0) scored.push({ site: s, score: score });
    });

    scored.sort(function (a, b) { return b.score - a.score; });
    return scored.slice(0, limit).map(function (x) { return x.site; });
  }

  /**
   * 意图识别与回答编排
   * @param {string} rawText 用户原始问句
   * @returns {{type:string, city?:string, keyword?:string, hits?:Array, count?:number}}
   */
  function parseIntent(rawText) {
    var text = rawText || '';
    var k = normalize(text);

    // ① 功能型意图：知识图谱
    if (k.includes('图谱') || k.includes('关系')) {
      return { type: 'graph' };
    }
    // ② 功能型意图：两岸对照
    if (k.includes('两岸') || k.includes('台湾') || k.includes('海峡')) {
      return { type: 'cross' };
    }
    // ③ 地市清单意图（含"哪些/非遗/推荐"等触发词）
    var city = MYX.CITIES.find(function (c) { return c !== '全部' && k.includes(c); });
    if (city && (k.includes('有哪些') || k.includes('非遗') || k.includes('推荐'))) {
      return {
        type: 'city-list',
        city: city,
        hits: MYX.SITES.filter(function (s) { return s.city === city; }).slice(0, 6),
        count: MYX.SITES.filter(function (s) { return s.city === city; }).length
      };
    }
    // ④ 全省概览意图
    if (k.includes('有哪些') || k === '非遗' || k.includes('都收录')) {
      return { type: 'overview', count: MYX.SITES.length };
    }
    // ⑤ 实体检索意图
    var keyword = text.replace(/[？?。，,\s在哪里体验怎么去怎么]/g, '');
    var hits = search(keyword, CONFIG.RAG.TOP_K);
    if (hits.length) return { type: 'search', keyword: keyword, hits: hits };

    // ⑥ 兜底
    return { type: 'fallback' };
  }

  MYX.RAG = {
    normalize: normalize,
    search: search,
    parseIntent: parseIntent
  };
})(window.MYX);
