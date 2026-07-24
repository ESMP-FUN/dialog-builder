/*
 * Draws the dialog the way the client lays it out: a single centred column of
 * title, body elements, inputs, then a footer button grid. Nothing sits beside
 * anything else, which is why the builder only ever asks "which zone, and in
 * what order" rather than "where on the screen".
 *
 * Sizes in the format are given in GUI units. One unit is one pixel at GUI
 * scale 1, so the preview simply multiplies by a zoom factor.
 */
(function (global) {
  'use strict';

  var UNIT = 2; // css pixels per GUI unit

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function mm(node, value) { return MiniMessage.into(node, value); }

  function u(n) { return (n * UNIT) + 'px'; }

  function setZoom(z) { UNIT = z; }

  /* ---- individual pieces ---- */

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
      slot.style.width = u(b.width);
      slot.style.height = u(b.height);
      slot.title = b.item_id;

      var short = b.item_id.replace(/^.*:/, '').replace(/_/g, ' ');
      slot.appendChild(el('span', 'mc-item-glyph', short.slice(0, 2).toUpperCase()));
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

  function renderInput(input) {
    var wrap = el('div', 'mc-el mc-input');
    wrap.dataset.id = input._id;

    if (input.type === 'boolean') {
      // The checkbox sits first with its label to the right of it.
      var row = el('div', 'mc-checkbox-row');
      var box = el('div', 'mc-checkbox' + (input.initial ? ' is-on' : ''));
      if (input.initial) box.textContent = '✔';
      row.appendChild(box);
      row.appendChild(mm(el('span', 'mc-label'), input.label));
      wrap.appendChild(row);

    } else if (input.type === 'text') {
      if (input.label_visible) {
        wrap.appendChild(mm(el('div', 'mc-label mc-label-above'), input.label));
      }
      var field = el('div', 'mc-textfield' + (input.multiline ? ' is-multiline' : ''));
      field.style.width = u(input.width);
      if (input.multiline) field.style.height = u(input.height);
      var val = input.initial || '';
      field.appendChild(el('span', 'mc-textfield-value' + (val ? '' : ' is-empty'), val));
      field.appendChild(el('span', 'mc-caret'));
      wrap.appendChild(field);

    } else if (input.type === 'single_option') {
      // Rendered as a cycling button. With the label shown, the client writes
      // "Label: Choice" onto the button face.
      var chosen = input.options.filter(function (o) { return o.initial; })[0] || input.options[0];
      var btn = el('div', 'mc-button mc-option');
      btn.style.width = u(input.width);
      var face = el('span', 'mc-button-label');
      var text = (input.label_visible && MiniMessage.plain(input.label).trim())
        ? input.label + ': ' + (chosen ? chosen.display : '')
        : (chosen ? chosen.display : '');
      mm(face, text);
      btn.appendChild(face);
      wrap.appendChild(btn);

    } else if (input.type === 'number_range') {
      var slider = el('div', 'mc-slider');
      slider.style.width = u(input.width);

      var span = (input.end - input.start) || 1;
      var pct = Math.max(0, Math.min(1, (input.initial - input.start) / span));
      var handle = el('div', 'mc-slider-handle');
      // The handle is 8 units wide, so its travel is the track minus its width.
      handle.style.left = 'calc(' + (pct * 100) + '% - ' + (pct * 8 * UNIT) + 'px)';
      handle.style.width = u(8);
      slider.appendChild(handle);

      var faceText = input.label_format === 'options.generic_value'
        ? input.label + ': ' + input.initial
        : String(input.initial);
      slider.appendChild(mm(el('span', 'mc-slider-label'), faceText));
      wrap.appendChild(slider);
    }

    return wrap;
  }

  function renderButton(b) {
    var btn = el('div', 'mc-button');
    btn.style.width = u(b.width);
    var face = el('span', 'mc-button-label');
    mm(face, b.label);
    btn.appendChild(face);
    if (MiniMessage.plain(b.tooltip).trim()) {
      btn.title = MiniMessage.plain(b.tooltip);
    }
    var badge = actionBadge(b.action);
    if (badge) btn.appendChild(el('span', 'mc-button-badge', badge));
    return btn;
  }

  function actionBadge(action) {
    return {
      none: '',
      open_url: 'link',
      run_command: 'cmd',
      suggest_command: 'chat',
      copy_to_clipboard: 'copy',
      show_dialog: 'dialog',
      custom: 'custom',
      dynamic_run_command: 'cmd+',
      dynamic_custom: 'submit'
    }[action.type] || '';
  }

  function wrapEl(node, id) {
    var w = el('div', 'mc-el');
    w.dataset.id = id;
    w.appendChild(node);
    return w;
  }

  function emptyHint(text) { return el('div', 'mc-empty', text); }

  /* ---- the whole screen ---- */

  function render(dialog, opts) {
    opts = opts || {};
    var info = Model.typeInfo(dialog.type);

    var screen = el('div', 'mc-screen');
    var panel = el('div', 'mc-panel');

    panel.appendChild(mm(el('div', 'mc-title'), dialog.title));

    var scroll = el('div', 'mc-scroll');

    var bodyZone = el('div', 'mc-zone');
    bodyZone.dataset.zone = 'body';
    if (!dialog.body.length) bodyZone.appendChild(emptyHint('Text and items go here'));
    dialog.body.forEach(function (b) { bodyZone.appendChild(renderBodyElement(b)); });
    scroll.appendChild(bodyZone);

    var inputZone = el('div', 'mc-zone');
    inputZone.dataset.zone = 'inputs';
    if (!dialog.inputs.length) {
      inputZone.appendChild(emptyHint('Toggles, sliders, text fields and choices go here'));
    }
    dialog.inputs.forEach(function (i) { inputZone.appendChild(renderInput(i)); });
    scroll.appendChild(inputZone);

    // Only multi-action dialogs have buttons you place yourself; they scroll
    // with the content in a grid, above the footer.
    if (info.buttons === 'list') {
      var actionZone = el('div', 'mc-zone mc-grid');
      actionZone.dataset.zone = 'actions';
      actionZone.style.gridTemplateColumns = 'repeat(' + Math.max(1, dialog.columns) + ', auto)';
      if (!dialog.actions.length) actionZone.appendChild(emptyHint('Buttons go here'));
      dialog.actions.forEach(function (b) {
        actionZone.appendChild(wrapEl(renderButton(b), b._id));
      });
      scroll.appendChild(actionZone);
    }

    if (dialog.type === 'server_links') {
      scroll.appendChild(stubGrid(dialog, ['Website', 'Discord', 'Rules', 'Store'],
        'The game fills these in from your server\'s own link list — they cannot be set here.'));
    }

    if (dialog.type === 'dialog_list') {
      var names = dialog.dialogs
        .filter(function (id) { return id.trim(); })
        .map(function (id) { return id.replace(/^.*[:/]/, '').replace(/_/g, ' '); });
      scroll.appendChild(stubGrid(dialog, names,
        'Each button is named by the external title of the dialog it opens.'));
    }

    panel.appendChild(scroll);

    var footer = el('div', 'mc-footer');
    if (info.buttons === 'single') {
      footer.appendChild(wrapEl(renderButton(dialog.action), dialog.action._id));
    } else if (info.buttons === 'yesno') {
      footer.appendChild(wrapEl(renderButton(dialog.yes), dialog.yes._id));
      footer.appendChild(wrapEl(renderButton(dialog.no), dialog.no._id));
    } else if (dialog.has_exit_action) {
      footer.appendChild(wrapEl(renderButton(dialog.exit_action), dialog.exit_action._id));
    }
    if (footer.children.length) panel.appendChild(footer);

    screen.appendChild(panel);

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
