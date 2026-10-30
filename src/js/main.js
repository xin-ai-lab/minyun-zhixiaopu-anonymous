/* ============================================================================
 * main.js —— 应用引导入口（Bootstrap）
 *
 * 加载顺序（见 index.html）：config -> data -> storage/image -> rag/planner
 *   -> map/graph/cross -> ui -> main
 * 本文件负责：DOM 就绪后按依赖顺序初始化各模块，并做最外层异常兜底。
 * ==========================================================================*/
window.MYX = window.MYX || {};

(function (MYX) {
  'use strict';

  function bootstrap() {
    try {
      // 1) 先初始化地图（内置图库随包分发，首屏即可显示实景照片）
      MYX.MapModule.init();
      // 2) 再初始化界面与交互（依赖地图模块已就绪）
      MYX.UI.init();

      console.log('%c闽韵智小铺 v' + MYX.CONFIG.VERSION + ' 已就绪',
        'color:#8B2E2E;font-weight:700;');
      console.log('知识库规模：' + MYX.SITES.length + ' 项非遗 / ' + MYX.CITIES.length + ' 个地区');
      console.log('内置实景图库：' + Object.keys(MYX.GALLERY || {}).length + ' 张');

      // 3) 用户上传照片存于 IndexedDB，异步读取完成后刷新相关标记
      if (MYX.Store && MYX.Store.ready) {
        MYX.Store.ready.then(function (info) {
          if (info && info.loaded) {
            MYX.SITES.forEach(function (s) {
              if (MYX.Store.isUserImage(s.id)) MYX.MapModule.refreshMarker(s.id);
            });
            console.log('已恢复本地上传照片：' + info.loaded + ' 张（存储后端：' +
              (info.idb ? 'IndexedDB' : 'LocalStorage 降级') + '）');
          }
        }).catch(function () { /* 忽略 */ });
      }
    } catch (err) {
      console.error('[闽韵智小铺] 初始化失败：', err);
      var box = document.getElementById('msgs');
      if (box) {
        var tip = document.createElement('div');
        tip.className = 'msg bot';
        tip.innerHTML = '⚠️ 应用初始化出现异常，请刷新页面重试。<br><span style="font-size:11px;color:#8A7F73">' + err.message + '</span>';
        box.appendChild(tip);
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})(window.MYX);
