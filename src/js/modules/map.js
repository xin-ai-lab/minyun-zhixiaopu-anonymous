/* ============================================================================
 * modules/map.js —— 地图可视化模块（Leaflet）
 *
 * 能力：
 *   · 初始化高德路网底图并自适应全省边界；
 *   · 渲染 46 个非遗标记（优先实景照片，无图降级为类别 Emoji 图标）；
 *   · 按「地市 + 类别」双重条件实时筛选可见标记；
 *   · 支持 4 条预设主题路线与 1 条算法自定义路线绘制；
 *   · 标记点击弹出「非遗信息卡片」。
 * ==========================================================================*/
window.MYX = window.MYX || {};

(function (MYX) {
  'use strict';

  var CONFIG = MYX.CONFIG;
  var CATS = MYX.CATS;
  var SITES = MYX.SITES;

  var map = null;
  var markers = {};          // { siteId: L.Marker }
  var routeLayer = null;     // 预设路线图层
  var customRouteLayer = null; // 自定义路线图层
  var allBounds = null;

  /** 预设主题路线 */
  var ROUTES = {
    minnan:    { ids: ['q01', 'q02', 'x01', 'z01', 'x02'], color: '#C9A227' },
    fuzhou:    { ids: ['f01', 'f02', 'f03', 'f05', 'f06'], color: '#8B2E2E' },
    hakka:     { ids: ['l01', 'l02', 'l03', 's02'], color: '#2E6B8B' },
    quansheng: { ids: ['f01', 'q01', 'x01', 'z01', 'p01', 's02', 'n01', 'l02', 'd02', 't01'], color: '#D2691E' }
  };

  var currentCity = '全部';
  var currentCat = 'all';

  /** 单个标记构建（有图用照片，无图用类别图标） */
  function buildMarker(site) {
    var c = CATS[site.cat];
    var img = MYX.Store.getImage(site.id);
    var icon = L.divIcon({
      className: 'custom-marker',
      html: img
        ? '<div class="marker-photo"><img src="' + img + '" alt="' + site.name + '"></div>'
        : '<div class="marker-inner" style="--c:' + c.color + '">' + c.emoji + '</div>',
      iconSize: img ? [44, 44] : [32, 32],
      iconAnchor: img ? [22, 22] : [16, 16]
    });
    var marker = L.marker([site.lat, site.lng], { icon: icon });
    marker.on('click', function () { openPopup(site); });
    return marker;
  }

  function isVisible(site) {
    return (currentCity === '全部' || site.city === currentCity) &&
      (currentCat === 'all' || site.cat === currentCat);
  }

  /** 应用筛选条件，增删图层 */
  function applyVisibility() {
    SITES.forEach(function (site) {
      var m = markers[site.id];
      if (!m) return;
      if (isVisible(site) && !map.hasLayer(m)) m.addTo(map);
      if (!isVisible(site) && map.hasLayer(m)) map.removeLayer(m);
    });
  }

  /** 重建单个标记（上传图片后调用） */
  function refreshMarker(id) {
    var site = SITES.find(function (x) { return x.id === id; });
    if (!site) return;
    if (markers[id] && map.hasLayer(markers[id])) map.removeLayer(markers[id]);
    markers[id] = buildMarker(site);
    if (isVisible(site)) markers[id].addTo(map);
  }

  /** 地图气泡弹窗 */
  function openPopup(site) {
    var c = CATS[site.cat];
    var img = MYX.Store.getImage(site.id);
    var imgHTML = img
      ? '<div class="popup-img"><img src="' + img + '" alt="' + site.name + '"></div>'
      : '<div class="popup-img" style="display:flex;align-items:center;justify-content:center;color:#B0A090;font-size:12px">暂无照片</div>';

    var html = '<div class="map-popup">' + imgHTML +
      '<div class="popup-body">' +
      '<h3>' + site.name + '</h3>' +
      '<div class="popup-badges"><span>' + site.level + '</span><span>' + c.name + '</span><span>' + site.city + '</span></div>' +
      '<p>' + site.brief + '</p>' +
      '<div class="popup-actions">' +
      '<button data-popup-action="detail" data-id="' + site.id + '">📖 完整详情</button>' +
      '<button data-popup-action="upload" data-id="' + site.id + '">📷 上传照片</button>' +
      '</div></div></div>';

    var popup = L.popup({ maxWidth: 350, minWidth: 320, className: 'custom-popup', closeButton: true, autoClose: true })
      .setLatLng([site.lat, site.lng])
      .setContent(html)
      .openOn(map);

    // 弹窗按钮事件委托（避免内联 onclick 与全局命名污染）
    setTimeout(function () {
      var el = popup.getElement();
      if (!el) return;
      el.querySelectorAll('[data-popup-action]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var id = btn.getAttribute('data-id');
          if (btn.getAttribute('data-popup-action') === 'detail') MYX.UI.openDetail(id);
          else MYX.UI.triggerUpload(id);
          map.closePopup();
        });
      });
    }, 0);
  }

  /** 绘制预设主题路线 */
  function drawRoute(key, btn) {
    document.querySelectorAll('.map-tools .t').forEach(function (b) { b.classList.remove('active'); });
    if (btn) btn.classList.add('active');
    var r = ROUTES[key];
    if (!r) return;

    clearCustom();
    if (routeLayer) map.removeLayer(routeLayer);
    if (key === 'clear') { clearRoute(); return; }

    routeLayer = L.layerGroup().addTo(map);
    var pts = r.ids.map(function (id) {
      var s = SITES.find(function (x) { return x.id === id; });
      return [s.lat, s.lng];
    });

    L.polyline(pts, { color: '#fff', weight: 9, opacity: 0.9 }).addTo(routeLayer);
    L.polyline(pts, { color: r.color, weight: 4, dashArray: '12,8' }).addTo(routeLayer);

    r.ids.forEach(function (id, i) {
      var s = SITES.find(function (x) { return x.id === id; });
      L.marker([s.lat, s.lng], {
        interactive: false,
        icon: L.divIcon({
          className: 'custom-marker',
          html: '<div style="width:26px;height:26px;border-radius:50%;background:' + r.color +
            ';color:#fff;display:grid;place-items:center;font-size:12px;font-weight:700;border:2px solid #fff">' + (i + 1) + '</div>',
          iconSize: [26, 26], iconAnchor: [13, 13]
        })
      }).addTo(routeLayer);
    });

    map.flyToBounds(L.latLngBounds(pts).pad(0.35), { duration: 0.9 });
    var names = r.ids.map(function (id) {
      return SITES.find(function (x) { return x.id === id; }).name;
    }).join(' → ');
    var labelMap = { minnan: '闽南线', fuzhou: '福州线', hakka: '客家线', quansheng: '全省线' };
    MYX.UI.addBot('已为你绘制路线 🗺️<br><b>' + labelMap[key] + '</b><br>' + names);
  }

  /** 绘制算法规划出的自定义路线 */
  function drawCustomRoute(routeArray) {
    clearCustom();
    if (routeLayer) { map.removeLayer(routeLayer); routeLayer = null; }
    customRouteLayer = L.layerGroup().addTo(map);

    var pts = routeArray.map(function (s) { return [s.lat, s.lng]; });
    L.polyline(pts, { color: '#7D5BA6', weight: 5, dashArray: '10, 10' }).addTo(customRouteLayer);

    routeArray.forEach(function (s, i) {
      L.marker([s.lat, s.lng], {
        interactive: false,
        icon: L.divIcon({
          className: 'custom-marker',
          html: '<div style="width:26px;height:26px;border-radius:50%;background:#7D5BA6;color:#fff;display:grid;place-items:center;font-size:12px;font-weight:700;border:2px solid #fff">' + (i + 1) + '</div>',
          iconSize: [26, 26], iconAnchor: [13, 13]
        })
      }).addTo(customRouteLayer);
    });

    map.flyToBounds(L.latLngBounds(pts).pad(0.3));
  }

  function clearCustom() {
    if (customRouteLayer) { map.removeLayer(customRouteLayer); customRouteLayer = null; }
  }

  function clearRoute() {
    if (routeLayer) { map.removeLayer(routeLayer); routeLayer = null; }
    clearCustom();
    document.querySelectorAll('.map-tools .t').forEach(function (b) { b.classList.remove('active'); });
    map.fitBounds(allBounds, { padding: [40, 40], duration: 0.7 });
  }

  function setCity(city) { currentCity = city; applyVisibility(); }
  function setCat(cat) { currentCat = cat; applyVisibility(); }
  function getMap() { return map; }
  function fitAll() { if (allBounds) map.fitBounds(allBounds, { padding: [40, 40] }); }

  /** 初始化地图与标记 */
  function init() {
    map = L.map('map', { zoomControl: true, attributionControl: false })
      .setView(CONFIG.MAP.CENTER, CONFIG.MAP.INIT_ZOOM);

    L.tileLayer(CONFIG.MAP.TILE_URL, {
      subdomains: CONFIG.MAP.SUBDOMAINS,
      maxZoom: CONFIG.MAP.MAX_ZOOM,
      minZoom: CONFIG.MAP.MIN_ZOOM
    }).addTo(map);

    SITES.forEach(function (s) { markers[s.id] = buildMarker(s); });
    applyVisibility();

    allBounds = L.latLngBounds(SITES.map(function (s) { return [s.lat, s.lng]; }));
    map.fitBounds(allBounds, { padding: [40, 40] });
    setTimeout(function () {
      map.invalidateSize();
      map.fitBounds(allBounds, { padding: [40, 40] });
    }, 400);
    window.addEventListener('resize', function () { map.invalidateSize(); });

    // 异步、限流地为可见标记补充在线实景图
    (async function () {
      for (var i = 0; i < SITES.length; i++) {
        var s = SITES[i];
        if (MYX.Store.userImages[s.id] || MYX.Store.wikiCache[s.id]) continue;
        if (!isVisible(s)) continue;
        var url = await MYX.Store.fetchWikiImage(s);
        if (url) {
          if (markers[s.id] && map.hasLayer(markers[s.id])) map.removeLayer(markers[s.id]);
          markers[s.id] = buildMarker(s);
          if (isVisible(s)) markers[s.id].addTo(map);
        }
        await new Promise(function (r) { setTimeout(r, CONFIG.WIKI.FETCH_INTERVAL); });
      }
    })();
  }

  MYX.MapModule = {
    init: init,
    setCity: setCity,
    setCat: setCat,
    applyVisibility: applyVisibility,
    refreshMarker: refreshMarker,
    drawRoute: drawRoute,
    drawCustomRoute: drawCustomRoute,
    clearRoute: clearRoute,
    getMap: getMap,
    fitAll: fitAll,
    ROUTES: ROUTES
  };
})(window.MYX);
