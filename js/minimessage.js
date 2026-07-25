/*
 * A small MiniMessage subset parser.
 *
 * Parses into a run list — each run being a chunk of text plus the styles that
 * apply to it — which the preview renders as HTML and the exporter serialises
 * into a vanilla text component. One parse, two consumers, so what you see and
 * what you copy can never drift apart.
 *
 * Supported: the 16 named colours, <#rrggbb>, <color:...>, bold/italic/
 * underlined/strikethrough/obfuscated (and their short forms), <reset>,
 * <newline>, <gradient:a:b:...>, <rainbow>, <click:...>, <hover:show_text:...>.
 * Anything unrecognised is left alone as literal text rather than swallowed,
 * so a typo shows up in the preview instead of vanishing.
 */
(function (global) {
  'use strict';

  var NAMED = {
    black: '#000000', dark_blue: '#0000AA', dark_green: '#00AA00',
    dark_aqua: '#00AAAA', dark_red: '#AA0000', dark_purple: '#AA00AA',
    gold: '#FFAA00', gray: '#AAAAAA', grey: '#AAAAAA', dark_gray: '#555555',
    dark_grey: '#555555', blue: '#5555FF', green: '#55FF55', aqua: '#55FFFF',
    red: '#FF5555', light_purple: '#FF55FF', yellow: '#FFFF55', white: '#FFFFFF'
  };

  // Reverse lookup so exported JSON prefers "red" over "#FF5555" — closer to
  // what a human would have written by hand.
  var NAMED_BY_HEX = {};
  Object.keys(NAMED).forEach(function (n) {
    if (!NAMED_BY_HEX[NAMED[n]]) NAMED_BY_HEX[NAMED[n]] = n;
  });

  var DECORATIONS = {
    b: 'bold', bold: 'bold',
    i: 'italic', italic: 'italic', em: 'italic',
    u: 'underlined', underlined: 'underlined',
    st: 'strikethrough', strikethrough: 'strikethrough',
    obf: 'obfuscated', obfuscated: 'obfuscated'
  };

  function isColourName(s) { return Object.prototype.hasOwnProperty.call(NAMED, s); }
  function isHex(s) { return /^#[0-9a-fA-F]{6}$/.test(s); }
  function toHex(s) { return isHex(s) ? s.toUpperCase() : (NAMED[s] || null); }

  /* ---- tokenizer ---- */

  // Splits raw MiniMessage into text and tag tokens. Quoted tag arguments are
  // respected so a ':' inside <hover:show_text:'a:b'> doesn't split the tag.
  function tokenize(input) {
    var tokens = [];
    var buf = '';
    var i = 0;

    function flush() {
      if (buf) { tokens.push({ kind: 'text', value: buf }); buf = ''; }
    }

    while (i < input.length) {
      var ch = input[i];

      if (ch === '\\' && input[i + 1] === '<') { buf += '<'; i += 2; continue; }

      if (ch !== '<') { buf += ch; i++; continue; }

      var end = -1, quote = null;
      for (var j = i + 1; j < input.length; j++) {
        var c = input[j];
        if (quote) { if (c === quote) quote = null; continue; }
        if (c === '"' || c === "'") { quote = c; continue; }
        if (c === '>') { end = j; break; }
        if (c === '<') break; // unterminated — treat the '<' as literal text
      }

      if (end === -1) { buf += ch; i++; continue; }

      var raw = input.slice(i + 1, end);
      var parsed = parseTag(raw);
      if (!parsed) { buf += input.slice(i, end + 1); i = end + 1; continue; }

      flush();
      tokens.push(parsed);
      i = end + 1;
    }

    flush();
    return tokens;
  }

  function splitArgs(raw) {
    var out = [], cur = '', quote = null;
    for (var i = 0; i < raw.length; i++) {
      var c = raw[i];
      if (quote) {
        if (c === quote) { quote = null; } else { cur += c; }
        continue;
      }
      if (c === '"' || c === "'") { quote = c; continue; }
      if (c === ':') { out.push(cur); cur = ''; continue; }
      cur += c;
    }
    out.push(cur);
    return out;
  }

  // Returns a tag token, or null when the text between angle brackets isn't a
  // tag we know — the caller then keeps it as literal text.
  function parseTag(raw) {
    var closing = raw[0] === '/';
    if (closing) raw = raw.slice(1);
    if (!raw) return null;

    var args = splitArgs(raw);
    var name = args[0].toLowerCase();
    args = args.slice(1);

    if (DECORATIONS[name]) {
      return { kind: closing ? 'close' : 'open', name: 'deco', deco: DECORATIONS[name] };
    }
    if (name === 'reset') return closing ? null : { kind: 'reset' };
    if (name === 'newline' || name === 'br') return closing ? null : { kind: 'newline' };

    if (name === 'color' || name === 'colour' || name === 'c') {
      var hex = args[0] ? toHex(args[0].toLowerCase()) : null;
      if (closing) return { kind: 'close', name: 'color' };
      if (!hex) return null;
      return { kind: 'open', name: 'color', color: hex };
    }
    if (isColourName(name) || isHex(name)) {
      return closing
        ? { kind: 'close', name: 'color' }
        : { kind: 'open', name: 'color', color: toHex(isHex(name) ? name : name) };
    }

    if (name === 'gradient') {
      if (closing) return { kind: 'close', name: 'gradient' };
      var stops = args.map(function (a) { return toHex(a.toLowerCase()); }).filter(Boolean);
      if (stops.length < 2) stops = ['#FFFFFF', '#000000'];
      return { kind: 'open', name: 'gradient', stops: stops };
    }
    if (name === 'rainbow') {
      return closing ? { kind: 'close', name: 'rainbow' } : { kind: 'open', name: 'rainbow' };
    }

    // <font:minecraft:uniform> and <font:uniform> mean the same thing; the
    // argument split ate the colon, so put it back.
    if (name === 'font') {
      if (closing) return { kind: 'close', name: 'font' };
      if (!args.length || !args[0]) return null;
      return { kind: 'open', name: 'font', font: args.join(':') };
    }

    if (name === 'click') {
      if (closing) return { kind: 'close', name: 'click' };
      if (args.length < 2) return null;
      return { kind: 'open', name: 'click', action: args[0].toLowerCase(), value: args.slice(1).join(':') };
    }
    if (name === 'hover') {
      if (closing) return { kind: 'close', name: 'hover' };
      if (args.length < 2 || args[0].toLowerCase() !== 'show_text') return null;
      return { kind: 'open', name: 'hover', value: args.slice(1).join(':') };
    }

    return null;
  }

  /* ---- parse to runs ---- */

  function blankStyle() {
    return {
      color: null, bold: false, italic: false, underlined: false,
      strikethrough: false, obfuscated: false, click: null, hover: null, font: null
    };
  }

  function cloneStyle(s) {
    return {
      color: s.color, bold: s.bold, italic: s.italic, underlined: s.underlined,
      strikethrough: s.strikethrough, obfuscated: s.obfuscated,
      click: s.click, hover: s.hover, font: s.font
    };
  }

  function lerpHex(a, b, t) {
    var pa = [parseInt(a.slice(1, 3), 16), parseInt(a.slice(3, 5), 16), parseInt(a.slice(5, 7), 16)];
    var pb = [parseInt(b.slice(1, 3), 16), parseInt(b.slice(3, 5), 16), parseInt(b.slice(5, 7), 16)];
    var out = '#';
    for (var i = 0; i < 3; i++) {
      var v = Math.round(pa[i] + (pb[i] - pa[i]) * t);
      out += ('0' + v.toString(16)).slice(-2);
    }
    return out.toUpperCase();
  }

  function gradientAt(stops, t) {
    if (stops.length === 1) return stops[0];
    var scaled = t * (stops.length - 1);
    var idx = Math.min(Math.floor(scaled), stops.length - 2);
    return lerpHex(stops[idx], stops[idx + 1], scaled - idx);
  }

  function hsvToHex(h, s, v) {
    var f = function (n) {
      var k = (n + h * 6) % 6;
      var val = v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
      return ('0' + Math.round(val * 255).toString(16)).slice(-2);
    };
    return ('#' + f(5) + f(3) + f(1)).toUpperCase();
  }

  /*
   * Walks the token stream keeping a style stack. Gradient and rainbow need to
   * know how much text they cover before they can colour any of it, so their
   * runs are buffered and recoloured once the tag closes.
   */
  function parse(input) {
    var tokens = tokenize(String(input == null ? '' : input));
    var runs = [];
    var stack = [blankStyle()];

    // Each entry captures a colouring tag that is still open, along with the
    // index in `runs` where its content began.
    var spans = [];

    function top() { return stack[stack.length - 1]; }

    function push(mutator) {
      var s = cloneStyle(top());
      mutator(s);
      stack.push(s);
    }

    function pop() { if (stack.length > 1) stack.pop(); }

    function emit(text) {
      if (!text) return;
      runs.push({ text: text, style: cloneStyle(top()) });
    }

    function closeSpan(name) {
      for (var i = spans.length - 1; i >= 0; i--) {
        if (spans[i].name !== name) continue;
        applySpan(spans[i], runs.length);
        spans.splice(i, 1);
        pop();
        return;
      }
      pop();
    }

    function applySpan(span, endIndex) {
      var slice = runs.slice(span.start, endIndex);
      var total = slice.reduce(function (n, r) { return n + r.text.length; }, 0);
      if (!total) return;

      var seen = 0;
      var rebuilt = [];
      slice.forEach(function (run) {
        for (var i = 0; i < run.text.length; i++) {
          var t = total === 1 ? 0 : seen / (total - 1);
          var colour = span.name === 'rainbow'
            ? hsvToHex(t * 0.9, 1, 1)
            : gradientAt(span.stops, t);
          var st = cloneStyle(run.style);
          st.color = colour;
          rebuilt.push({ text: run.text[i], style: st });
          seen++;
        }
      });
      runs.splice.apply(runs, [span.start, slice.length].concat(rebuilt));
    }

    tokens.forEach(function (tok) {
      switch (tok.kind) {
        case 'text':
          emit(tok.value);
          break;
        case 'newline':
          emit('\n');
          break;
        case 'reset':
          stack = [blankStyle()];
          spans.length = 0;
          break;
        case 'open':
          if (tok.name === 'deco') {
            push(function (s) { s[tok.deco] = true; });
          } else if (tok.name === 'color') {
            push(function (s) { s.color = tok.color; });
          } else if (tok.name === 'click') {
            push(function (s) { s.click = { action: tok.action, value: tok.value }; });
          } else if (tok.name === 'hover') {
            push(function (s) { s.hover = tok.value; });
          } else if (tok.name === 'font') {
            push(function (s) { s.font = tok.font; });
          } else if (tok.name === 'gradient' || tok.name === 'rainbow') {
            push(function () {});
            spans.push({ name: tok.name, stops: tok.stops || [], start: runs.length });
          }
          break;
        case 'close':
          if (tok.name === 'gradient' || tok.name === 'rainbow') closeSpan(tok.name);
          else pop();
          break;
      }
    });

    // Tags left open at the end of the string still colour what they cover.
    while (spans.length) applySpan(spans.pop(), runs.length);

    return runs.filter(function (r) { return r.text.length > 0; });
  }

  /* ---- consumers ---- */

  /*
   * The game draws text shadow as a copy of the glyph with red, green and blue
   * each divided by four, offset south-east by an eighth of the character.
   * Doing the same here rather than using one fixed grey means coloured text
   * gets a coloured shadow, as it does in game.
   */
  function shadowOf(hex) {
    var c = hex || '#FFFFFF';
    var out = '#';
    for (var i = 1; i < 7; i += 2) {
      out += ('0' + Math.floor(parseInt(c.slice(i, i + 2), 16) / 4).toString(16)).slice(-2);
    }
    return out;
  }

  // Builds real DOM nodes rather than an HTML string. Preview text comes from
  // whatever the user typed, so keeping it out of the HTML parser entirely
  // means a stray "<script>" is text and can never be anything else.
  function toFragment(input) {
    var frag = document.createDocumentFragment();

    parse(input).forEach(function (run) {
      var s = run.style;

      // Split on newlines so <newline> and literal line breaks both work.
      run.text.split('\n').forEach(function (chunk, i) {
        if (i > 0) frag.appendChild(document.createElement('br'));
        if (!chunk) return;

        var span = document.createElement('span');
        span.className = 'mm'
          + (s.obfuscated ? ' mm-obf' : '')
          + (s.click || s.hover ? ' mm-interactive' : '');
        span.textContent = chunk;

        var colour = s.color || '#FFFFFF';
        if (s.color) span.style.color = s.color;

        if (s.font && global.Fonts) {
          span.style.fontFamily = Fonts.familyFor(s.font);
          Fonts.ensureLoaded(s.font);
          if (!Fonts.isFaithful(s.font)) span.classList.add('mm-unfaithful');
        }

        // The rune fonts have no font file — each character is a sprite, so
        // the text is swapped for pictures rather than restyled.
        if (s.font && global.GlyphFont && GlyphFont.has(s.font)) {
          span.textContent = '';
          span.appendChild(GlyphFont.render(chunk, s.font, shadowOf(s.color)));
        }

        // Bold is not a heavier face in Minecraft — the glyph is simply drawn
        // a second time one pixel to the right. Same for the shadow underneath.
        var layers = [];
        if (s.bold) layers.push('1px 0 0 ' + colour);
        layers.push('0.125em 0.125em 0 ' + shadowOf(s.color));
        if (s.bold) layers.push('calc(1px + 0.125em) 0.125em 0 ' + shadowOf(s.color));
        span.style.textShadow = layers.join(', ');

        // No italic face exists, so the browser shears the glyphs — which is
        // exactly what the game does.
        if (s.italic) span.style.fontStyle = 'italic';

        var deco = [];
        if (s.underlined) deco.push('underline');
        if (s.strikethrough) deco.push('line-through');
        if (deco.length) span.style.textDecoration = deco.join(' ');

        if (s.hover) span.title = plain(s.hover);
        else if (s.click) span.title = s.click.action + ': ' + s.click.value;

        frag.appendChild(span);
      });
    });

    return frag;
  }

  // Replaces a node's children with the rendered text.
  function into(node, input) {
    node.textContent = '';
    node.appendChild(toFragment(input));
    return node;
  }

  function plain(input) {
    return parse(input).map(function (r) { return r.text; }).join('');
  }

  // Serialises to the text-component shape the dialog JSON expects. A string
  // with no styling stays a bare string, which is what the format allows and
  // what keeps hand-written examples readable.
  function toComponent(input) {
    var runs = parse(input);
    if (!runs.length) return '';

    var styled = runs.map(function (run) {
      var o = { text: run.text };
      var s = run.style;
      if (s.color) o.color = NAMED_BY_HEX[s.color] || s.color.toLowerCase();
      if (s.bold) o.bold = true;
      if (s.italic) o.italic = true;
      if (s.underlined) o.underlined = true;
      if (s.strikethrough) o.strikethrough = true;
      if (s.obfuscated) o.obfuscated = true;
      if (s.font) o.font = global.Fonts ? Fonts.normalise(s.font) : s.font;
      if (s.click) {
        var ev = { action: s.click.action };
        if (s.click.action === 'open_url') ev.url = s.click.value;
        else if (s.click.action === 'run_command' || s.click.action === 'suggest_command') ev.command = s.click.value;
        else if (s.click.action === 'copy_to_clipboard') ev.value = s.click.value;
        else ev.value = s.click.value;
        o.click_event = ev;
      }
      if (s.hover) o.hover_event = { action: 'show_text', value: toComponent(s.hover) };
      return o;
    });

    if (styled.length === 1 && Object.keys(styled[0]).length === 1) return styled[0].text;
    if (styled.length === 1) return styled[0];

    // A leading empty string stops the first run's styling from being
    // inherited by every sibling that follows it.
    return [''].concat(styled);
  }

  function hasTags(input) {
    return plain(input) !== String(input == null ? '' : input);
  }

  global.MiniMessage = {
    parse: parse,
    toFragment: toFragment,
    into: into,
    toComponent: toComponent,
    plain: plain,
    hasTags: hasTags,
    NAMED: NAMED
  };
})(window);
