/* ============================================================================
 * modules/image.js —— 图片读取与压缩
 *
 * 【AI 协同说明 / 关键人工干预】：
 *   AI 初版直接 FileReader.readAsDataURL 转 Base64 落库，导致大图（>3MB）
 *   写入 LocalStorage 时触发配额溢出（QuotaExceededError）并使页面卡死。
 *   选手引入 Canvas 等比缩放（最长边 800px）+ JPEG 0.85 质量导出，
 *   将单图体积压至约 60~120KB，从根本上解决了该缺陷。
 * ==========================================================================*/
window.MYX = window.MYX || {};

(function (MYX) {
  'use strict';

  var CONFIG = MYX.CONFIG;

  /**
   * 读取文件并等比压缩
   * @param {File} file 图片文件
   * @returns {Promise<string>} 压缩后的 JPEG DataURL
   */
  function readAndResize(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();

      reader.onload = function (e) {
        var img = new Image();

        img.onload = function () {
          var canvas = document.createElement('canvas');
          var max = CONFIG.IMAGE.MAX_EDGE;
          var w = img.width;
          var h = img.height;

          // 等比缩放：仅当某一边超过上限时才缩放
          if (w > h && w > max) { h = h * max / w; w = max; }
          else if (h > max) { w = w * max / h; h = max; }

          canvas.width = w;
          canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', CONFIG.IMAGE.QUALITY));
        };

        img.onerror = reject;
        img.src = e.target.result;
      };

      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  MYX.ImageUtil = { readAndResize: readAndResize };
})(window.MYX);
