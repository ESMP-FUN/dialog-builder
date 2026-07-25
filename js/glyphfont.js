/*
 * Draws the two rune fonts.
 *
 * Standard Galactic Alphabet and Illageralt are picture fonts inside the game
 * — there is no font file to hand a browser. Each rune is instead a slice of a
 * sprite strip, drawn as a CSS mask filled with the current text colour, so a
 * rune picks up colours and gradients exactly as ordinary text does.
 *
 * The strips and the character map come from tools/build-glyphs.js.
 *
 * Characters with no rune are left as plain text and fall back to the normal
 * font, which keeps spaces, capitals and stray punctuation readable instead of
 * silently vanishing.
 */
(function (global) {
  'use strict';

  function font(key) {
    return (global.Glyphs && global.Glyphs[key]) || null;
  }

  function has(key) { return !!font(key); }

  // The charts cover lower case only. These fonts have no notion of case, so an
  // upper-case letter uses the same rune rather than falling back to Latin.
  function lookup(f, ch) {
    return f.glyphs[ch] || f.glyphs[ch.toLowerCase()] || null;
  }

  /** How much of a string this font can actually draw, 0 to 1. */
  function coverage(key, text) {
    var f = font(key);
    if (!f) return 0;
    var letters = String(text).replace(/\s/g, '');
    if (!letters) return 1;
    var drawn = 0;
    for (var i = 0; i < letters.length; i++) if (lookup(f, letters[i])) drawn++;
    return drawn / letters.length;
  }

  /**
   * Renders text into rune sprites.
   * `shadow` is a colour for the drop shadow, matching how the game shades
   * ordinary glyphs; pass null for none.
   */
  function render(text, key, shadow) {
    var f = font(key);
    var frag = document.createDocumentFragment();
    if (!f) {
      frag.appendChild(document.createTextNode(text));
      return frag;
    }

    // Everything is expressed in em, keyed off the strip height, so runes
    // scale with the surrounding font size without any measuring.
    var unit = f.height;
    var sheet = 'url("' + f.sheet + '")';
    var pending = '';

    function flushText() {
      if (!pending) return;
      frag.appendChild(document.createTextNode(pending));
      pending = '';
    }

    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      var g = lookup(f, ch);

      if (!g) { pending += ch; continue; }
      flushText();

      var span = document.createElement('span');
      span.className = 'mc-glyph';
      span.style.width = (g.w / unit) + 'em';
      span.style.height = '1em';
      span.style.maskImage = sheet;
      span.style.webkitMaskImage = sheet;
      span.style.maskSize = (f.width / unit) + 'em 1em';
      span.style.webkitMaskSize = (f.width / unit) + 'em 1em';
      span.style.maskPosition = '-' + (g.x / unit) + 'em 0';
      span.style.webkitMaskPosition = '-' + (g.x / unit) + 'em 0';
      if (shadow) span.style.filter = 'drop-shadow(0.125em 0.125em 0 ' + shadow + ')';

      // Keeps the rune findable by search and copyable as ordinary text.
      span.setAttribute('data-char', ch);
      frag.appendChild(span);
    }

    flushText();
    return frag;
  }

  global.GlyphFont = { has: has, render: render, coverage: coverage };
})(window);
