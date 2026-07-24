/*
 * The options panel. Builds a form for whatever is selected — or for the
 * dialog as a whole when nothing is — and writes straight back into the
 * document, then asks the app to redraw.
 *
 * Help text here is aimed at someone who has never read the format, because
 * that is the whole point of the tool.
 */
(function (global) {
  'use strict';

  var onChange = function () {};

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function field(label, control, hint) {
    var wrap = el('div', 'field');
    var lab = el('label', 'field-label', label);
    wrap.appendChild(lab);
    wrap.appendChild(control);
    if (hint) wrap.appendChild(el('p', 'field-hint', hint));
    if (control.id) lab.setAttribute('for', control.id);
    return wrap;
  }

  var idSeq = 0;
  function uniqueId() { return 'f' + (++idSeq); }

  function textbox(value, apply, opts) {
    opts = opts || {};
    var input = document.createElement(opts.multiline ? 'textarea' : 'input');
    input.id = uniqueId();
    input.className = 'control';
    if (!opts.multiline) input.type = 'text';
    if (opts.multiline) input.rows = opts.rows || 3;
    if (opts.placeholder) input.placeholder = opts.placeholder;
    input.value = value == null ? '' : value;
    input.addEventListener('input', function () { apply(input.value); onChange(true); });
    return input;
  }

  function number(value, apply, opts) {
    opts = opts || {};
    var input = document.createElement('input');
    input.id = uniqueId();
    input.className = 'control';
    input.type = 'number';
    if (opts.min !== undefined) input.min = opts.min;
    if (opts.max !== undefined) input.max = opts.max;
    if (opts.step !== undefined) input.step = opts.step;
    input.value = value;
    input.addEventListener('input', function () {
      if (input.value === '') return;
      apply(Number(input.value));
      onChange(true);
    });
    return input;
  }

  function checkbox(label, value, apply) {
    var wrap = el('label', 'toggle');
    var input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = !!value;
    input.addEventListener('change', function () { apply(input.checked); onChange(); });
    wrap.appendChild(input);
    wrap.appendChild(el('span', null, label));
    return wrap;
  }

  function select(value, options, apply) {
    var sel = document.createElement('select');
    sel.id = uniqueId();
    sel.className = 'control';
    options.forEach(function (o) {
      var opt = document.createElement('option');
      opt.value = o.value;
      opt.textContent = o.label;
      if (o.value === value) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.addEventListener('change', function () { apply(sel.value); onChange(); });
    return sel;
  }

  function section(title) {
    var s = el('section', 'panel-section');
    s.appendChild(el('h3', 'panel-heading', title));
    return s;
  }

  /* ---- dialog-level options ---- */

  function renderDialogOptions(dialog) {
    var frag = document.createDocumentFragment();
    var info = Model.typeInfo(dialog.type);

    var s = section('This dialog');
    s.appendChild(field('Kind of dialog',
      select(dialog.type, Model.DIALOG_TYPES.map(function (t) {
        return { value: t.id, label: t.name };
      }), function (v) { dialog.type = v; }),
      info.blurb));

    s.appendChild(field('Title',
      textbox(dialog.title, function (v) { dialog.title = v; }),
      'Shown at the top of every dialog. Colour codes work here — try <gold>Gold text</gold>.'));

    s.appendChild(field('Name on a button that opens this dialog',
      textbox(dialog.external_title, function (v) { dialog.external_title = v; },
        { placeholder: 'Leave blank to reuse the title' }),
      'Only used when another dialog, or the pause menu, shows a button leading here.'));
    frag.appendChild(s);

    var b = section('Behaviour');
    b.appendChild(checkbox('Escape closes this dialog', dialog.can_close_with_escape,
      function (v) { dialog.can_close_with_escape = v; }));
    b.appendChild(checkbox('Pause the game (single-player only)', dialog.pause,
      function (v) { dialog.pause = v; }));
    b.appendChild(field('After a button is clicked',
      select(dialog.after_action, [
        { value: 'close', label: 'Close the dialog' },
        { value: 'none', label: 'Stay open' },
        { value: 'wait_for_response', label: 'Show "Waiting for Response"' }
      ], function (v) { dialog.after_action = v; }),
      '"Stay open" lets a player click several buttons in a row — handy for a settings '
      + 'screen. It cannot be combined with pausing the game.'));
    frag.appendChild(b);

    if (info.buttons === 'list' || info.buttons === 'exit') {
      var l = section('Button layout');
      l.appendChild(field('Buttons per row',
        number(dialog.columns, function (v) { dialog.columns = v; }, { min: 1, max: 8 }),
        'Buttons fill left to right, wrapping onto a new row after this many.'));

      if (info.buttons === 'exit') {
        l.appendChild(field('Width of each button',
          number(dialog.button_width, function (v) { dialog.button_width = v; }, { min: 1, max: 1024 }),
          'Measured the same way as everything else: 150 is the normal button width.'));
      }

      l.appendChild(checkbox('Show an exit button underneath', dialog.has_exit_action,
        function (v) { dialog.has_exit_action = v; }));
      frag.appendChild(l);
    }

    if (dialog.type === 'dialog_list') {
      var d = section('Dialogs to list');
      dialog.dialogs.forEach(function (id, i) {
        var row = el('div', 'row');
        row.appendChild(textbox(id, function (v) { dialog.dialogs[i] = v; },
          { placeholder: 'namespace:dialog_name' }));
        var del = el('button', 'btn-icon', '✕');
        del.title = 'Remove';
        del.addEventListener('click', function () {
          dialog.dialogs.splice(i, 1); onChange();
        });
        row.appendChild(del);
        d.appendChild(row);
      });
      var add = el('button', 'btn-add', '+ Add a dialog');
      add.addEventListener('click', function () { dialog.dialogs.push(''); onChange(); });
      d.appendChild(add);
      frag.appendChild(d);
    }

    return frag;
  }

  /* ---- per-element options ---- */

  function renderBody(b) {
    var frag = document.createDocumentFragment();

    if (b.type === 'plain_message') {
      var s = section('Text');
      s.appendChild(field('What it says',
        textbox(b.contents, function (v) { b.contents = v; }, { multiline: true, rows: 5 }),
        'Colours and links work here. <newline> starts a new line.'));
      s.appendChild(field('How wide before it wraps',
        number(b.width, function (v) { b.width = v; }, { min: 1, max: 1024 }),
        'Default is 200. The screen puts a gap above and below every text block, so one '
        + 'wide paragraph reads better than several short lines.'));
      frag.appendChild(s);
    } else {
      var i = section('Item');
      i.appendChild(field('Which item',
        textbox(b.item_id, function (v) { b.item_id = v; }, { placeholder: 'minecraft:diamond' }),
        'The item\'s id, for example minecraft:diamond or minecraft:netherite_pickaxe.'));
      i.appendChild(field('How many', number(b.count, function (v) { b.count = v; }, { min: 1, max: 99 })));
      i.appendChild(field('Text beside it',
        textbox(b.description, function (v) { b.description = v; }, { multiline: true, rows: 3 }),
        'Optional. When filled in, it appears to the right of the item.'));
      i.appendChild(field('How wide that text may be',
        number(b.description_width, function (v) { b.description_width = v; }, { min: 1, max: 1024 })));
      i.appendChild(checkbox('Show the stack count and damage bar', b.show_decoration,
        function (v) { b.show_decoration = v; }));
      i.appendChild(checkbox('Show the item tooltip on hover', b.show_tooltip,
        function (v) { b.show_tooltip = v; }));
      i.appendChild(field('Slot width', number(b.width, function (v) { b.width = v; }, { min: 1, max: 256 }),
        'The picture itself is always drawn at its normal size — this only changes the '
        + 'space reserved around it.'));
      i.appendChild(field('Slot height', number(b.height, function (v) { b.height = v; }, { min: 1, max: 256 })));
      frag.appendChild(i);
    }

    return frag;
  }

  function renderInput(input) {
    var frag = document.createDocumentFragment();

    var s = section('Answer name');
    s.appendChild(field('Name',
      textbox(input.key, function (v) { input.key = v; }, { placeholder: 'my_setting' }),
      'How your code reads this answer back. Letters, numbers and underscores only — '
      + 'a dot or a dash makes the whole dialog fail to build.'));
    s.appendChild(field('Label the player sees',
      textbox(input.label, function (v) { input.label = v; })));
    frag.appendChild(s);

    var o = section('Options');

    if (input.type === 'text') {
      o.appendChild(field('Filled in to start with',
        textbox(input.initial, function (v) { input.initial = v; })));
      o.appendChild(field('Longest allowed answer',
        number(input.max_length, function (v) { input.max_length = v; }, { min: 1 }),
        'Counted in characters. Default is 32, which is shorter than most people expect.'));
      o.appendChild(field('Box width',
        number(input.width, function (v) { input.width = v; }, { min: 1, max: 1024 })));
      o.appendChild(checkbox('Show the label', input.label_visible,
        function (v) { input.label_visible = v; }));
      o.appendChild(checkbox('Allow more than one line', input.multiline,
        function (v) { input.multiline = v; }));
      if (input.multiline) {
        o.appendChild(field('Most lines allowed',
          number(input.max_lines, function (v) { input.max_lines = v; }, { min: 1 })));
        o.appendChild(field('Box height',
          number(input.height, function (v) { input.height = v; }, { min: 1, max: 512 })));
      }

    } else if (input.type === 'boolean') {
      o.appendChild(checkbox('Ticked to start with', input.initial,
        function (v) { input.initial = v; }));
      o.appendChild(field('Value sent when ticked',
        textbox(input.on_true, function (v) { input.on_true = v; }),
        'Only matters for buttons that run a command with the answers filled in. '
        + 'Plugins reading the answer directly get a plain yes/no.'));
      o.appendChild(field('Value sent when unticked',
        textbox(input.on_false, function (v) { input.on_false = v; })));

    } else if (input.type === 'single_option') {
      o.appendChild(field('Button width',
        number(input.width, function (v) { input.width = v; }, { min: 1, max: 1024 })));
      o.appendChild(checkbox('Show the label', input.label_visible,
        function (v) { input.label_visible = v; }));
      frag.appendChild(o);

      var c = section('Choices');
      input.options.forEach(function (opt, i) {
        var card = el('div', 'subcard');
        card.appendChild(field('Shown to the player',
          textbox(opt.display, function (v) { opt.display = v; })));
        card.appendChild(field('Value sent',
          textbox(opt.id, function (v) { opt.id = v; })));
        card.appendChild(checkbox('Selected to start with', opt.initial, function (v) {
          // Only one choice can be the starting one, so setting this clears
          // the others rather than letting an invalid dialog get built.
          if (v) input.options.forEach(function (other) { other.initial = false; });
          opt.initial = v;
        }));
        var del = el('button', 'btn-text', 'Remove this choice');
        del.addEventListener('click', function () { input.options.splice(i, 1); onChange(); });
        card.appendChild(del);
        c.appendChild(card);
      });
      var add = el('button', 'btn-add', '+ Add a choice');
      add.addEventListener('click', function () {
        input.options.push({
          _id: Model.nextId(),
          id: 'choice_' + (input.options.length + 1),
          display: 'Choice ' + (input.options.length + 1),
          initial: false
        });
        onChange();
      });
      c.appendChild(add);
      frag.appendChild(c);
      return frag;

    } else if (input.type === 'number_range') {
      o.appendChild(field('Lowest value',
        number(input.start, function (v) { input.start = v; }, { step: 'any' })));
      o.appendChild(field('Highest value',
        number(input.end, function (v) { input.end = v; }, { step: 'any' })));
      o.appendChild(field('Step between values',
        number(input.step, function (v) { input.step = v; }, { step: 'any', min: 0 }),
        'How far the slider jumps. Stick to whole numbers, 0.5 or 0.25 — other steps '
        + 'show up on screen as long numbers like 0.30000001.'));
      o.appendChild(field('Value it starts on',
        number(input.initial, function (v) { input.initial = v; }, { step: 'any' })));
      o.appendChild(field('Slider width',
        number(input.width, function (v) { input.width = v; }, { min: 1, max: 1024 })));
      o.appendChild(field('How the slider is labelled',
        select(input.label_format, [
          { value: 'options.generic_value', label: 'Label: value' },
          { value: 'options.percent_value', label: 'Value as a percentage' },
          { value: '%s', label: 'Label only' }
        ], function (v) { input.label_format = v; }),
        'The game builds the slider text from this. "Label: value" is the normal one.'));
    }

    frag.appendChild(o);
    return frag;
  }

  var ACTION_TYPES = [
    { value: 'none', label: 'Nothing (just closes)' },
    { value: 'dynamic_custom', label: 'Send the answers to my plugin' },
    { value: 'custom', label: 'Send a fixed signal to my plugin' },
    { value: 'run_command', label: 'Run a command' },
    { value: 'dynamic_run_command', label: 'Run a command with the answers filled in' },
    { value: 'suggest_command', label: 'Type something into chat for the player' },
    { value: 'open_url', label: 'Open a web page' },
    { value: 'copy_to_clipboard', label: 'Copy text to the clipboard' },
    { value: 'show_dialog', label: 'Open another dialog' }
  ];

  var ACTION_HELP = {
    none: 'The button does nothing on its own. With "Close the dialog" set above, that '
      + 'still makes it a working Close button.',
    dynamic_custom: 'The usual choice for a settings screen. Your plugin gets every answer '
      + 'the player filled in.',
    custom: 'Your plugin is told which button was pressed, but gets no answers with it.',
    run_command: 'Runs as if the player typed it. They need permission for it themselves.',
    dynamic_run_command: 'Write the command with $(name) where an answer should go — for '
      + 'example: say hello $(my_text)',
    suggest_command: 'Opens chat with this text already typed, ready for the player to send.',
    open_url: 'The player is asked to confirm before their browser opens.',
    copy_to_clipboard: 'Puts the text on the player\'s clipboard.',
    show_dialog: 'Give the id of a dialog registered on the server, like myplugin:settings.'
  };

  var ACTION_PLACEHOLDER = {
    run_command: 'give @s diamond 1',
    dynamic_run_command: 'say hello $(my_text)',
    suggest_command: '/msg Notch ',
    open_url: 'https://example.com',
    copy_to_clipboard: 'Text to copy',
    show_dialog: 'myplugin:settings',
    custom: 'myplugin:button_pressed',
    dynamic_custom: 'myplugin:save'
  };

  function renderButton(b, dialog) {
    var frag = document.createDocumentFragment();

    var s = section('Button');
    s.appendChild(field('Label', textbox(b.label, function (v) { b.label = v; })));
    s.appendChild(field('Tooltip',
      textbox(b.tooltip, function (v) { b.tooltip = v; },
        { placeholder: 'Shown when hovering. Optional.' })));
    s.appendChild(field('Width',
      number(b.width, function (v) { b.width = v; }, { min: 1, max: 1024 }),
      '150 is the normal width. Narrower buttons let more fit on one row.'));
    frag.appendChild(s);

    var a = section('What it does');
    a.appendChild(field('When clicked',
      select(b.action.type, ACTION_TYPES, function (v) {
        b.action = { type: v, value: '', payload: '' };
      }),
      ACTION_HELP[b.action.type]));

    if (b.action.type !== 'none') {
      var labelFor = {
        run_command: 'Command', dynamic_run_command: 'Command template',
        suggest_command: 'Text to put in chat', open_url: 'Web address',
        copy_to_clipboard: 'Text to copy', show_dialog: 'Dialog id',
        custom: 'Signal id', dynamic_custom: 'Signal id'
      }[b.action.type] || 'Value';

      a.appendChild(field(labelFor,
        textbox(b.action.value, function (v) { b.action.value = v; },
          { placeholder: ACTION_PLACEHOLDER[b.action.type] || '' })));
    }
    frag.appendChild(a);

    if (dialog.after_action === 'none') {
      var note = el('div', 'callout');
      note.appendChild(el('p', null,
        'This dialog is set to stay open, so no button closes it by itself. A button meant '
        + 'to close has to do that from your own code.'));
      frag.appendChild(note);
    }

    return frag;
  }

  /* ---- entry point ---- */

  function render(container, dialog, selectedId, changeHandler) {
    onChange = changeHandler;
    container.textContent = '';

    var selected = selectedId ? Model.findElement(dialog, selectedId) : null;

    var head = el('div', 'panel-head');
    if (selected) {
      var kind = selected._kind === 'button' ? 'Button'
        : selected._kind === 'input' ? { text: 'Text field', boolean: 'Toggle',
            single_option: 'Choice', number_range: 'Slider' }[selected.type]
        : selected.type === 'item' ? 'Item' : 'Text';
      head.appendChild(el('h2', 'panel-title', kind));
      var back = el('button', 'btn-text', '← Dialog settings');
      back.addEventListener('click', function () { changeHandler(false, null); });
      head.appendChild(back);
    } else {
      head.appendChild(el('h2', 'panel-title', 'Dialog settings'));
      head.appendChild(el('p', 'panel-sub', 'Click anything in the preview to edit it.'));
    }
    container.appendChild(head);

    if (!selected) {
      container.appendChild(renderDialogOptions(dialog));
    } else if (selected._kind === 'body') {
      container.appendChild(renderBody(selected));
    } else if (selected._kind === 'input') {
      container.appendChild(renderInput(selected));
    } else {
      container.appendChild(renderButton(selected, dialog));
    }
  }

  global.Inspector = { render: render };
})(window);
