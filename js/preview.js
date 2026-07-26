/*
 * Draws the dialog the way the client actually draws it.
 *
 * Checked against the screenshots on the wiki, the real screen is three parts:
 *
 *   a dark header band holding the title and the warning button,
 *   a content area the blurred world shows straight through,
 *   a dark footer band holding the exit / confirm buttons.
 *
 * Everything in the content area is one centred column — body elements, then
 * inputs, then (for multi-action only) a grid of buttons. Nothing sits beside
 * anything else, so the only layout choices are order and grid width.
 *
 * Sizes in the format are GUI units: one unit is one pixel at GUI scale 1, so
 * the preview just multiplies by a zoom factor.
 */
(function (global) {
  'use strict';

  var UNIT = 2;

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function mm(node, value) { return MiniMessage.into(node, value); }
  function u(n) { return (n * UNIT) + 'px'; }
  function setZoom(z) { UNIT = z; }

  // Handed in by the app so a click on a live control can update the document
  // without rebuilding the whole page and losing focus.
  var hooks = {};

  /* ---- body ---- */

  function renderBodyElement(b) {
    var wrap = el('div', 'mc-el mc-body');
    wrap.dataset.id = b._id;

    if (b.type === 'plain_message') {
      var msg = el('div', 'mc-plain');
      msg.style.width = u(b.width);
      mm(msg, b.contents);
      wrap.appendChild(msg);
    } else {
      var row = el('div', 'mc-item-row');
      var slot = el('div', 'mc-item-slot');
      slot.style.width = u(Math.max(b.width, 16));
      slot.style.height = u(Math.max(b.height, 16));
      slot.title = b.item_id;

      var src = Icons.iconFor(b.item_id);
      if (src) {
        var img = el('img', 'mc-item-img');
        img.src = src;
        img.alt = b.item_id;
        slot.appendChild(img);
      } else {
        var short = b.item_id.replace(/^.*:/, '').replace(/_/g, ' ');
        slot.appendChild(el('span', 'mc-item-glyph', short.slice(0, 2).toUpperCase()));
      }

      if (b.show_decoration && b.count > 1) {
        slot.appendChild(el('span', 'mc-item-count', String(b.count)));
      }
      row.appendChild(slot);

      if (MiniMessage.plain(b.description).trim()) {
        var desc = el('div', 'mc-plain mc-item-desc');
        desc.style.width = u(b.description_width);
        mm(desc, b.description);
        row.appendChild(desc);
      }
      wrap.appendChild(row);
    }
    return wrap;
  }

  /* ---- inputs ----
   * These are live: clicking a checkbox ticks it, clicking a choice cycles it,
   * dragging a slider moves it. What you set here is the input's starting
   * value, which is exactly what those fields mean in the format.
   */

  function renderInput(input) {
    var wrap = el('div', 'mc-el mc-input');
    wrap.dataset.id = input._id;

    if (input.type === 'boolean') {
      var row = el('div', 'mc-checkbox-row');
      var box = el('div', 'mc-checkbox' + (input.initial ? ' is-on' : ''));
      box.title = 'Click to tick or untick — this sets the starting value';
      if (input.initial) box.appendChild(el('span', 'mc-check', '✔'));
      box.addEventListener('click', function (e) {
        e.stopPropagation();
        input.initial = !input.initial;
        hooks.edited(input._id);
      });
      row.appendChild(box);
      row.appendChild(mm(el('span', 'mc-label'), input.label));
      wrap.appendChild(row);

    } else if (input.type === 'text') {
      // The label sits above the box, centred.
      if (input.label_visible) {
        wrap.appendChild(mm(el('div', 'mc-label mc-label-above'), input.label));
      }
      var field = el('div', 'mc-textfield' + (input.multiline ? ' is-multiline' : ''));
      field.style.width = u(input.width);
      if (input.multiline) field.style.height = u(input.height);

      var entry = document.createElement(input.multiline ? 'textarea' : 'input');
      entry.className = 'mc-textentry';
      if (!input.multiline) entry.type = 'text';
      entry.value = input.initial || '';
      entry.maxLength = input.max_length;
      entry.spellcheck = false;
      entry.title = 'Type here to set the starting value';
      entry.addEventListener('input', function () {
        input.initial = entry.value;
        hooks.edited(input._id, true);
      });
      // Clicking into the box has to show its options, but without a redraw —
      // that would destroy the box being typed into.
      entry.addEventListener('focus', function () { hooks.select(input._id); });
      entry.addEventListener('click', function (e) { e.stopPropagation(); });
      field.appendChild(entry);
      wrap.appendChild(field);

    } else if (input.type === 'single_option') {
      // A cycling button. With the label shown the client writes
      // "Label: Choice" onto the button face.
      var at = input.options.findIndex(function (o) { return o.initial; });
      if (at < 0) at = 0;
      var chosen = input.options[at];

      var btn = el('div', 'mc-button mc-option');
      btn.style.width = u(input.width);
      btn.title = 'Click to cycle through the choices';

      var face = el('span', 'mc-button-label');
      var text = (input.label_visible && MiniMessage.plain(input.label).trim())
        ? input.label + ': ' + (chosen ? chosen.display : '')
        : (chosen ? chosen.display : '');
      mm(face, text);
      btn.appendChild(face);

      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (!input.options.length) return;
        var next = (at + 1) % input.options.length;
        input.options.forEach(function (o, i) { o.initial = (i === next); });
        hooks.edited(input._id);
      });
      wrap.appendChild(btn);

    } else if (input.type === 'number_range') {
      var slider = el('div', 'mc-slider');
      slider.style.width = u(input.width);
      slider.title = 'Drag to set the starting value';

      var span = (input.end - input.start) || 1;
      var pct = Math.max(0, Math.min(1, (input.initial - input.start) / span));

      var handle = el('div', 'mc-slider-handle');
      handle.style.width = u(8);
      // The handle is 8 units wide, so its travel is the track minus its width.
      handle.style.left = 'calc(' + (pct * 100) + '% - ' + (pct * 8 * UNIT) + 'px)';
      slider.appendChild(handle);

      var faceText = input.label_format === 'options.generic_value'
        ? input.label + ': ' + trim(input.initial)
        : trim(input.initial);
      var sliderLabel = mm(el('span', 'mc-slider-label'), faceText);
      slider.appendChild(sliderLabel);

      dragSlider(slider, handle, sliderLabel, input);
      wrap.appendChild(slider);
    }

    return wrap;
  }

  // Keeps the displayed value free of the float dust that whole steps produce.
  function trim(v) {
    return Math.abs(v - Math.round(v)) < 1e-9 ? String(Math.round(v)) : String(Number(v.toFixed(4)));
  }

  // Redrawing the whole preview on every pointermove would detach the very
  // node being measured, so a drag updates the handle and label in place and
  // only asks for a full redraw once the pointer is released.
  function dragSlider(track, handle, label, input) {
    function setFrom(clientX) {
      var r = track.getBoundingClientRect();
      if (!r.width) return;

      var t = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
      var raw = input.start + t * (input.end - input.start);
      if (input.step > 0) {
        raw = input.start + Math.round((raw - input.start) / input.step) * input.step;
      }
      input.initial = Math.max(input.start, Math.min(input.end, Number(raw.toFixed(6))));

      var span = (input.end - input.start) || 1;
      var pct = Math.max(0, Math.min(1, (input.initial - input.start) / span));
      handle.style.left = 'calc(' + (pct * 100) + '% - ' + (pct * 8 * UNIT) + 'px)';
      mm(label, input.label_format === 'options.generic_value'
        ? input.label + ': ' + trim(input.initial)
        : trim(input.initial));

      hooks.edited(input._id, true);
    }

    track.addEventListener('pointerdown', function (e) {
      e.stopPropagation();
      e.preventDefault();
      // Grabbing the slider counts as selecting it, so its options open even
      // though the drag below suppresses the click that would normally do it.
      hooks.select(input._id);
      setFrom(e.clientX);

      function onMove(ev) { setFrom(ev.clientX); }
      function onUp() {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        hooks.edited(input._id);
      }
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });
  }

  /* ---- buttons ---- */

  function renderButton(b) {
    var btn = el('div', 'mc-button');
    btn.style.width = u(b.width);
    mm(btn.appendChild(el('span', 'mc-button-label')), b.label);
    if (MiniMessage.plain(b.tooltip).trim()) btn.title = MiniMessage.plain(b.tooltip);

    var badge = {
      open_url: 'link', run_command: 'cmd', suggest_command: 'chat',
      copy_to_clipboard: 'copy', show_dialog: 'dialog', custom: 'custom',
      dynamic_run_command: 'cmd+', dynamic_custom: 'submit'
    }[b.action.type];
    if (badge) btn.appendChild(el('span', 'mc-button-badge', badge));

    return btn;
  }

  /* ---- element chrome ---- */

  // Move and delete controls, so reordering never depends on a drag landing
  // correctly. Shown on hover and whenever the element is selected.
  function addControls(wrap, id, movable) {
    var bar = el('div', 'el-controls');

    if (movable) {
      [['↑', -1, 'Move up'], ['↓', 1, 'Move down']].forEach(function (spec) {
        var b = el('button', 'el-ctl', spec[0]);
        b.title = spec[2];
        b.addEventListener('click', function (e) {
          e.stopPropagation();
          hooks.move(id, spec[1]);
        });
        bar.appendChild(b);
      });

      var del = el('button', 'el-ctl is-danger', '✕');
      del.title = 'Remove';
      del.addEventListener('click', function (e) {
        e.stopPropagation();
        hooks.remove(id);
      });
      bar.appendChild(del);
    } else {
      var note = el('span', 'el-ctl is-note', 'fixed');
      note.title = 'This dialog type always has this button, so it cannot be moved or removed.';
      bar.appendChild(note);
    }

    wrap.appendChild(bar);
  }

  function wrapEl(node, id, movable) {
    var w = el('div', 'mc-el');
    w.dataset.id = id;
    w.appendChild(node);
    addControls(w, id, movable);
    return w;
  }

  function emptyHint(text) { return el('div', 'mc-empty', text); }

  /* ---- the screen ---- */

  function render(dialog, opts) {
    opts = opts || {};
    hooks = opts.hooks || {
      edited: function () {}, select: function () {},
      move: function () {}, remove: function () {}
    };

    var info = Model.typeInfo(dialog.type);

    var screen = el('div', 'mc-screen');
    var dialogEl = el('div', 'mc-dialog');

    /* header band */
    var header = el('div', 'mc-header');
    var titleRow = el('div', 'mc-title-row');
    titleRow.appendChild(mm(el('span', 'mc-title'), dialog.title));

    // The warning button. In game it leaves the world and returns to the
    // title screen — it is always there and cannot be turned off.
    var warn = McIcons.button('warning', 'mc-warning');
    Tooltip.attach(warn, {
      title: 'The game puts this here',
      body: 'Every dialog shows this button to the right of its title. Clicking it in game '
        + 'leaves the world and returns to the title screen.\n\n'
        + 'You cannot move it, change it or turn it off, so there is nothing to set here.'
    });
    titleRow.appendChild(warn);

    header.appendChild(titleRow);
    dialogEl.appendChild(header);

    /* content */
    var content = el('div', 'mc-content');

    var bodyZone = el('div', 'mc-zone');
    bodyZone.dataset.zone = 'body';
    if (!dialog.body.length) bodyZone.appendChild(emptyHint('Text and items go here'));
    dialog.body.forEach(function (b) {
      var node = renderBodyElement(b);
      addControls(node, b._id, true);
      bodyZone.appendChild(node);
    });
    content.appendChild(bodyZone);

    var inputZone = el('div', 'mc-zone');
    inputZone.dataset.zone = 'inputs';
    if (!dialog.inputs.length) {
      inputZone.appendChild(emptyHint('Toggles, sliders, text fields and choices go here'));
    }
    dialog.inputs.forEach(function (i) {
      var node = renderInput(i);
      addControls(node, i._id, true);
      inputZone.appendChild(node);
    });
    content.appendChild(inputZone);

    if (info.buttons === 'list') {
      var actionZone = el('div', 'mc-zone mc-grid');
      actionZone.dataset.zone = 'actions';
      actionZone.style.gridTemplateColumns = 'repeat(' + Math.max(1, dialog.columns) + ', auto)';
      if (!dialog.actions.length) actionZone.appendChild(emptyHint('Buttons go here'));
      dialog.actions.forEach(function (b) {
        actionZone.appendChild(wrapEl(renderButton(b), b._id, true));
      });
      content.appendChild(actionZone);
    }

    if (dialog.type === 'server_links') {
      content.appendChild(stubGrid(dialog, ['Website', 'Discord', 'Rules', 'Store'],
        'The game fills these in from your server\'s own link list — they cannot be set here.'));
    }

    if (dialog.type === 'dialog_list') {
      content.appendChild(stubGrid(dialog,
        dialog.dialogs.filter(function (id) { return id.trim(); })
          .map(function (id) { return id.replace(/^.*[:/]/, '').replace(/_/g, ' '); }),
        'Each button is named by the external title of the dialog it opens.'));
    }

    dialogEl.appendChild(content);

    /* footer band */
    var footer = el('div', 'mc-footer');
    if (info.buttons === 'single') {
      footer.appendChild(wrapEl(renderButton(dialog.action), dialog.action._id, false));
    } else if (info.buttons === 'yesno') {
      footer.appendChild(wrapEl(renderButton(dialog.yes), dialog.yes._id, false));
      footer.appendChild(wrapEl(renderButton(dialog.no), dialog.no._id, false));
    } else if (dialog.has_exit_action) {
      footer.appendChild(wrapEl(renderButton(dialog.exit_action), dialog.exit_action._id, false));
    }
    if (footer.children.length) dialogEl.appendChild(footer);

    screen.appendChild(dialogEl);

    if (opts.selectedId) {
      var sel = screen.querySelector('[data-id="' + opts.selectedId + '"]');
      if (sel) sel.classList.add('is-selected');
    }

    return screen;
  }

  function stubGrid(dialog, names, note) {
    var grid = el('div', 'mc-zone mc-grid mc-stub');
    grid.style.gridTemplateColumns = 'repeat(' + Math.max(1, dialog.columns) + ', auto)';
    names.forEach(function (name) {
      var b = el('div', 'mc-button is-stub');
      b.style.width = u(dialog.button_width);
      b.appendChild(el('span', 'mc-button-label', name));
      grid.appendChild(b);
    });
    grid.appendChild(el('div', 'mc-stub-note', note));
    return grid;
  }

  global.Preview = {
    render: render,
    setZoom: setZoom,
    unit: function () { return UNIT; }
  };
})(window);
