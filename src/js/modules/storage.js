/* ============================================================================
 * modules/storage.js —— 图片持久化与开放图库检索
 *
 * 解决的核心问题：纯前端 Web 应用刷新后图片会丢失。
 * 方案：LocalStorage（用户上传图，Base64 压缩后持久化） + 内存缓存（维基图库在线图）。
 *
 * 【AI 协同说明】：引导 AI 采用 LocalStorage + Canvas 压缩方案；选手补充了
 *   JSON 解析容错、配额溢出提示、以及在线图库逐张限流拉取的边界约束。
 * ==========================================================================*/
window.MYX = window.MYX || {};

(function (MYX) {
  'use strict';

  var CONFIG = MYX.CONFIG;
  var K = CONFIG.STORAGE_KEYS;

  /** 用户上传图片缓存：{ [siteId]: dataURL } */
  var userImages = {};
  /** 在线图库图片缓存：{ [siteId]: url } */
  var wikiCache = {};

  /** 安全读取 LocalStorage（容错：数据损坏时不阻塞应用启动） */
  function readJSON(key) {
    try { return JSON.parse(localStorage.getItem(key) || '{}'); }
    catch (e) { return {}; }
  }

  userImages = readJSON(K.IMAGES);
  wikiCache = readJSON(K.WIKI);

  /**
   * 保存用户上传的图片
   * @param {string} id 非遗项目 id
   * @param {string} dataUrl 压缩后的 DataURL
   */
  function saveUserImage(id, dataUrl) {
    userImages[id] = dataUrl;
    try { localStorage.setItem(K.IMAGES, JSON.stringify(userImages)); }
    catch (e) { alert('图片过大，存储失败。建议单张图片小于 1MB。'); }
  }

  /** 缓存在线图库图片地址 */
  function saveWiki(id, url) {
    wikiCache[id] = url;
    try { localStorage.setItem(K.WIKI, JSON.stringify(wikiCache)); } catch (e) { /* 静默失败 */ }
  }

  /**
   * 从维基共享资源检索非遗实景图（CC 开放授权，规避版权风险）
   * @param {Object} site 非遗项目
   * @returns {Promise<string|null>} 图片地址或 null
   */
  async function fetchWikiImage(site) {
    if (wikiCache[site.id]) return wikiCache[site.id];

    var keyword = site.name + ' ' + site.city + ' 福建';
    var api = CONFIG.WIKI.API_BASE;
    var url = api + '?action=query&generator=search' +
      '&gsrsearch=' + encodeURIComponent(keyword) +
      '&gsrnamespace=6&gsrlimit=' + CONFIG.WIKI.SEARCH_LIMIT +
      '&prop=imageinfo&iiprop=url&iiurlwidth=' + CONFIG.WIKI.THUMB_WIDTH +
      '&format=json&origin=*';

    try {
      var resp = await fetch(url);
      var data = await resp.json();
      var pages = data.query && data.query.pages;
      if (!pages) return null;

      // 过滤掉图标 / logo 等无关素材，仅保留位图
      var list = Object.values(pages).filter(function (x) {
        var t = x.title.toLowerCase();
        return (t.endsWith('.jpg') || t.endsWith('.jpeg') || t.endsWith('.png')) &&
          !t.includes('icon') && !t.includes('logo');
      });
      if (!list.length) return null;

      var imageUrl = list[0].imageinfo && list[0].imageinfo[0] && list[0].imageinfo[0].thumburl;
      if (imageUrl) { saveWiki(site.id, imageUrl); return imageUrl; }
    } catch (e) { /* 网络异常降级为无图 */ }
    return null;
  }

  /** 统一取图入口：用户上传优先，其次在线图库 */
  function getImage(id) { return userImages[id] || wikiCache[id] || null; }

  MYX.Store = {
    userImages: userImages,
    wikiCache: wikiCache,
    saveUserImage: saveUserImage,
    saveWiki: saveWiki,
    fetchWikiImage: fetchWikiImage,
    getImage: getImage
  };
})(window.MYX);
