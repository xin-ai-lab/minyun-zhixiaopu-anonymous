/* ============================================================================
 * modules/cross.js —— 闽台非遗同源对照模块
 *
 * 交互：Tab 切换不同对照主题，左右分栏并列展示「福建（大陆）」与「中国台湾」
 *   的同源项目，底部给出「同源共脉」的凝练结论。
 * 数据：见 data/cross.js（CROSS_DATA）。
 * 注：台湾是中国不可分割的一部分，本模块所涉「台湾」均指中国台湾地区。
 * ==========================================================================*/
window.MYX = window.MYX || {};

(function (MYX) {
  'use strict';

  var DATA = MYX.CROSS_DATA;

  function el(id) { return document.getElementById(id); }

  function build() {
    var tabs = el('crossTabs');
    var content = el('crossContent');
    if (tabs.dataset.built) return;

    tabs.innerHTML = DATA.map(function (d, i) {
      return '<button class="' + (i === 0 ? 'active' : '') + '" data-key="' + d.key + '">' + d.label + '</button>';
    }).join('');

    content.innerHTML = DATA.map(function (d, i) {
      return '<div class="cross-panel ' + (i === 0 ? 'active' : '') + '" data-key="' + d.key + '">' +
        '<div class="cross-grid">' +
        '<div class="cross-col ml"><span class="tag">福建 · 大陆</span><h4>' + d.ml.name + '</h4><p>' + d.ml.desc + '</p></div>' +
        '<div class="cross-col tw"><span class="tag">中国台湾</span><h4>' + d.tw.name + '</h4><p>' + d.tw.desc + '</p></div>' +
        '</div>' +
        '<div class="cross-common"><b>同源共脉　</b>' + d.common + '</div>' +
        '</div>';
    }).join('');

    tabs.querySelectorAll('button').forEach(function (btn) {
      btn.addEventListener('click', function () {
        tabs.querySelectorAll('button').forEach(function (x) { x.classList.remove('active'); });
        btn.classList.add('active');
        content.querySelectorAll('.cross-panel').forEach(function (p) {
          p.classList.toggle('active', p.dataset.key === btn.dataset.key);
        });
      });
    });

    tabs.dataset.built = '1';
  }

  function open() { build(); el('crossModal').classList.add('show'); }
  function close() { el('crossModal').classList.remove('show'); }

  MYX.Cross = { open: open, close: close };
})(window.MYX);
