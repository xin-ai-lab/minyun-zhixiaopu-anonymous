/* ============================================================================
 * config.js —— 全局配置中心（含环境变量注入机制）
 *
 * 设计目标：
 *   1. 集中管理可变参数（地图瓦片、图片检索接口、算法超参、AI 接口），避免硬编码散落各处；
 *   2. 敏感信息（API Key 等）绝不写入源码。构建时由 scripts/generate-env.js
 *      读取项目根目录的 .env 文件，生成 src/js/env.generated.js（已在 .gitignore 中忽略），
 *      运行期通过 window.__MYX_ENV__ 读取；
 *   3. .env 缺失时自动回退到「公开安全默认值」，保证仓库克隆后开箱即用。
 * ==========================================================================*/
window.MYX = window.MYX || {};

(function (MYX) {
  'use strict';

  /** 运行期环境变量（由 env.generated.js 注入，缺省为空对象） */
  var ENV = window.__MYX_ENV__ || {};

  /**
   * 全局配置对象
   * @namespace MYX.CONFIG
   */
  var CONFIG = {
    /* ---- 应用元信息 ---- */
    APP_NAME: ENV.APP_NAME || '闽韵智小铺',
    APP_SUBTITLE: ENV.APP_SUBTITLE || '福建非遗智能科普助手',
    VERSION: '1.0.0',

    /* ---- 团队信息（用于 README / 关于页展示） ---- */
    TEAM: {
      AUTHOR: 'Project Contributors',



      TRACK: 'AI 创新运用赛道（个人赛道）',

    },

    /* ---- 地图：高德路网瓦片（国内访问稳定，无需密钥） ---- */
    MAP: {
      TILE_URL: ENV.MAP_TILE_URL ||
        'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
      SUBDOMAINS: ['1', '2', '3', '4'],
      MIN_ZOOM: 5,
      MAX_ZOOM: 18,
      CENTER: [26.0, 118.5],
      INIT_ZOOM: 7
    },

    /* ---- 图片检索：维基共享资源开放 API（CC 授权，规避版权风险） ---- */
    WIKI: {
      API_BASE: ENV.WIKI_API_BASE || 'https://commons.wikimedia.org/w/api.php',
      SEARCH_LIMIT: 3,
      THUMB_WIDTH: 600,
      /** 逐张拉取的间隔（毫秒），避免触发接口限流 */
      FETCH_INTERVAL: 150
    },

    /* ---- 本地图片压缩参数 ---- */
    IMAGE: {
      /** 最长边上限（像素），超出则等比缩放 */
      MAX_EDGE: 800,
      /** JPEG 导出质量 */
      QUALITY: 0.85
    },

    /* ---- LocalStorage 键名（带版本号，便于数据结构升级） ---- */
    STORAGE_KEYS: {
      IMAGES: 'fj_imgs_v4',
      WIKI: 'fj_wiki_v4'
    },

    /* ---- RAG 检索增强问答超参 ---- */
    RAG: {
      /** 模拟向量检索的「思考」时长（毫秒） */
      THINK_DELAY: 1200,
      /** 单次返回的最大结果数 */
      TOP_K: 3
    },

    /* ---- 智能路线规划（贪心算法）超参 ---- */
    PLANNER: {
      /** 出发时间：上午 9:00（分钟） */
      START_MINUTES: 9 * 60,
      /** 单点游玩时长（分钟） */
      VISIT_MINUTES: 90,
      /** 相邻两点间的交通缓冲（分钟） */
      TRAVEL_MINUTES: 30,
      /** 路线最大节点数，防止结果溢出 */
      MAX_STOPS: 4,
      /** 贪心起点锚点（泉州高甲戏院），格式 [经度, 纬度] */
      ANCHOR: [118.675, 24.874]
    },

    /* ---- 可选：接入在线大模型（默认关闭，走本地规则引擎） ---- */
    AI: {
      ENABLED: Boolean(ENV.AI_API_BASE && ENV.AI_API_KEY),
      API_BASE: ENV.AI_API_BASE || '',
      API_KEY: ENV.AI_API_KEY || '',
      MODEL: ENV.AI_MODEL || 'deepseek-chat',
      TIMEOUT: 20000
    }
  };

  MYX.CONFIG = CONFIG;
})(window.MYX);
