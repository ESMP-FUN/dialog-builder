/*
 * The Fonts panel: what fonts exist, how to use one, and how to turn a font
 * you dropped in into the resource pack that makes it work on your server.
 */
(function (global) {
  'use strict';

  var onInsert = function () {};

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function tagFor(key) { return '<font:' + key + '>your text</font>'; }

  function copyButton(text, label) {
    var b = el('button', 'font-copy', label || 'Copy tag');
    b.title = 'Copy ' + text;
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      navigator.clipboard.writeText(text).then(function () {
        var was = b.textContent;
        b.textContent = 'Copied';
        b.classList.add('is-done');
        setTimeout(function () { b.textContent = was; b.classList.remove('is-done'); }, 1200);
      });
    });
    return b;
  }

  function fontCard(f) {
    var card = el('div', 'font-card' + (f.faithful === false ? ' is-approx' : ''));

    var head = el('div', 'font-card-head');
    head.appendChild(el('strong', null, f.name));
    if (f.isCustom) head.appendChild(el('span', 'font-pill', 'yours'));
    else if (f.faithful === false) head.appendChild(el('span', 'font-pill is-warn', 'approximate'));
    card.appendChild(head);

    // Rendered through the same pipeline the dialog uses, so the card shows
    // exactly what the preview will.
    var sample = el('div', 'font-sample');
    MiniMessage.into(sample, '<font:' + f.key + '>'
      + (f.sample || 'The quick brown fox 0123') + '</font>');
    card.appendChild(sample);

    card.appendChild(el('code', 'font-key', f.key));
    card.appendChild(el('p', 'font-blurb', f.blurb || 'A font from your own resource pack.'));

    if (f.why) card.appendChild(el('p', 'font-why', f.why));

    var actions = el('div', 'font-actions');

    var use = el('button', 'font-copy', 'Use here');
    use.title = 'Wrap the selected element\'s text in this font';
    use.addEventListener('click', function () { onInsert(f.key); });
    actions.appendChild(use);

    actions.appendChild(copyButton(tagFor(f.key)));

    if (f.isCustom) {
      var pack = el('button', 'font-copy', 'Resource pack');
      pack.title = 'Download a ready-made resource pack containing this font';
      pack.addEventListener('click', function () { downloadPack(f); });
      actions.appendChild(pack);

      var del = el('button', 'font-copy is-danger', 'Remove');
      del.addEventListener('click', function () { Fonts.remove(f.key); });
      actions.appendChild(del);
    }

    card.appendChild(actions);
    return card;
  }

  /* ---- resource pack ---- */

  function downloadPack(entry) {
    var paths = Fonts.packPaths(entry);

    var readme = 'This pack adds one font: ' + entry.key + '\n\n'
      + 'To use it:\n'
      + '  1. Drop this .zip into your server\'s resource pack, or into\n'
      + '     .minecraft/resourcepacks/ to try it in single player.\n'
      + '  2. Turn the pack on.\n'
      + '  3. In your dialog text, write:\n'
      + '       ' + tagFor(entry.key) + '\n\n'
      + 'Every player who should see the font needs the pack — without it the\n'
      + 'game quietly falls back to the normal font.\n';

    var blob = Zip.build([
      { name: 'pack.mcmeta', bytes: Zip.textBytes(Fonts.packMeta(entry)) },
      { name: 'README.txt', bytes: Zip.textBytes(readme) },
      { name: paths.json, bytes: Zip.textBytes(Fonts.providerJson(entry)) },
      { name: paths.font, bytes: Zip.dataUrlBytes(entry.dataUrl) }
    ]);

    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = entry.key.replace(/[:/]/g, '-') + '-pack.zip';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  /* ---- adding a font ---- */

  var pending = null;

  function askForKey(file, host) {
    pending = file;

    var box = el('div', 'font-drop-form');
    box.appendChild(el('p', 'font-blurb', 'Adding ' + file.name + '. Give it a name — this is '
      + 'what you will write in your text, and what the resource pack will be built around.'));

    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'control';
    input.value = 'mypack:' + file.name.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9_-]+/g, '_');
    box.appendChild(input);

    var err = el('p', 'font-error');
    box.appendChild(err);

    var row = el('div', 'font-actions');
    var ok = el('button', 'font-copy', 'Add font');
    ok.addEventListener('click', function () {
      Fonts.add(pending, input.value).then(function () {
        pending = null;
        render(host);
      }).catch(function (e) { err.textContent = e.message; });
    });
    var cancel = el('button', 'font-copy', 'Cancel');
    cancel.addEventListener('click', function () { pending = null; render(host); });
    row.appendChild(ok);
    row.appendChild(cancel);
    box.appendChild(row);

    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') ok.click(); });
    return box;
  }

  function dropZone(host) {
    var zone = el('div', 'font-drop');
    zone.appendChild(el('strong', null, 'Add your own font'));
    zone.appendChild(el('span', 'font-blurb',
      'Drop a .ttf or .otf here, or click to pick one. It stays in your browser — nothing '
      + 'is uploaded anywhere.'));

    var picker = document.createElement('input');
    picker.type = 'file';
    picker.accept = '.ttf,.otf';
    picker.style.display = 'none';
    picker.addEventListener('change', function () {
      if (picker.files[0]) render(host, picker.files[0]);
    });
    zone.appendChild(picker);

    zone.addEventListener('click', function () { picker.click(); });

    ['dragenter', 'dragover'].forEach(function (t) {
      zone.addEventListener(t, function (e) {
        e.preventDefault();
        zone.classList.add('is-over');
      });
    });
    ['dragleave', 'drop'].forEach(function (t) {
      zone.addEventListener(t, function (e) {
        e.preventDefault();
        zone.classList.remove('is-over');
      });
    });
    zone.addEventListener('drop', function (e) {
      var file = e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) render(host, file);
    });

    return zone;
  }

  /* ---- rendering ---- */

  function render(host, incoming) {
    host.textContent = '';

    var sec = el('section', 'palette-group');
    sec.appendChild(el('h3', 'panel-heading', 'Fonts'));
    sec.appendChild(el('p', 'palette-note',
      'Any piece of text can ask for a different font. Wrap it in a font tag — or select '
      + 'something in the dialog and press "Use here".'));

    Fonts.all().forEach(function (f) { sec.appendChild(fontCard(f)); });

    if (incoming) sec.appendChild(askForKey(incoming, host));
    else sec.appendChild(dropZone(host));

    if (Fonts.storageFull()) {
      sec.appendChild(el('p', 'font-error',
        'That font was too big for this browser to remember, so it will be gone when you '
        + 'reload. It works fine until then, and the resource pack download still works.'));
    }

    host.appendChild(sec);
  }

  function init(host, insertHandler) {
    onInsert = insertHandler;
    Fonts.onChange(function () { render(host); });

    // A font dropped anywhere on the page is meant for this panel.
    ['dragover', 'drop'].forEach(function (t) {
      document.addEventListener(t, function (e) {
        var items = e.dataTransfer && e.dataTransfer.items;
        if (!items || !items.length || items[0].kind !== 'file') return;
        e.preventDefault();
        if (t === 'drop') {
          var file = e.dataTransfer.files[0];
          if (file && /\.(ttf|otf)$/i.test(file.name)) render(host, file);
        }
      });
    });

    Fonts.load().then(function () { render(host); });
    render(host);
  }

  global.FontPanel = { init: init, render: render };
})(window);
