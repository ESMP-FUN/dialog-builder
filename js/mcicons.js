/*
 * The two glyphs that sit inside a Minecraft-style square button.
 *
 * Drawn as SVG rather than shipped as textures so they stay crisp at any zoom,
 * and built on a 16x16 grid so the proportions match the game's own icons.
 */
(function (global) {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';

  function svg() {
    var node = document.createElementNS(NS, 'svg');
    node.setAttribute('viewBox', '0 0 16 16');
    node.setAttribute('width', '16');
    node.setAttribute('height', '16');
    node.setAttribute('aria-hidden', 'true');
    return node;
  }

  function path(d, fill, stroke) {
    var p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    p.setAttribute('fill', fill);
    if (stroke) {
      p.setAttribute('stroke', stroke);
      p.setAttribute('stroke-width', '1.4');
      p.setAttribute('stroke-linejoin', 'miter');
    }
    return p;
  }

  // The game's own warning button: a yellow triangle with an exclamation mark.
  function warning() {
    var node = svg();
    node.appendChild(path('M8 1 L15 14 L1 14 Z', '#FFC61E', '#1A1A1A'));
    node.appendChild(path('M7.1 5.2h1.8v4.4H7.1z M7.1 10.6h1.8v1.8H7.1z', '#1A1A1A'));
    return node;
  }

  // Ours, not the game's: the same button shape with an i, for explanations
  // that belong to the builder rather than to Minecraft.
  function info() {
    var node = svg();
    var circle = document.createElementNS(NS, 'circle');
    circle.setAttribute('cx', '8');
    circle.setAttribute('cy', '8');
    circle.setAttribute('r', '6.6');
    circle.setAttribute('fill', '#7EC8FF');
    circle.setAttribute('stroke', '#1A1A1A');
    circle.setAttribute('stroke-width', '1.4');
    node.appendChild(circle);
    node.appendChild(path('M7.1 3.6h1.8v1.8H7.1z M7.1 6.6h1.8v5.4H7.1z', '#1A1A1A'));
    return node;
  }

  /** A square Minecraft-style button wrapping one of the glyphs above. */
  function button(kind, className) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'mc-icon-button' + (className ? ' ' + className : '');
    b.appendChild(kind === 'info' ? info() : warning());
    return b;
  }

  global.McIcons = { warning: warning, info: info, button: button };
})(window);
