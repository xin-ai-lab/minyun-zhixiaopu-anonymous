/* ============================================================================
 * modules/storage.js —— 图片持久化与开放图库检索
 *
 * 解决的核心问题：纯前端 Web 应用刷新后图片会丢失，同时浏览器对 LocalStorage
 *   有单源约 5MB 的硬配额，批量导入数十张照片时必然溢出。
 *
 * 最终方案（三级取图 + IndexedDB 持久化）：
 *   1. 用户上传照片 -> IndexedDB（配额按磁盘容量计，可容纳数百张照片）
 *   2. 内置实景图库 -> assets/sites/<项目id>.jpg（随包分发，见 data/gallery.js）
 *   3. 在线开放图库 -> 维基共享资源（CC 授权，仅作末位兜底）
 *
 * 【AI 协同说明 / 关键人工干预】：
 *   AI 初版把 Canvas 压缩后的 Base64 全部塞进 LocalStorage，虽然单张已压到
 *   约 60~120KB，但 48 张合计仍超过 5MB 单源配额，批量上传必然抛出
 *   QuotaExceededError（旧提示「建议单张图片小于 1MB」具有误导性，根因是总配额
 *   而非单张体积）。选手据此把持久层改为 IndexedDB，并保留旧数据的一次性迁移
 *   与不可用时的 LocalStorage 降级，从根上消除了该缺陷。
 * ==========================================================================*/
window.MYX = window.MYX || {};

(function (MYX) {
  'use strict';

  var CONFIG = MYX.CONFIG;
  var K = CONFIG.STORAGE_KEYS;
  var IDB_CFG = CONFIG.IDB;

  /** 用户上传图片缓存：{ [siteId]: dataURL }（内存镜像，供同步取图） */
  var userImages = {};
  /** 在线图库图片缓存：{ [siteId]: url } */
  var wikiCache = {};

  /** IndexedDB 句柄；不可用时为 null，自动降级回 LocalStorage */
  var db = null;
  var dbReady = false;
  /** 未落盘的写入计数，供批量上传等待全部完成 */
  var pending = 0;
  var flushWaiters = [];

  /** 内置图库索引（随包分发，优先于在线图库） */
  function galleryOf(id) {
    return (MYX.GALLERY && MYX.GALLERY[id]) || null;
  }

  /* ---------------- LocalStorage 小工具 ---------------- */

  function readLS(key) {
    try { return JSON.parse(localStorage.getItem(key) || '{}'); }
    catch (e) { return {}; }
  }

  /* ---------------- IndexedDB ---------------- */

  function openDB() {
    return new Promise(function (resolve) {
      if (!window.indexedDB) return resolve(null);
      var req;
      try { req = indexedDB.open(IDB_CFG.DB_NAME, IDB_CFG.DB_VERSION); }
      catch (e) { return resolve(null); }

      req.onupgradeneeded = function (e) {
        var d = e.target.result;
        if (!d.objectStoreNames.contains(IDB_CFG.STORE)) {
          d.createObjectStore(IDB_CFG.STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { resolve(null); };
      // 某些浏览器在 file:// 或隐私模式下会长时间挂起，做超时兜底
      setTimeout(function () { resolve(null); }, 3000);
    });
  }

  /** 读取全部已上传照片到内存镜像 */
  function loadAll() {
    return new Promise(function (resolve) {
      if (!db) return resolve(0);
      var out = 0;
      try {
        var tx = db.transaction(IDB_CFG.STORE, 'readonly');
        var req = tx.objectStore(IDB_CFG.STORE).openCursor();
        req.onsuccess = function (e) {
          var cur = e.target.result;
          if (cur) { userImages[cur.value.id] = cur.value.data; out++; cur.continue(); }
          else resolve(out);
        };
        req.onerror = function () { resolve(out); };
      } catch (e) { resolve(out); }
    });
  }

  /** 把旧版 LocalStorage 中的上传图迁移进 IndexedDB（只执行一次） */
  function migrateLegacy() {
    var legacy = readLS(K.IMAGES_LEGACY);
    var ids = Object.keys(legacy);
    if (!ids.length) return Promise.resolve(0);
    if (!db) {
      // IndexedDB 不可用：留在 LocalStorage 继续用
      ids.forEach(function (id) { userImages[id] = legacy[id]; });
      return Promise.resolve(0);
    }
    return Promise.all(ids.map(function (id) {
      if (userImages[id]) return null;
      userImages[id] = legacy[id];
      return putRecord(id, legacy[id]);
    })).then(function () {
      try { localStorage.removeItem(K.IMAGES_LEGACY); } catch (e) { /* 忽略 */ }
      return ids.length;
    });
  }

  function putRecord(id, data) {
    return new Promise(function (resolve, reject) {
      if (!db) return reject(new Error('idb-unavailable'));
      try {
        var tx = db.transaction(IDB_CFG.STORE, 'readwrite');
        tx.objectStore(IDB_CFG.STORE).put({ id: id, data: data, ts: Date.now() });
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { reject(tx.error || new Error('idb-write-failed')); };
        tx.onabort = function () { reject(tx.error || new Error('idb-abort')); };
      } catch (e) { reject(e); }
    });
  }

  /* ---------------- 保存 / 读取 ---------------- */

  /**
   * 保存用户上传的图片（内存立即可读，磁盘异步落库）
   * @param {string} id 非遗项目 id
   * @param {string} dataUrl 压缩后的 DataURL
   * @returns {Promise<boolean>} 是否成功持久化
   */
  function saveUserImage(id, dataUrl) {
    userImages[id] = dataUrl;

    if (!db) {
      // 降级：回退 LocalStorage（体积敏感，仅保证小批量可用）
      try {
        var ls = readLS(K.IMAGES_LEGACY);
        ls[id] = dataUrl;
        localStorage.setItem(K.IMAGES_LEGACY, JSON.stringify(ls));
        return Promise.resolve(true);
      } catch (e) {
        return Promise.resolve(false);
      }
    }

    pending++;
    return putRecord(id, dataUrl).then(function () {
      pending--;
      if (pending === 0) flushWaiters.splice(0).forEach(function (fn) { fn(); });
      return true;
    }).catch(function () {
      pending--;
      if (pending === 0) flushWaiters.splice(0).forEach(function (fn) { fn(); });
      return false;
    });
  }

  /** 等待所有异步写入落盘（批量上传结束时调用） */
  function flush() {
    if (pending === 0) return Promise.resolve(true);
    return new Promise(function (resolve) { flushWaiters.push(resolve); });
  }

  /** 缓存在线图库图片地址 */
  function saveWiki(id, url) {
    wikiCache[id] = url;
    try { localStorage.setItem(K.WIKI, JSON.stringify(wikiCache)); } catch (e) { /* 静默失败 */ }
  }

  /**
   * 统一取图入口（同步）
   * 优先级：用户上传 > 内置实景图库 > 在线图库
   */
  function getImage(id) {
    return userImages[id] || galleryOf(id) || wikiCache[id] || null;
  }

  /** 该图片是否来自用户的实拍上传 */
  function isUserImage(id) { return !!userImages[id]; }

  /**
   * 从维基共享资源检索非遗实景图（CC 开放授权，规避版权风险）
   * 仅在既无用户上传、也无内置图库时作为末位兜底。
   */
  async function fetchWikiImage(site) {
    if (site && galleryOf(site.id)) return galleryOf(site.id);
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

  /* ---------------- 初始化 ---------------- */

  wikiCache = readLS(K.WIKI);

  /** 初始化完成信号：IndexedDB 打开 + 历史数据迁移结束后 resolve */
  var ready = openDB().then(function (d) {
    db = d;
    dbReady = true;
    if (!db) {
      // IndexedDB 不可用：沿用旧 LocalStorage 数据
      userImages = readLS(K.IMAGES_LEGACY);
      return { idb: false, loaded: Object.keys(userImages).length };
    }
    return loadAll().then(function () { return migrateLegacy(); }).then(function () {
      return { idb: true, loaded: Object.keys(userImages).length };
    });
  }).catch(function () {
    userImages = readLS(K.IMAGES_LEGACY);
    return { idb: false, loaded: Object.keys(userImages).length };
  });

  MYX.Store = {
    ready: ready,
    userImages: userImages,
    wikiCache: wikiCache,
    saveUserImage: saveUserImage,
    saveWiki: saveWiki,
    fetchWikiImage: fetchWikiImage,
    getImage: getImage,
    isUserImage: isUserImage,
    galleryOf: galleryOf,
    flush: flush,
    isIdbReady: function () { return dbReady && !!db; }
  };
})(window.MYX);
