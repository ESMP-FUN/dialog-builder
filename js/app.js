/*
 * Wiring: the palette, dragging things into the preview, selection, the live
 * code panel, and saving your work in the browser.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'mc-dialog-builder:v1';
  var UI_KEY = 'mc-dialog-builder:ui';

  var state = {
    dialog: Model.blankDialog(),
    selectedId: null,
    tab: 'json'
  };

  // Panel geometry lives apart from the document so clearing your work does
  // not also reset the window you arranged.
  var ui = { codeOpen: false, codeHeight: 320, zoom: 2 };

  var dom = {};

  /* ---- palette ---- */

  var PALETTE = [
    {
      group: 'Things to read',
      zone: 'body',
      items: [
        { kind: 'plain_message', name: 'Text', blurb: 'A paragraph for the player to read.' },
        { kind: 'item', name: 'Item', blurb: 'An item picture, with optional text beside it.' }
      ]
    },
    {
      group: 'Things to fill in',
      zone: 'inputs',
      items: [
        { kind: 'boolean', name: 'Toggle', blurb: 'A tick box for on or off.' },
        { kind: 'number_range', name: 'Slider', blurb: 'A number picked by dragging.' },
        { kind: 'text', name: 'Text field', blurb: 'A box the player types into.' },
        { kind: 'single_option', name: 'Choice', blurb: 'A button that cycles through set answers.' }
      ]
    },
    {
      group: 'Things to click',
      zone: 'actions',
      items: [
        { kind: 'button', name: 'Button', blurb: 'Does something, then usually closes the dialog.' }
      ]
    }
  ];

  var ZONE_FOR = {};
  PALETTE.forEach(function (g) {
    g.items.forEach(function (i) { ZONE_FOR[i.kind] = g.zone; });
  });

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function buildPalette() {
    dom.palette.textContent = '';

    PALETTE.forEach(function (group) {
      var allowed = group.zone !== 'actions' || Model.acceptsButtons(state.dialog);

      var sec = el('section', 'palette-group');
      sec.appendChild(el('h3', 'panel-heading', group.group));

      group.items.forEach(function (item) {
        var card = el('div', 'palette-item' + (allowed ? '' : ' is-disabled'));
        card.draggable = allowed;
        card.dataset.kind = item.kind;
        card.appendChild(el('strong', null, item.name));
        card.appendChild(el('span', 'palette-blurb', item.blurb));

        if (allowed) {
          card.addEventListener('dragstart', function (e) {
            e.dataTransfer.setData('text/plain', 'new:' + item.kind);
            e.dataTransfer.effectAllowed = 'copy';
            beginDrag(ZONE_FOR[item.kind]);
          });
          card.addEventListener('dragend', endDrag);
          // Clicking is quicker than dragging when you just want one on the end.
          card.addEventListener('click', function () { insert(item.kind, null); });
        }
        sec.appendChild(card);
      });

      if (!allowed) {
        sec.appendChild(el('p', 'palette-note',
          'A ' + Model.typeInfo(state.dialog.type).name.toLowerCase() + ' dialog builds its own '
          + 'buttons, so you cannot add your own here. Switch to Multi-action to place buttons '
          + 'yourself.'));
      }

      dom.palette.appendChild(sec);
    });
  }

  /* ---- drag and drop ---- */

  var dragZone = null;

  function beginDrag(zone) {
    dragZone = zone;
    document.body.classList.add('is-dragging');
    Array.prototype.forEach.call(dom.stage.querySelectorAll('[data-zone]'), function (z) {
      z.classList.toggle('is-target', z.dataset.zone === zone);
      z.classList.toggle('is-blocked', z.dataset.zone !== zone);
    });
  }

  function endDrag() {
    dragZone = null;
    document.body.classList.remove('is-dragging');
    Array.prototype.forEach.call(dom.stage.querySelectorAll('[data-zone]'), function (z) {
      z.classList.remove('is-target', 'is-blocked', 'is-over');
    });
    clearCaret();
  }

  function clearCaret() {
    var caret = dom.stage.querySelector('.drop-caret');
    if (caret) caret.remove();
  }

  // Works out where in a zone a drop would land, by comparing the pointer to
  // the midpoint of each element already there.
  function dropIndexFor(zone, x, y) {
    var kids = Array.prototype.filter.call(zone.children, function (c) {
      return c.classList.contains('mc-el');
    });
    var horizontal = zone.classList.contains('mc-grid');

    for (var i = 0; i < kids.length; i++) {
      var r = kids[i].getBoundingClientRect();
      var mid = horizontal ? r.left + r.width / 2 : r.top + r.height / 2;
      if ((horizontal ? x : y) < mid) return i;
    }
    return kids.length;
  }

  function showCaret(zone, index) {
    clearCaret();
    var caret = el('div', 'drop-caret');
    if (zone.classList.contains('mc-grid')) caret.classList.add('is-horizontal');

    var kids = Array.prototype.filter.call(zone.children, function (c) {
      return c.classList.contains('mc-el');
    });
    if (index >= kids.length) zone.appendChild(caret);
    else zone.insertBefore(caret, kids[index]);
  }

  function wireZones() {
    Array.prototype.forEach.call(dom.stage.querySelectorAll('[data-zone]'), function (zone) {
      zone.addEventListener('dragover', function (e) {
        if (zone.dataset.zone !== dragZone) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        zone.classList.add('is-over');
        showCaret(zone, dropIndexFor(zone, e.clientX, e.clientY));
      });

      zone.addEventListener('dragleave', function (e) {
        if (zone.contains(e.relatedTarget)) return;
        zone.classList.remove('is-over');
      });

      zone.addEventListener('drop', function (e) {
        if (zone.dataset.zone !== dragZone) return;
        e.preventDefault();
        var payload = e.dataTransfer.getData('text/plain') || '';
        var index = dropIndexFor(zone, e.clientX, e.clientY);
        endDrag();

        if (payload.indexOf('new:') === 0) {
          insert(payload.slice(4), index);
        } else if (payload.indexOf('move:') === 0) {
          move(payload.slice(5), index);
        }
      });
    });

    // Existing elements can be dragged to reorder.
    Array.prototype.forEach.call(dom.stage.querySelectorAll('.mc-el[data-id]'), function (node) {
      var zone = zoneOf(node.dataset.id);
      if (!zone) return; // footer buttons are fixed by the dialog type

      node.draggable = true;
      node.addEventListener('dragstart', function (e) {
        // A drag that starts inside a live control (a slider, a text box) is
        // that control's business, not a reorder.
        if (e.target !== node && e.target.closest('.mc-textentry, .mc-slider')) {
          e.preventDefault();
          return;
        }
        e.stopPropagation();
        e.dataTransfer.setData('text/plain', 'move:' + node.dataset.id);
        e.dataTransfer.effectAllowed = 'move';
        beginDrag(zone);
      });
      node.addEventListener('dragend', endDrag);
    });
  }

  // Which reorderable list an element belongs to, or null when it is one of
  // the buttons the dialog type owns.
  function zoneOf(id) {
    if (state.dialog.body.some(function (e) { return e._id === id; })) return 'body';
    if (state.dialog.inputs.some(function (e) { return e._id === id; })) return 'inputs';
    if (state.dialog.actions.some(function (e) { return e._id === id; })) return 'actions';
    return null;
  }

  // Shifts an element one slot within its own list.
  function nudge(id, delta) {
    var zone = zoneOf(id);
    if (!zone) return;
    var list = state.dialog[zone];
    var from = list.findIndex(function (e) { return e._id === id; });
    var to = from + delta;
    if (from < 0 || to < 0 || to >= list.length) return;
    list.splice(to, 0, list.splice(from, 1)[0]);
    state.selectedId = id;
    render();
  }

  function listFor(kind) {
    var zone = ZONE_FOR[kind];
    return zone === 'body' ? state.dialog.body
      : zone === 'inputs' ? state.dialog.inputs
      : state.dialog.actions;
  }

  function insert(kind, index) {
    var list = listFor(kind);
    var element = kind === 'button' ? Model.newButton('New button', { width: 120 })
      : ZONE_FOR[kind] === 'body' ? Model.newBody(kind)
      : Model.newInput(kind);

    if (ZONE_FOR[kind] === 'inputs') {
      // Nudge the suggested name so two fresh inputs never clash.
      var n = state.dialog.inputs.length + 1;
      if (state.dialog.inputs.some(function (i) { return i.key === element.key; })) {
        element.key = element.key + '_' + n;
      }
    }

    list.splice(index == null ? list.length : index, 0, element);
    state.selectedId = element._id;
    render();
  }

  function move(id, index) {
    ['body', 'inputs', 'actions'].forEach(function (zone) {
      var list = state.dialog[zone];
      var from = list.findIndex(function (e) { return e._id === id; });
      if (from < 0) return;
      var element = list[from];
      list.splice(from, 1);
      list.splice(from < index ? index - 1 : index, 0, element);
    });
    render();
  }

  /* ---- selection ---- */

  function wireSelection() {
    dom.stage.addEventListener('click', function (e) {
      var node = e.target.closest('.mc-el[data-id]');
      if (!node) {
        state.selectedId = null;
      } else {
        state.selectedId = node.dataset.id;
      }
      render();
    });
  }

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Delete' && e.key !== 'Backspace') return;
    var tag = (document.activeElement && document.activeElement.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (!state.selectedId) return;

    var element = Model.findElement(state.dialog, state.selectedId);
    // Footer buttons belong to the dialog type and cannot be removed on their own.
    if (element && element._kind === 'button' && state.dialog.actions.indexOf(element) < 0) return;

    e.preventDefault();
    Model.removeElement(state.dialog, state.selectedId);
    state.selectedId = null;
    render();
  });

  /* ---- issues ---- */

  function renderIssues() {
    var issues = Model.validate(state.dialog);
    dom.issues.textContent = '';

    var errors = issues.filter(function (i) { return i.level === 'error'; });
    dom.issueCount.textContent = errors.length
      ? errors.length + (errors.length === 1 ? ' problem' : ' problems')
      : issues.length ? issues.length + ' to check' : 'Looks good';
    dom.issueCount.className = 'badge ' + (errors.length ? 'is-error' : issues.length ? 'is-warn' : 'is-ok');

    if (!issues.length) {
      dom.issues.appendChild(el('p', 'issue is-ok',
        'Nothing wrong with this dialog — the game will accept it as it stands.'));
      return;
    }

    issues.forEach(function (issue) {
      var row = el('button', 'issue is-' + issue.level);
      row.appendChild(el('span', 'issue-dot', issue.level === 'error' ? '!' : '?'));
      row.appendChild(el('span', 'issue-text', issue.message));
      if (issue.target) {
        row.addEventListener('click', function () {
          state.selectedId = issue.target;
          render();
        });
      } else {
        row.disabled = true;
      }
      dom.issues.appendChild(row);
    });
  }

  /* ---- code panel ---- */

  function currentCode() {
    if (state.tab === 'java') return Exporter.toJava(state.dialog);
    if (state.tab === 'kotlin') return Exporter.toKotlin(state.dialog);
    return Exporter.toJson(state.dialog);
  }

  function renderCode() {
    Array.prototype.forEach.call(dom.tabs.querySelectorAll('button'), function (b) {
      b.classList.toggle('is-active', b.dataset.tab === state.tab);
    });

    // No point regenerating code nobody can see; it is rebuilt on open.
    if (!ui.codeOpen) return;

    dom.code.textContent = currentCode();

    dom.codeNote.textContent = {
      json: 'Save this as data/<your namespace>/dialog/<name>.json inside a data pack. This is '
        + 'the real format — the other two tabs just build it from a plugin.',
      java: 'Paper API. Call open(player) from a command or a menu button.',
      kotlin: 'Paper API. Call open(player) from a command or a menu button.'
    }[state.tab];
  }

  /* ---- the code panel: collapsed by default, and resizable when open ---- */

  function applyPanel() {
    document.body.classList.toggle('code-open', ui.codeOpen);
    dom.bottom.style.height = ui.codeOpen ? ui.codeHeight + 'px' : '';
    dom.toggle.setAttribute('aria-expanded', ui.codeOpen ? 'true' : 'false');
    dom.toggle.title = ui.codeOpen ? 'Hide the code' : 'Show the code';
    dom.toggleIcon.textContent = ui.codeOpen ? '▾' : '▴';
    dom.toggleText.textContent = ui.codeOpen ? 'Hide code' : 'Show code';
  }

  function setPanelOpen(open) {
    ui.codeOpen = open;
    applyPanel();
    if (open) renderCode();
    saveUi();
  }

  function wireResize() {
    var startY = 0, startH = 0, dragging = false;

    dom.grip.addEventListener('pointerdown', function (e) {
      if (!ui.codeOpen) return;
      dragging = true;
      startY = e.clientY;
      startH = dom.bottom.getBoundingClientRect().height;
      dom.grip.setPointerCapture(e.pointerId);
      document.body.classList.add('is-resizing');
      e.preventDefault();
    });

    dom.grip.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      // Dragging up grows the panel, so the delta is inverted.
      var next = startH + (startY - e.clientY);
      var max = Math.max(200, window.innerHeight - 220);
      ui.codeHeight = Math.round(Math.max(140, Math.min(max, next)));
      dom.bottom.style.height = ui.codeHeight + 'px';
    });

    function stop(e) {
      if (!dragging) return;
      dragging = false;
      try { dom.grip.releasePointerCapture(e.pointerId); } catch (err) { /* already gone */ }
      document.body.classList.remove('is-resizing');
      saveUi();
    }
    dom.grip.addEventListener('pointerup', stop);
    dom.grip.addEventListener('pointercancel', stop);

    // Double-clicking the grip is a quick way back to a sensible height.
    dom.grip.addEventListener('dblclick', function () {
      ui.codeHeight = 320;
      dom.bottom.style.height = ui.codeHeight + 'px';
      saveUi();
    });
  }

  function wireCodePanel() {
    dom.toggle.addEventListener('click', function () { setPanelOpen(!ui.codeOpen); });
    wireResize();

    Array.prototype.forEach.call(dom.tabs.querySelectorAll('button'), function (b) {
      b.addEventListener('click', function () {
        state.tab = b.dataset.tab;
        // Picking a language is a request to see it.
        if (!ui.codeOpen) setPanelOpen(true);
        else renderCode();
        saveUi();
      });
    });

    dom.copy.addEventListener('click', function () {
      navigator.clipboard.writeText(currentCode()).then(function () {
        dom.copy.textContent = 'Copied';
        setTimeout(function () { dom.copy.textContent = 'Copy'; }, 1200);
      });
    });

    dom.download.addEventListener('click', function () {
      var ext = { json: 'json', java: 'java', kotlin: 'kt' }[state.tab];
      var name = state.tab === 'json'
        ? MiniMessage.plain(state.dialog.title).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
        : 'GeneratedDialog';
      var blob = new Blob([currentCode()], { type: 'text/plain' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = (name || 'dialog') + '.' + ext;
      a.click();
      URL.revokeObjectURL(a.href);
    });
  }

  /* ---- saving ---- */

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.dialog));
    } catch (e) { /* private browsing, or storage full — not worth interrupting for */ }
  }

  function saveUi() {
    ui.tab = state.tab;
    try { localStorage.setItem(UI_KEY, JSON.stringify(ui)); } catch (e) { /* as above */ }
  }

  function loadUi() {
    try {
      var raw = localStorage.getItem(UI_KEY);
      if (raw) Object.assign(ui, JSON.parse(raw));
    } catch (e) { /* keep the defaults */ }
    if (ui.tab) state.tab = ui.tab;
  }

  // Ids are reassigned on load so a restored document can never collide with
  // elements added afterwards.
  function reassignIds(dialog) {
    ['body', 'inputs', 'actions'].forEach(function (zone) {
      (dialog[zone] || []).forEach(function (e) { e._id = Model.nextId(); });
    });
    ['action', 'yes', 'no', 'exit_action'].forEach(function (k) {
      if (dialog[k]) dialog[k]._id = Model.nextId();
    });
    (dialog.inputs || []).forEach(function (i) {
      (i.options || []).forEach(function (o) { o._id = Model.nextId(); });
    });
    return dialog;
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      // Fill in anything a newer version of the builder expects.
      var merged = Object.assign(Model.blankDialog(), parsed);
      return reassignIds(merged);
    } catch (e) { return null; }
  }

  /* ---- examples ---- */

  var EXAMPLES = {
    settings: function () {
      var d = Model.blankDialog();
      d.type = 'multi_action';
      d.title = '<dark_aqua>Campfire Regeneration</dark_aqua>';
      d.after_action = 'none';
      d.pause = false;
      d.columns = 3;
      d.body = [Object.assign(Model.newBody('plain_message'), {
        contents: 'Standing near a lit campfire slowly heals you. Set how close a player has '
          + 'to be, and how strong the healing is.',
        width: 400
      })];
      d.inputs = [
        Object.assign(Model.newInput('boolean'), { key: 'enabled', label: 'Feature enabled', initial: true }),
        Object.assign(Model.newInput('boolean'), { key: 'soul', label: 'Include soul campfires', initial: false }),
        Object.assign(Model.newInput('number_range'), {
          key: 'radius', label: 'Radius (blocks)', start: 1, end: 8, step: 1, initial: 4, width: 400
        }),
        Object.assign(Model.newInput('number_range'), {
          key: 'level', label: 'Regeneration level', start: 1, end: 4, step: 1, initial: 1, width: 400
        })
      ];
      d.actions = [
        Model.newButton('<yellow>Back</yellow>', { width: 120, tooltip: 'Return without saving', action: { type: 'dynamic_custom', value: 'myplugin:back' } }),
        Model.newButton('<green>Save</green>', { width: 120, tooltip: 'Save and apply', action: { type: 'dynamic_custom', value: 'myplugin:save' } }),
        Model.newButton('<dark_green>Save & Close</dark_green>', { width: 120, tooltip: 'Save, apply and close', action: { type: 'dynamic_custom', value: 'myplugin:save_close' } })
      ];
      d.exit_action = Model.newButton('<red>Close</red>', { width: 120, tooltip: 'Close without saving', action: { type: 'dynamic_custom', value: 'myplugin:close' } });
      d.has_exit_action = true;
      return d;
    },

    confirm: function () {
      var d = Model.blankDialog();
      d.type = 'confirmation';
      d.title = '<red>Reset your home?</red>';
      d.pause = false;
      d.body = [Object.assign(Model.newBody('plain_message'), {
        contents: 'This clears the home you have set. You cannot undo it.',
        width: 300
      })];
      d.inputs = [];
      d.yes = Model.newButton('<green>Yes, reset it</green>', {
        tooltip: 'Clears your saved home', action: { type: 'run_command', value: 'home clear' }
      });
      d.no = Model.newButton('<gray>Keep it</gray>', { tooltip: 'Nothing changes' });
      return d;
    },

    notice: function () {
      var d = Model.blankDialog();
      d.type = 'notice';
      d.title = '<gold><bold>Welcome!</bold></gold>';
      d.pause = false;
      d.body = [
        Object.assign(Model.newBody('plain_message'), {
          contents: '<gradient:#FFD479:#FF7B54>Thanks for joining the server.</gradient>'
            + '<newline><newline>Here is a little something to get you started.',
          width: 300
        }),
        Object.assign(Model.newBody('item'), {
          item_id: 'minecraft:golden_apple', count: 3,
          description: 'Three golden apples, already in your inventory.'
        })
      ];
      d.inputs = [];
      d.action = Model.newButton('<green>Let\'s go</green>', { tooltip: 'Start playing' });
      return d;
    },

    survey: function () {
      var d = Model.blankDialog();
      d.type = 'multi_action';
      d.title = 'Tell us about yourself';
      d.pause = false;
      d.columns = 1;
      d.body = [Object.assign(Model.newBody('plain_message'), {
        contents: 'Every kind of input the game offers, on one screen.',
        width: 320
      })];
      d.inputs = [
        Object.assign(Model.newInput('text'), { key: 'nickname', label: 'What should we call you?', max_length: 24 }),
        Object.assign(Model.newInput('text'), {
          key: 'about', label: 'Anything else?', multiline: true, max_lines: 4, height: 60, max_length: 200
        }),
        Object.assign(Model.newInput('single_option'), {
          key: 'playstyle', label: 'How do you play',
          options: [
            { _id: Model.nextId(), id: 'builder', display: 'Builder', initial: true },
            { _id: Model.nextId(), id: 'redstone', display: 'Redstone engineer', initial: false },
            { _id: Model.nextId(), id: 'explorer', display: 'Explorer', initial: false },
            { _id: Model.nextId(), id: 'fighter', display: 'Fighter', initial: false }
          ]
        }),
        Object.assign(Model.newInput('number_range'), {
          key: 'hours', label: 'Hours a week', start: 0, end: 40, step: 1, initial: 10
        }),
        Object.assign(Model.newInput('boolean'), {
          key: 'newsletter', label: 'Send me server news', initial: true
        })
      ];
      d.actions = [Model.newButton('<green>Send</green>', {
        width: 150, tooltip: 'Send your answers', action: { type: 'dynamic_custom', value: 'myplugin:survey' }
      })];
      d.has_exit_action = true;
      d.exit_action = Model.newButton('<gray>No thanks</gray>', { width: 150 });
      return d;
    }
  };

  function wireToolbar() {
    dom.examples.addEventListener('change', function () {
      var key = dom.examples.value;
      if (!key) return;
      state.dialog = EXAMPLES[key]();
      state.selectedId = null;
      dom.examples.value = '';
      render();
    });

    dom.reset.addEventListener('click', function () {
      state.dialog = Model.blankDialog();
      state.selectedId = null;
      render();
    });

    dom.zoom.addEventListener('input', function () {
      ui.zoom = Number(dom.zoom.value);
      Preview.setZoom(ui.zoom);
      drawStage();
      saveUi();
    });

    dom.tips.addEventListener('click', function () { Tips.open(); });
  }

  /* ---- stage footer ---- */

  // The one thing people ask first, tucked into a button so it cannot get in
  // the way of a tall dialog.
  function wireStageFoot() {
    var info = McIcons.button('info');
    Tooltip.attach(info, {
      title: 'Why can\'t I put two things side by side?',
      body: 'Because the game will not. A dialog is one centred column: everything to read, '
        + 'then everything to fill in, then the buttons.\n\n'
        + 'The only layout choices you have are the order things come in, and how many '
        + 'buttons fit on a row.'
    });
    dom.stageFoot.appendChild(info);
  }

  /* ---- fonts ---- */

  // Which text field a font tag should wrap, for whatever is selected.
  function textTargetOf(element) {
    if (!element) return null;
    if (element._kind === 'body') {
      return element.type === 'plain_message' ? 'contents' : 'description';
    }
    if (element._kind === 'input') return 'label';
    if (element._kind === 'button') return 'label';
    return null;
  }

  function applyFont(key) {
    var element = state.selectedId ? Model.findElement(state.dialog, state.selectedId) : null;
    var prop = textTargetOf(element);

    if (!prop) {
      // Nothing selected, so the title is the sensible default.
      element = state.dialog;
      prop = 'title';
    }

    var current = String(element[prop] || '');
    // Replace an outer font tag rather than nesting a second one inside it.
    var existing = current.match(/^<font:[^>]+>([\s\S]*)<\/font>$/);
    var inner = existing ? existing[1] : current;

    element[prop] = '<font:' + key + '>' + inner + '</font>';
    render();
  }

  /* ---- render ---- */

  // Redraws the preview and reports whether the selected element survived.
  // Switching dialog type keeps the old buttons in the document but stops
  // drawing them, so "still exists" has to mean "still on screen".
  function drawStage() {
    dom.stage.textContent = '';
    dom.stage.appendChild(Preview.render(state.dialog, {
      selectedId: state.selectedId,
      hooks: {
        // A live control was used. `keepFocus` means the control is still
        // being held or typed into, so only the cheap parts are refreshed;
        // rebuilding the preview mid-gesture would pull the control out from
        // under the pointer.
        edited: function (id, keepFocus) {
          if (keepFocus) { renderIssues(); renderCode(); save(); return; }
          state.selectedId = id;
          render();
        },
        select: selectOnly,
        move: nudge,
        remove: function (id) {
          Model.removeElement(state.dialog, id);
          if (state.selectedId === id) state.selectedId = null;
          render();
        }
      }
    }));
    wireZones();
    return !state.selectedId || !!dom.stage.querySelector('[data-id="' + state.selectedId + '"]');
  }

  function renderInspector() {
    Inspector.render(dom.inspector, state.dialog, state.selectedId, function (soft, selection) {
      if (arguments.length > 1) state.selectedId = selection;
      if (soft) {
        // Typing shouldn't rebuild the whole panel and steal focus mid-word.
        drawStage();
        renderIssues();
        renderCode();
        save();
        return;
      }
      render();
    });
  }

  /*
   * Moves the selection without rebuilding the preview.
   *
   * Clicking straight into a live control — putting a caret in a text box,
   * grabbing a slider — has to show that element's options, but redrawing the
   * preview at that moment would replace the very node holding the pointer or
   * the caret. So the highlight is moved in place and only the options panel
   * is rebuilt.
   */
  function selectOnly(id) {
    if (state.selectedId === id) return;
    state.selectedId = id;

    Array.prototype.forEach.call(dom.stage.querySelectorAll('.mc-el.is-selected'), function (node) {
      node.classList.remove('is-selected');
    });
    var node = id && dom.stage.querySelector('[data-id="' + id + '"]');
    if (node) node.classList.add('is-selected');

    renderInspector();
  }

  function render() {
    if (!drawStage()) {
      state.selectedId = null;
      drawStage();
    }

    buildPalette();
    renderIssues();
    renderCode();
    renderInspector();

    save();
  }

  /* ---- start ---- */

  document.addEventListener('DOMContentLoaded', function () {
    dom.stage = document.getElementById('stage');
    dom.inspector = document.getElementById('inspector');
    dom.palette = document.getElementById('palette');
    dom.issues = document.getElementById('issues');
    dom.issueCount = document.getElementById('issue-count');
    dom.code = document.getElementById('code');
    dom.codeNote = document.getElementById('code-note');
    dom.tabs = document.getElementById('code-tabs');
    dom.copy = document.getElementById('copy');
    dom.download = document.getElementById('download');
    dom.examples = document.getElementById('examples');
    dom.reset = document.getElementById('reset');
    dom.zoom = document.getElementById('zoom');
    dom.tips = document.getElementById('tips');
    dom.fonts = document.getElementById('fonts');
    dom.stageFoot = document.getElementById('stage-foot');
    dom.bottom = document.getElementById('bottom');
    dom.grip = document.getElementById('grip');
    dom.toggle = document.getElementById('code-toggle');
    dom.toggleIcon = document.getElementById('code-toggle-icon');
    dom.toggleText = document.getElementById('code-toggle-text');

    loadUi();
    dom.zoom.value = ui.zoom;
    Preview.setZoom(ui.zoom);

    var saved = load();
    if (saved) state.dialog = saved;

    wireSelection();
    wireCodePanel();
    wireToolbar();
    wireStageFoot();
    applyPanel();
    FontPanel.init(dom.fonts, applyFont);
    render();
    Tips.openIfFirstVisit();
  });
})();
