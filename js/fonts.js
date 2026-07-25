/*
 * Fonts.
 *
 * A text component carries a font key, so any piece of text in a dialog can
 * ask for a different one. Java Edition ships four:
 *
 *   minecraft:default     Mojangles, the pixel font almost everything uses
 *   minecraft:uniform     GNU Unifont, the fallback for unusual characters
 *   minecraft:alt         Standard Galactic Alphabet (the enchanting table)
 *   minecraft:illageralt  Illager runes, unused by the game itself
 *
 * Anything beyond those has to come from a resource pack, which is what the
 * drag-and-drop side of this is for: drop a .ttf in, give it a key, and the
 * builder can hand you back the pack that makes the key real.
 *
 * The last two are bitmap fonts inside the game with no font file to borrow,
 * so the preview says so rather than quietly drawing the wrong glyphs.
 */
(function (global) {
  'use strict';

  var STORE_KEY = 'mc-dialog-builder:fonts';
  var STACK = '"MC Default", ui-monospace, Consolas, monospace';

  var BUILT_IN = [
    {
      key: 'minecraft:default',
      name: 'Mojangles (default)',
      family: '"MC Default"',
      blurb: 'The pixel font the game uses for nearly everything. Leave text on this '
        + 'unless you have a reason not to.',
      faithful: true
    },
    {
      key: 'minecraft:uniform',
      name: 'GNU Unifont',
      family: '"MC Uniform"',
      blurb: 'The even-width fallback font. The game switches to it for characters '
        + 'Mojangles has no glyph for, and players can force it on for readability.',
      faithful: true,
      lazy: 'fonts/unifont-17.0.05.otf'
    },
    {
      key: 'minecraft:alt',
      name: 'Standard Galactic Alphabet',
      family: STACK,
      blurb: 'The runes on the enchanting table. Readable as a novelty, not as words.',
      faithful: false,
      why: 'This is a picture-based font inside the game with no font file to borrow, so '
        + 'the preview shows ordinary letters. In game your text really will come out as runes.'
    },
    {
      key: 'minecraft:illageralt',
      name: 'Illageralt',
      family: STACK,
      blurb: 'Illager runes. The game never uses these itself, but the font is there.',
      faithful: false,
      why: 'Another picture-based font with no file to borrow, so the preview shows '
        + 'ordinary letters. In game your text really will come out as runes.'
    }
  ];

  // Custom fonts the user dropped in: { key, name, family, dataUrl, fileName }
  var custom = [];
  var loaded = {};
  var listeners = [];

  function onChange(fn) { listeners.push(fn); }
  function fire() { listeners.forEach(function (fn) { fn(); }); }

  function all() { return BUILT_IN.concat(custom); }

  function find(key) {
    var wanted = normalise(key);
    var hit = all().filter(function (f) { return f.key === wanted; })[0];
    return hit || null;
  }

  // "uniform" and "minecraft:uniform" mean the same thing.
  function normalise(key) {
    var k = String(key || '').trim();
    if (!k) return 'minecraft:default';
    return k.indexOf(':') < 0 ? 'minecraft:' + k : k;
  }

  function familyFor(key) {
    var f = find(key);
    return f ? f.family : STACK;
  }

  function isFaithful(key) {
    var f = find(key);
    return f ? f.faithful !== false : true;
  }

  /*
   * Unifont is five megabytes, and most dialogs never touch it. It is only
   * fetched the first time something actually asks for that font.
   */
  function ensureLoaded(key) {
    var f = find(key);
    if (!f || !f.lazy || loaded[f.key]) return;
    loaded[f.key] = true;

    if (!global.FontFace) return;
    var face = new global.FontFace(f.family.replace(/"/g, ''), 'url(' + f.lazy + ')');
    face.load().then(function (l) {
      document.fonts.add(l);
      fire();
    }).catch(function () {
      // Missing font file is not worth breaking the page over; the fallback
      // stack still renders something legible.
      loaded[f.key] = false;
    });
  }

  /* ---- custom fonts ---- */

  function familyName(key) {
    return 'MCF ' + key.replace(/[^A-Za-z0-9]+/g, '_');
  }

  function register(entry) {
    if (!global.FontFace) return Promise.resolve();
    var face = new global.FontFace(familyName(entry.key), 'url(' + entry.dataUrl + ')');
    return face.load().then(function (l) { document.fonts.add(l); });
  }

  /**
   * Takes a dropped or chosen file and adds it under `key`. Resolves with the
   * new entry, or rejects with a message worth showing the user.
   */
  function add(file, key) {
    key = normalise(key);

    if (!/\.(ttf|otf)$/i.test(file.name)) {
      return Promise.reject(new Error('That is not a font file. Minecraft only accepts '
        + '.ttf and .otf fonts in a resource pack.'));
    }
    if (BUILT_IN.some(function (b) { return b.key === key; })) {
      return Promise.reject(new Error('"' + key + '" is one of the game\'s own fonts. '
        + 'Pick a different name, like mypack:' + file.name.replace(/\.[^.]+$/, '').toLowerCase() + '.'));
    }
    if (!/^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(key)) {
      return Promise.reject(new Error('A font name looks like mypack:fancy — lower case, '
        + 'with a colon in the middle.'));
    }

    return readAsDataUrl(file).then(function (dataUrl) {
      var entry = {
        key: key,
        name: file.name.replace(/\.[^.]+$/, ''),
        family: '"' + familyName(key) + '", ' + STACK,
        fileName: file.name.replace(/[^A-Za-z0-9_.-]/g, '_'),
        dataUrl: dataUrl,
        bytes: file.size,
        faithful: true,
        isCustom: true
      };

      custom = custom.filter(function (c) { return c.key !== key; }).concat([entry]);
      return register(entry).then(function () {
        save();
        fire();
        return entry;
      });
    });
  }

  function remove(key) {
    custom = custom.filter(function (c) { return c.key !== key; });
    save();
    fire();
  }

  function readAsDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(r.result); };
      r.onerror = function () { reject(new Error('That file could not be read.')); };
      r.readAsDataURL(file);
    });
  }

  /* ---- persistence ----
   * Fonts are stored whole so they survive a reload. Browsers cap this at a
   * few megabytes, so a font too big to keep is still usable for the session
   * and simply says so.
   */

  var overflowed = false;

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(custom));
      overflowed = false;
    } catch (e) {
      overflowed = true;
    }
  }

  function load() {
    var raw;
    try { raw = localStorage.getItem(STORE_KEY); } catch (e) { return Promise.resolve(); }
    if (!raw) return Promise.resolve();

    try { custom = JSON.parse(raw) || []; } catch (e) { custom = []; }
    return Promise.all(custom.map(function (c) {
      return register(c).catch(function () { /* skip a font that will not parse */ });
    })).then(fire);
  }

  function storageFull() { return overflowed; }

  /* ---- resource pack ---- */

  function providerJson(entry) {
    var ns = entry.key.split(':')[0];
    return JSON.stringify({
      providers: [
        {
          type: 'ttf',
          file: ns + ':' + entry.fileName,
          shift: [0, 0],
          size: 11,
          oversample: 2
        }
      ]
    }, null, 2);
  }

  function packPaths(entry) {
    var parts = entry.key.split(':');
    var ns = parts[0];
    var name = parts[1];
    return {
      json: 'assets/' + ns + '/font/' + name + '.json',
      font: 'assets/' + ns + '/font/' + entry.fileName
    };
  }

  global.Fonts = {
    BUILT_IN: BUILT_IN,
    all: all,
    custom: function () { return custom.slice(); },
    find: find,
    normalise: normalise,
    familyFor: familyFor,
    isFaithful: isFaithful,
    ensureLoaded: ensureLoaded,
    add: add,
    remove: remove,
    load: load,
    storageFull: storageFull,
    providerJson: providerJson,
    packPaths: packPaths,
    onChange: onChange
  };
})(window);
