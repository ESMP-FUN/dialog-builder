/*
 * Hover tooltips.
 *
 * The browser's own `title` is slow to appear, cannot be styled, and truncates
 * anything longer than a few words — no good for an explanation worth reading.
 * One shared element is moved around and refilled rather than one per target.
 */
(function (global) {
  'use strict';

  var tip = null;
  var current = null;

  function build() {
    if (tip) return tip;
    tip = document.createElement('div');
    tip.className = 'tooltip';
    tip.setAttribute('role', 'tooltip');
    document.body.appendChild(tip);
    return tip;
  }

  function fill(content) {
    var node = build();
    node.textContent = '';

    if (content.title) {
      var h = document.createElement('strong');
      h.className = 'tooltip-title';
      h.textContent = content.title;
      node.appendChild(h);
    }

    String(content.body || '').split('\n\n').forEach(function (para) {
      var p = document.createElement('p');
      p.textContent = para;
      node.appendChild(p);
    });
  }

  // Sits above the target by default, dropping below when there is no room,
  // and is nudged sideways so it never runs off either edge.
  function place(target) {
    var node = build();
    var r = target.getBoundingClientRect();
    var t = node.getBoundingClientRect();
    var margin = 8;

    var left = r.left + r.width / 2 - t.width / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - t.width - margin));

    var above = r.top - t.height - margin;
    var top = above >= margin ? above : r.bottom + margin;

    node.classList.toggle('is-below', above < margin);
    node.style.left = Math.round(left) + 'px';
    node.style.top = Math.round(top) + 'px';
  }

  function show(target, content) {
    current = target;
    fill(content);
    build().classList.add('is-visible');
    place(target);
  }

  function hide() {
    current = null;
    if (tip) tip.classList.remove('is-visible');
  }

  /**
   * content: { title, body } — body may contain blank lines for paragraphs.
   */
  function attach(target, content) {
    // Keeps the text reachable for screen readers and for anyone who has
    // tooltips turned off.
    target.setAttribute('aria-label',
      (content.title ? content.title + ' — ' : '') + content.body);

    target.addEventListener('mouseenter', function () { show(target, content); });
    target.addEventListener('focus', function () { show(target, content); });
    target.addEventListener('mouseleave', hide);
    target.addEventListener('blur', hide);
    // A tooltip on a button should not survive the click that follows.
    target.addEventListener('click', hide);
    return target;
  }

  window.addEventListener('keydown', function (e) { if (e.key === 'Escape') hide(); });
  window.addEventListener('scroll', function () { if (current) place(current); }, true);
  window.addEventListener('resize', hide);

  global.Tooltip = { attach: attach, hide: hide };
})(window);
