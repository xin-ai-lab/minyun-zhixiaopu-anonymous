/* ============================================================================
 * data/gallery.js —— 内置非遗实景图库索引
 *
 * 说明：项目随包分发 48 张真实非遗实景照片（assets/sites/<项目id>.jpg，
 *   已完成等比压缩至最长边 800px / JPEG 0.8，全库约 3.1MB）。
 *   之所以内置而非依赖在线图库：
 *     1) 离线与弱网环境下仍能完整展示非遗实景；
 *     2) 图片随仓库版本化，来源可追溯、授权清晰；
 *     3) 用户上传的实拍照片优先级高于内置图，可随时覆盖。
 *
 * 【AI 协同说明】：图库索引由脚本依据数据文件名自动生成，避免手工维护出错；
 *   图片素材由选手逐项核对非遗项目名称后归集。
 * ==========================================================================*/
window.MYX = window.MYX || {};

(function (MYX) {
  'use strict';

  /** 非遗项目 id -> 内置实景图相对路径 */
  var GALLERY = {
    'd01': 'assets/sites/d01.jpg',
    'd02': 'assets/sites/d02.jpg',
    'd03': 'assets/sites/d03.jpg',
    'd04': 'assets/sites/d04.jpg',
    'f01': 'assets/sites/f01.jpg',
    'f02': 'assets/sites/f02.jpg',
    'f03': 'assets/sites/f03.jpg',
    'f05': 'assets/sites/f05.jpg',
    'f06': 'assets/sites/f06.jpg',
    'f07': 'assets/sites/f07.jpg',
    'l01': 'assets/sites/l01.jpg',
    'l02': 'assets/sites/l02.jpg',
    'l03': 'assets/sites/l03.jpg',
    'l04': 'assets/sites/l04.jpg',
    'n01': 'assets/sites/n01.jpg',
    'n02': 'assets/sites/n02.jpg',
    'n03': 'assets/sites/n03.jpg',
    'n04': 'assets/sites/n04.jpg',
    'p01': 'assets/sites/p01.jpg',
    'p02': 'assets/sites/p02.jpg',
    'p03': 'assets/sites/p03.jpg',
    'p04': 'assets/sites/p04.jpg',
    'q01': 'assets/sites/q01.jpg',
    'q02': 'assets/sites/q02.jpg',
    'q03': 'assets/sites/q03.jpg',
    'q04': 'assets/sites/q04.jpg',
    'q05': 'assets/sites/q05.jpg',
    'q06': 'assets/sites/q06.jpg',
    'q07': 'assets/sites/q07.jpg',
    'q09': 'assets/sites/q09.jpg',
    'q10': 'assets/sites/q10.jpg',
    's01': 'assets/sites/s01.jpg',
    's02': 'assets/sites/s02.jpg',
    's03': 'assets/sites/s03.jpg',
    't01': 'assets/sites/t01.jpg',
    't02': 'assets/sites/t02.jpg',
    't03': 'assets/sites/t03.jpg',
    'x01': 'assets/sites/x01.jpg',
    'x02': 'assets/sites/x02.jpg',
    'x03': 'assets/sites/x03.jpg',
    'x04': 'assets/sites/x04.jpg',
    'x05': 'assets/sites/x05.jpg',
    'z01': 'assets/sites/z01.jpg',
    'z02': 'assets/sites/z02.jpg',
    'z03': 'assets/sites/z03.jpg',
    'z04': 'assets/sites/z04.jpg',
    'z05': 'assets/sites/z05.jpg',
    'z06': 'assets/sites/z06.jpg'
  };

  MYX.GALLERY = GALLERY;
})(window.MYX);
