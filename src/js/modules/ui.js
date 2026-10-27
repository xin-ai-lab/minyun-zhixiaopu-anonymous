/* ============================================================================
 * modules/ui.js —— 界面渲染与交互编排层
 *
 * 职责：把「数据 / 算法 / 地图」的能力编排成用户可见的交互：
 *   · 渲染地市 tabs、类别筛选 chips；
 *   · 渲染对话气泡、非遗信息卡片、RAG「检索中」动画；
 *   · 编排 RAG 问答（send）与一键智能规划（smartPlan）；
 *   · 非遗详情弹窗、图片上传（单张 / 批量）。
 * ==========================================================================*/
window.MYX = window.MYX || {};

(function (MYX) {
  'use strict';

  var CONFIG = MYX.CONFIG;
  var CATS = MYX.CATS;
  var SITES = MYX.SITES;
  var CITIES = MYX.CITIES;

  var msgsEl, inputEl;
  var currentDetailId = null;
  var uploadTargetId = null;

  function el(id) { return document.getElementById(id); }

  /* ======================= 对话渲染 ======================= */

  function scrollBottom() { msgsEl.scrollTop = msgsEl.scrollHeight; }

  function addBot(html) {
    var d = document.createElement('div');
    d.className = 'msg bot';
    d.innerHTML = html;
    msgsEl.appendChild(d);
    scrollBottom();
  }

  function addUser(text) {
    var d = document.createElement('div');
    d.className = 'msg user';
    d.textContent = text;
    msgsEl.appendChild(d);
    scrollBottom();
  }

  /** 渲染非遗信息卡片（含图片懒加载与降级） */
  function addCard(site) {
    var c = CATS[site.cat];
    var d = document.createElement('div');
    d.className = 'msg card';
    d.dataset.id = site.id;
    d.innerHTML =
      '<div class="img-wrap"><div class="loading">正在加载照片…</div></div>' +
      '<div class="body">' +
      '<div class="card-head">' +
      '<div class="card-icon" style="background:' + c.color + '18;color:' + c.color + '">' + c.emoji + '</div>' +
      '<div class="card-title"><h4>' + site.name + '</h4>' +
      '<div class="badges"><span class="badge gold">' + site.level + '</span><span class="badge">' + c.name + '</span><span class="badge">' + site.city + '</span></div>' +
      '</div></div>' +
      '<p>' + site.brief + '</p>' +
      '<div class="tags">' + (site.tags || []).map(function (t) { return '<span>#' + t + '</span>'; }).join('') + '</div>' +
      '<div class="meta">📍 ' + site.address + (site.inheritor && site.inheritor !== '—' ? ' · 👤 ' + site.inheritor : '') + '</div>' +
      '<div class="card-actions">' +
      '<button class="primary" data-card-action="detail" data-id="' + site.id + '">📖 完整详情</button>' +
      '<button data-card-action="upload" data-id="' + site.id + '">📷 上传照片</button>' +
      '<button data-card-action="graph" data-id="' + site.id + '">🕸️ 图谱</button>' +
      '</div></div>';
    msgsEl.appendChild(d);
    scrollBottom();

    // 卡片按钮事件委托
    d.querySelectorAll('[data-card-action]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-id');
        var act = btn.getAttribute('data-card-action');
        if (act === 'detail') openDetail(id);
        else if (act === 'upload') triggerUpload(id);
        else if (act === 'graph') MYX.Graph.open(id);
      });
    });

    // 图片：本地缓存优先，否则异步拉取开放图库
    var imgWrap = d.querySelector('.img-wrap');
    var cached = MYX.Store.getImage(site.id);
    if (cached) {
      imgWrap.innerHTML = '<img src="' + cached + '" alt="' + site.name + '">';
    } else {
      MYX.Store.fetchWikiImage(site).then(function (url) {
        imgWrap.innerHTML = url
          ? '<img src="' + url + '" alt="' + site.name + '" onerror="this.parentElement.innerHTML=\'<div class=&quot;loading&quot;>图片加载失败<br>点「📷 上传照片」添加</div>\'">'
          : '<div class="loading">未找到公开授权照片<br>点「📷 上传照片」添加真实照片</div>';
      }).catch(function () {
        imgWrap.innerHTML = '<div class="loading">图片加载失败</div>';
      });
    }
  }

  /* ======================= RAG 问答 ======================= */

  function send(text) {
    var v = (text !== undefined ? text : inputEl.value).trim();
    if (!v) v = '簪花围在哪里体验？';

    addUser(v);
    inputEl.value = '';

    // 前置「检索中」动画，模拟向量检索过程
    var thinkId = 'think_' + Date.now();
    msgsEl.insertAdjacentHTML('beforeend',
      '<div class="rag-thinking" id="' + thinkId + '"><div class="rag-spinner"></div> 正在检索非遗知识库…</div>');
    scrollBottom();

    setTimeout(function () {
      var node = el(thinkId);
      if (node) node.remove();

      var r = MYX.RAG.parseIntent(v);

      switch (r.type) {
        case 'graph':
          addBot('正在打开知识图谱 🕸️');
          setTimeout(function () { MYX.Graph.open(null); }, 400);
          break;
        case 'cross':
          addBot('正在打开两岸对照 🌊');
          setTimeout(function () { MYX.Cross.open(); }, 400);
          break;
        case 'city-list':
          addBot('<b>' + r.city + '</b>的非遗代表项目 👇 共收录 ' + r.count + ' 项');
          r.hits.forEach(function (s, i) { setTimeout(function () { addCard(s); }, 100 + i * 200); });
          break;
        case 'overview':
          addBot('福建全省共收录 <b>' + r.count + ' 项</b>代表性非遗。你可以问我：<br>' +
            '• 福州有哪些非遗？<br>• 泉州有哪些非遗？<br>• 簪花围在哪里体验？<br>• 打开知识图谱<br>• 两岸非遗对照');
          break;
        case 'search':
          addBot('为你找到 <b>' + r.hits.length + '</b> 项相关非遗 👇');
          r.hits.forEach(function (s, i) { setTimeout(function () { addCard(s); }, 100 + i * 200); });
          break;
        default:
          addBot('你可以试试问我：<br>• 福州有哪些非遗？<br>• 泉州有哪些非遗？<br>• 簪花围在哪里体验？<br>• 打开知识图谱');
      }
    }, CONFIG.RAG.THINK_DELAY);
  }

  function quickAsk(text) {
    inputEl.value = text;
    send();
  }

  /* ======================= 一键智能规划 ======================= */

  function smartPlan() {
    addUser('帮我规划一条泉州的非遗半日游路线。');
    var result = MYX.Planner.plan('泉州');
    if (!result) { addBot('暂无该地区的非遗数据。'); return; }

    var html = '🪄 <b>AI 智能路线规划</b>（已按贪心算法计算最短游览顺序）<br>' +
      '🚩 出发时间：' + result.startTime + '　|　全程约 <b>' + result.approxKm + ' km</b><br><br>';
    result.timeline.forEach(function (item) {
      html += '📍 <b>第 ' + item.index + ' 站：' + item.site.name + '</b><br>' +
        '⏰ 游玩：' + item.arrive + ' - ' + item.leave + '<br><br>';
    });
    html += '🏁 预计结束时间：' + result.endTime;

    addBot(html);
    MYX.MapModule.drawCustomRoute(result.route);
  }

  /* ======================= 详情弹窗 ======================= */

  function openDetail(id) {
    var s = SITES.find(function (x) { return x.id === id; });
    if (!s) return;
    currentDetailId = id;
    var c = CATS[s.cat];

    el('dName').textContent = s.name;
    el('dBadges').innerHTML = '<span class="badge gold">' + s.level + '</span>' +
      '<span class="badge">' + c.name + '</span><span class="badge">' + s.city + '</span>';

    var html = '<div class="section brief"><h3>📖 项目简介</h3><p>' + s.brief + '</p>' +
      '<div class="tags">' + (s.tags || []).map(function (t) { return '<span>#' + t + '</span>'; }).join('') + '</div></div>';
    html += '<div class="meta-grid">' +
      '<div class="meta-item"><div class="k">所属地域</div><div class="v">' + s.city + ' · ' + s.address + '</div></div>' +
      '<div class="meta-item"><div class="k">代表性传承人</div><div class="v">' + (s.inheritor || '—') + '</div></div></div>';
    if (s.history) html += '<div class="section history"><h3>📜 历史渊源</h3><p>' + s.history + '</p></div>';
    if (s.cases) html += '<div class="section cases"><h3>🌟 传承与发扬</h3><p>' + s.cases + '</p></div>';
    if (s.guide) html += '<div class="section guide"><h3>🗺️ 游玩攻略</h3><p>' + s.guide + '</p></div>';

    el('dContent').innerHTML = html;
    updateDetailImage(MYX.Store.getImage(s.id), c);
    el('detailModal').classList.add('show');
    MYX.MapModule.getMap().flyTo([s.lat, s.lng], 12, { duration: 0.7 });

    if (!MYX.Store.getImage(s.id)) {
      MYX.Store.fetchWikiImage(s).then(function (url) {
        if (url && currentDetailId === id) updateDetailImage(url, c);
      }).catch(function () { /* 忽略 */ });
    }
  }

  function updateDetailImage(url, c) {
    var imgEl = el('dImg');
    var phEl = el('dPlaceholder');
    if (url) {
      imgEl.src = url;
      imgEl.style.display = 'block';
      phEl.style.display = 'none';
      imgEl.onerror = function () {
        imgEl.style.display = 'none';
        phEl.style.display = 'flex';
        phEl.style.background = 'linear-gradient(135deg,' + c.color + ',' + c.color + '88)';
        phEl.textContent = c.emoji;
      };
    } else {
      imgEl.style.display = 'none';
      phEl.style.display = 'flex';
      phEl.style.background = 'linear-gradient(135deg,' + c.color + ',' + c.color + '88)';
      phEl.textContent = c.emoji;
    }
  }

  function closeDetail() {
    el('detailModal').classList.remove('show');
    currentDetailId = null;
  }

  /* ======================= 图片上传 ======================= */

  function triggerUpload(id) {
    if (!id) return;
    uploadTargetId = id;
    el('fileInput').click();
  }

  function initUploaders() {
    var fileInput = el('fileInput');
    fileInput.addEventListener('change', function (e) {
      var f = e.target.files[0];
      if (!f || !uploadTargetId) return;
      MYX.ImageUtil.readAndResize(f).then(function (dataUrl) {
        var id = uploadTargetId;
        MYX.Store.saveUserImage(id, dataUrl);
        MYX.MapModule.refreshMarker(id);
        if (el('detailModal').classList.contains('show') && currentDetailId === id) {
          var site = SITES.find(function (x) { return x.id === id; });
          updateDetailImage(dataUrl, CATS[site.cat]);
        }
        document.querySelectorAll('.card[data-id="' + id + '"] .img-wrap').forEach(function (wrap) {
          wrap.innerHTML = '<img src="' + dataUrl + '" alt="">';
        });
      });
      fileInput.value = '';
    });

    var batchInput = el('batchInput');
    batchInput.addEventListener('change', async function (e) {
      var files = Array.from(e.target.files);
      if (!files.length) return;

      // 进度浮层
      var prog = document.createElement('div');
      prog.className = 'batch-progress';
      prog.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#fff;padding:24px 32px;border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.35);z-index:99999;font-size:14px;text-align:center;min-width:280px;';
      prog.innerHTML = '<div style="font-weight:700;margin-bottom:8px;color:#8B2E2E">📁 正在批量处理…</div>' +
        '<div id="progText" style="font-size:12px;color:#6B5F52">0 / ' + files.length + '</div>';
      document.body.appendChild(prog);

      var matched = 0, processed = 0, unmatched = [];
      for (var i = 0; i < files.length; i++) {
        var file = files[i];
        var baseName = file.name.replace(/\.[^.]+$/, '').trim();
        var site = SITES.find(function (s) { return s.name === baseName; }) ||
          SITES.find(function (s) { return baseName.includes(s.name) || s.name.includes(baseName); });
        if (site) {
          try {
            var dataUrl = await MYX.ImageUtil.readAndResize(file);
            MYX.Store.saveUserImage(site.id, dataUrl);
            MYX.MapModule.refreshMarker(site.id);
            matched++;
          } catch (err) { unmatched.push(file.name); }
        } else { unmatched.push(file.name); }
        processed++;
        var pt = el('progText');
        if (pt) pt.textContent = processed + ' / ' + files.length + '　（已匹配 ' + matched + ' 张）';
      }
      prog.remove();

      var msg = '批量上传完成！<br>✅ 成功匹配 <b>' + matched + '</b> / ' + files.length + ' 张';
      if (unmatched.length) {
        msg += '<br><br>⚠️ 未匹配 <b>' + unmatched.length + '</b> 张：<br>' +
          '<span style="font-size:11px;color:#8A7F73;line-height:1.6">' + unmatched.slice(0, 8).join('、') +
          (unmatched.length > 8 ? ' …' : '') + '</span><br><br>' +
          '<span style="font-size:11px;color:#8A7F73">💡 文件名需包含项目名，如「蟳埔簪花围.jpg」</span>';
      }
      addBot(msg);
      batchInput.value = '';
    });
  }

  /* ======================= 筛选区 ======================= */

  function initTabs() {
    var wrap = el('cityTabs');
    CITIES.forEach(function (city) {
      var b = document.createElement('div');
      b.className = 'city-tab' + (city === '全部' ? ' active' : '');
      b.textContent = city;
      b.addEventListener('click', function () {
        MYX.MapModule.setCity(city);
        wrap.querySelectorAll('.city-tab').forEach(function (x) { x.classList.toggle('active', x.textContent === city); });
        var count = SITES.filter(function (s) {
          return (city === '全部' || s.city === city);
        }).length;
        addBot('已切换到 <b>' + city + (city === '全部' ? '全省' : '') + '</b>，显示 <b>' + count + '</b> 项非遗。');
      });
      wrap.appendChild(b);
    });
  }

  function initFilters() {
    var wrap = el('filters');

    var all = document.createElement('div');
    all.className = 'chip active';
    all.dataset.cat = 'all';
    all.textContent = '全部';
    all.addEventListener('click', function () { setFilter('all'); });
    wrap.appendChild(all);

    Object.keys(CATS).forEach(function (k) {
      var c = CATS[k];
      var node = document.createElement('div');
      node.className = 'chip';
      node.dataset.cat = k;
      node.innerHTML = '<span class="dot" style="background:' + c.color + '"></span>' + c.name;
      node.addEventListener('click', function () { setFilter(k); });
      wrap.appendChild(node);
    });
  }

  function setFilter(cat) {
    MYX.MapModule.setCat(cat);
    document.querySelectorAll('.chip').forEach(function (c) {
      c.classList.toggle('active', c.dataset.cat === cat);
    });
  }

  /* ======================= 初始化 ======================= */

  function init() {
    msgsEl = el('msgs');
    inputEl = el('input');

    initTabs();
    initFilters();
    initUploaders();

    // 顶部操作按钮
    document.querySelectorAll('.top-actions [data-action]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var act = btn.getAttribute('data-action');
        if (act === 'batch-upload') el('batchInput').click();
        else if (act === 'open-graph') MYX.Graph.open(null);
        else if (act === 'open-cross') MYX.Cross.open();
      });
    });

    // 快捷提问
    document.querySelectorAll('.quick [data-ask]').forEach(function (btn) {
      btn.addEventListener('click', function () { quickAsk(btn.getAttribute('data-ask')); });
    });
    var planBtn = document.querySelector('.quick [data-action="smart-plan"]');
    if (planBtn) planBtn.addEventListener('click', smartPlan);

    // 输入框回车发送
    el('composer').addEventListener('submit', function (e) { e.preventDefault(); send(); });

    // 地图工具条
    document.querySelectorAll('.map-tools [data-route]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var key = btn.getAttribute('data-route');
        if (key === 'clear') MYX.MapModule.clearRoute();
        else MYX.MapModule.drawRoute(key, btn);
      });
    });

    // 弹窗关闭
    el('dClose').addEventListener('click', closeDetail);
    el('dUploadBtn').addEventListener('click', function () { triggerUpload(currentDetailId); });
    el('graphClose').addEventListener('click', MYX.Graph.close);
    el('crossClose').addEventListener('click', MYX.Cross.close);

    // 点击遮罩关闭
    el('detailModal').addEventListener('click', function (e) { if (e.target.id === 'detailModal') closeDetail(); });
    el('graphModal').addEventListener('click', function (e) { if (e.target.id === 'graphModal') MYX.Graph.close(); });
    el('crossModal').addEventListener('click', function (e) { if (e.target.id === 'crossModal') MYX.Cross.close(); });
  }

  /** 供地图弹窗（在 map.js 中）回调 */
  MYX.UI = {
    init: init,
    addBot: addBot,
    addUser: addUser,
    addCard: addCard,
    send: send,
    quickAsk: quickAsk,
    smartPlan: smartPlan,
    openDetail: openDetail,
    closeDetail: closeDetail,
    triggerUpload: triggerUpload
  };
})(window.MYX);
