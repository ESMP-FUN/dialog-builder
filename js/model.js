/*
 * The dialog document, plus every rule the game enforces on it.
 *
 * Field names mirror the vanilla JSON format (snake_case) so that reading this
 * file teaches the format directly. The Paper exporter translates to camelCase
 * builder calls on the way out.
 */
(function (global) {
  'use strict';

  var uid = 0;
  function nextId() { return 'e' + (++uid); }

  var DIALOG_TYPES = [
    {
      id: 'notice',
      name: 'Notice',
      blurb: 'One message, one button. The button is also what Escape does.',
      buttons: 'single'
    },
    {
      id: 'confirmation',
      name: 'Confirmation',
      blurb: 'A yes and a no button side by side. Escape picks no.',
      buttons: 'yesno'
    },
    {
      id: 'multi_action',
      name: 'Multi-action',
      blurb: 'Any number of buttons in a grid, plus an optional exit button underneath.',
      buttons: 'list'
    },
    {
      id: 'server_links',
      name: 'Server links',
      blurb: 'The game fills this in from the links your server advertises. You only set the exit button.',
      buttons: 'exit'
    },
    {
      id: 'dialog_list',
      name: 'Dialog list',
      blurb: 'Buttons that open other dialogs. Each button is named by that dialog\'s external title.',
      buttons: 'exit'
    }
  ];

  function typeInfo(id) {
    for (var i = 0; i < DIALOG_TYPES.length; i++) {
      if (DIALOG_TYPES[i].id === id) return DIALOG_TYPES[i];
    }
    return DIALOG_TYPES[0];
  }

  function newButton(label, opts) {
    opts = opts || {};
    return {
      _id: nextId(),
      _kind: 'button',
      label: label || 'Button',
      tooltip: opts.tooltip || '',
      width: opts.width || 150,
      action: opts.action || { type: 'none' }
    };
  }

  function newBody(type) {
    if (type === 'item') {
      return {
        _id: nextId(), _kind: 'body', type: 'item',
        item_id: 'minecraft:diamond', count: 1,
        description: '', description_width: 200,
        show_decoration: true, show_tooltip: true,
        width: 16, height: 16
      };
    }
    return {
      _id: nextId(), _kind: 'body', type: 'plain_message',
      contents: 'Some text for the player to read.',
      width: 200
    };
  }

  function newInput(type) {
    var base = { _id: nextId(), _kind: 'input', type: type, key: '', label: '' };
    if (type === 'text') {
      base.key = 'my_text';
      base.label = 'Your name';
      base.initial = '';
      base.max_length = 32;
      base.width = 200;
      base.label_visible = true;
      base.multiline = false;
      base.max_lines = 4;
      base.height = 64;
    } else if (type === 'boolean') {
      base.key = 'my_toggle';
      base.label = 'Enable the thing';
      base.initial = false;
      base.on_true = 'true';
      base.on_false = 'false';
    } else if (type === 'single_option') {
      base.key = 'my_choice';
      base.label = 'Pick one';
      base.width = 200;
      base.label_visible = true;
      base.options = [
        { _id: nextId(), id: 'first', display: 'First choice', initial: true },
        { _id: nextId(), id: 'second', display: 'Second choice', initial: false }
      ];
    } else if (type === 'number_range') {
      base.key = 'my_number';
      base.label = 'How many';
      base.start = 0;
      base.end = 10;
      base.step = 1;
      base.initial = 5;
      base.width = 200;
      base.label_format = 'options.generic_value';
    }
    return base;
  }

  function blankDialog() {
    return {
      type: 'multi_action',
      title: '<gold>My First Dialog</gold>',
      external_title: '',
      can_close_with_escape: true,
      pause: false,
      after_action: 'close',
      body: [newBody('plain_message')],
      inputs: [],
      // notice
      action: newButton('Got it', { tooltip: 'Close this dialog' }),
      // confirmation
      yes: newButton('<green>Yes</green>', { tooltip: 'Go ahead' }),
      no: newButton('<red>No</red>', { tooltip: 'Never mind' }),
      // multi_action
      actions: [newButton('<green>Save</green>', { tooltip: 'Save your changes', width: 120 })],
      // shared by multi_action / server_links / dialog_list
      exit_action: newButton('<red>Close</red>', { tooltip: 'Close without saving', width: 120 }),
      has_exit_action: true,
      columns: 2,
      button_width: 150,
      // dialog_list
      dialogs: ['minecraft:custom_options']
    };
  }

  /* ---- what the current type can hold ---- */

  // server_links and dialog_list build their own button rows, so a hand-placed
  // button has nowhere to go on those screens.
  function acceptsButtons(dialog) {
    return typeInfo(dialog.type).buttons === 'list';
  }

  function buttonsOf(dialog) {
    switch (typeInfo(dialog.type).buttons) {
      case 'single': return [dialog.action];
      case 'yesno': return [dialog.yes, dialog.no];
      case 'list': return dialog.actions;
      default: return [];
    }
  }

  function findElement(dialog, id) {
    var pools = [dialog.body, dialog.inputs, dialog.actions,
      [dialog.action, dialog.yes, dialog.no, dialog.exit_action]];
    for (var p = 0; p < pools.length; p++) {
      for (var i = 0; i < pools[p].length; i++) {
        if (pools[p][i] && pools[p][i]._id === id) return pools[p][i];
      }
    }
    return null;
  }

  function removeElement(dialog, id) {
    ['body', 'inputs', 'actions'].forEach(function (zone) {
      var idx = dialog[zone].findIndex(function (e) { return e._id === id; });
      if (idx >= 0) dialog[zone].splice(idx, 1);
    });
  }

  /* ---- validation ---- */

  var KEY_PATTERN = /^[A-Za-z0-9_]+$/;

  // Steps the client can render without float noise. The value shown on a
  // slider is computed as start + n*step in floating point, so a step of 0.1
  // surfaces as "0.30000001" on the actual screen.
  function stepIsClean(step) {
    if (!(step > 0)) return false;
    var scaled = step * 4;
    return Math.abs(scaled - Math.round(scaled)) < 1e-9;
  }

  function validate(dialog) {
    var issues = [];

    function err(msg, id) { issues.push({ level: 'error', message: msg, target: id || null }); }
    function warn(msg, id) { issues.push({ level: 'warning', message: msg, target: id || null }); }

    if (!MiniMessage.plain(dialog.title).trim()) {
      err('The dialog needs a title — it is the one thing shown on every dialog type.');
    }

    if (dialog.pause && dialog.after_action === 'none') {
      err('"Pause the game" and "stay open" cannot both be set. In single-player that would '
        + 'freeze the game with no way to unpause, so the server refuses to build the dialog.');
    }

    if (dialog.after_action === 'none' && typeInfo(dialog.type).buttons !== 'list') {
      warn('With "stay open", clicking a button no longer closes the dialog by itself. '
        + 'Escape still works, but any button meant to close needs to say so in your own code.');
    }

    var width = Number(dialog.button_width);
    if (typeInfo(dialog.type).buttons === 'exit' && (width < 1 || width > 1024)) {
      err('Button width has to be between 1 and 1024.');
    }

    if (dialog.columns < 1) err('Column count has to be at least 1.');

    if (dialog.type === 'multi_action' && dialog.actions.length === 0) {
      err('A multi-action dialog needs at least one button.');
    }

    if (dialog.type === 'dialog_list' && dialog.dialogs.filter(function (d) { return d.trim(); }).length === 0) {
      err('A dialog list needs at least one dialog to point at.');
    }

    // Body
    dialog.body.forEach(function (b, i) {
      if (b.type === 'plain_message') {
        if (b.width < 1 || b.width > 1024) err('Text block ' + (i + 1) + ': width must be between 1 and 1024.', b._id);
      } else if (b.type === 'item') {
        if (!/^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(b.item_id)) {
          err('Item block ' + (i + 1) + ': the item id should look like "minecraft:diamond".', b._id);
        }
        if (b.width < 1 || b.width > 256 || b.height < 1 || b.height > 256) {
          err('Item block ' + (i + 1) + ': size must be between 1 and 256.', b._id);
        }
      }
    });

    // Inputs
    var seenKeys = {};
    dialog.inputs.forEach(function (input, i) {
      var where = 'Input ' + (i + 1) + ' (' + input.type.replace('_', ' ') + ')';

      if (!input.key) {
        err(where + ': needs a name. This is how your code reads the value back.', input._id);
      } else if (!KEY_PATTERN.test(input.key)) {
        err(where + ': the name "' + input.key + '" can only contain letters, numbers and '
          + 'underscores. Dots and dashes make the whole dialog fail to build.', input._id);
      } else if (seenKeys[input.key]) {
        err(where + ': the name "' + input.key + '" is already used by another input. '
          + 'Names have to be unique.', input._id);
      }
      if (input.key) seenKeys[input.key] = true;

      if (input.width !== undefined && (input.width < 1 || input.width > 1024)) {
        err(where + ': width must be between 1 and 1024.', input._id);
      }

      if (input.type === 'single_option') {
        if (!input.options.length) {
          err(where + ': needs at least one option.', input._id);
        }
        var initials = input.options.filter(function (o) { return o.initial; });
        if (initials.length > 1) {
          err(where + ': only one option can be the starting choice.', input._id);
        }
        var ids = {};
        input.options.forEach(function (o) {
          if (!o.id) err(where + ': every option needs a value.', input._id);
          else if (ids[o.id]) err(where + ': two options share the value "' + o.id + '".', input._id);
          ids[o.id] = true;
        });
      }

      if (input.type === 'number_range') {
        if (!(input.end > input.start)) {
          err(where + ': the highest value has to be above the lowest.', input._id);
        }
        if (input.step !== '' && input.step !== null && !(input.step > 0)) {
          err(where + ': the step has to be above zero.', input._id);
        } else if (input.step && !stepIsClean(input.step)) {
          warn(where + ': a step of ' + input.step + ' will show up on the slider as a long '
            + 'number like 0.30000001. Whole numbers, 0.5 and 0.25 are the safe choices.', input._id);
        }
        if (input.initial < input.start || input.initial > input.end) {
          warn(where + ': the starting value sits outside the slider range.', input._id);
        }
      }

      if (input.type === 'text' && input.max_length < 1) {
        err(where + ': maximum length must be at least 1.', input._id);
      }
    });

    // Buttons
    buttonsOf(dialog).concat(dialog.has_exit_action ? [dialog.exit_action] : []).forEach(function (b) {
      if (!b) return;
      if (!MiniMessage.plain(b.label).trim()) err('A button is missing its label.', b._id);
      if (b.width < 1 || b.width > 1024) err('Button width must be between 1 and 1024.', b._id);
      if (b.action.type === 'open_url' && !/^https?:\/\//.test(b.action.value || '')) {
        err('An "open a web page" button needs a full address starting with http:// or https://.', b._id);
      }
      if (b.action.type === 'dynamic_run_command' && dialog.inputs.length === 0) {
        warn('A "run a command with the answers filled in" button only makes sense when the '
          + 'dialog has inputs to read from.', b._id);
      }
    });

    if (dialog.inputs.length && typeInfo(dialog.type).buttons === 'exit') {
      warn('This dialog type has no button that submits, so nothing will ever read these inputs.');
    }

    return issues;
  }

  global.Model = {
    DIALOG_TYPES: DIALOG_TYPES,
    typeInfo: typeInfo,
    blankDialog: blankDialog,
    newBody: newBody,
    newInput: newInput,
    newButton: newButton,
    nextId: nextId,
    acceptsButtons: acceptsButtons,
    buttonsOf: buttonsOf,
    findElement: findElement,
    removeElement: removeElement,
    validate: validate,
    stepIsClean: stepIsClean
  };
})(window);
