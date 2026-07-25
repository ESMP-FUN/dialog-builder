/*
 * Turns the document into the three things you might want to paste somewhere:
 *
 *   json   — the vanilla data pack file. This is the real format; the other
 *            two are just ways of building it from a plugin.
 *   java   — Paper's Dialog API.
 *   kotlin — the same, in Kotlin.
 *
 * Paper method names were taken from the 26.2 javadocs:
 * DialogAction.staticAction / customClick / commandTemplate.
 */
(function (global) {
  'use strict';

  /* ---- shared helpers ---- */

  function fl(n) { return String(Number(n)) + 'f'; }

  function jstr(s) {
    return JSON.stringify(String(s == null ? '' : s));
  }

  function indent(text, depth) {
    var pad = new Array(depth + 1).join('    ');
    return text.split('\n').map(function (l) { return l ? pad + l : l; }).join('\n');
  }

  /* ---- vanilla JSON ---- */

  function actionJson(action) {
    switch (action.type) {
      case 'none': return null;
      case 'open_url': return { type: 'open_url', url: action.value };
      case 'run_command': return { type: 'run_command', command: action.value };
      case 'suggest_command': return { type: 'suggest_command', command: action.value };
      case 'copy_to_clipboard': return { type: 'copy_to_clipboard', value: action.value };
      case 'show_dialog': return { type: 'show_dialog', dialog: action.value };
      case 'custom': {
        var o = { type: 'custom', id: action.value };
        if (action.payload) o.payload = action.payload;
        return o;
      }
      case 'dynamic_run_command': return { type: 'dynamic/run_command', template: action.value };
      case 'dynamic_custom': return { type: 'dynamic/custom', id: action.value };
      default: return null;
    }
  }

  function buttonJson(b) {
    var o = { label: MiniMessage.toComponent(b.label) };
    if (MiniMessage.plain(b.tooltip).trim()) o.tooltip = MiniMessage.toComponent(b.tooltip);
    if (b.width !== 150) o.width = b.width;
    var a = actionJson(b.action);
    if (a) o.action = a;
    return o;
  }

  function bodyJson(b) {
    if (b.type === 'plain_message') {
      var o = { type: 'minecraft:plain_message', contents: MiniMessage.toComponent(b.contents) };
      if (b.width !== 200) o.width = b.width;
      return o;
    }
    var item = { type: 'minecraft:item', item: { id: b.item_id } };
    if (b.count !== 1) item.item.count = b.count;
    if (MiniMessage.plain(b.description).trim()) {
      item.description = { contents: MiniMessage.toComponent(b.description) };
      if (b.description_width !== 200) item.description.width = b.description_width;
    }
    if (!b.show_decoration) item.show_decoration = false;
    if (!b.show_tooltip) item.show_tooltip = false;
    if (b.width !== 16) item.width = b.width;
    if (b.height !== 16) item.height = b.height;
    return item;
  }

  function inputJson(i) {
    var o = { type: 'minecraft:' + i.type, key: i.key, label: MiniMessage.toComponent(i.label) };

    if (i.type === 'text') {
      if (i.width !== 200) o.width = i.width;
      if (!i.label_visible) o.label_visible = false;
      if (i.initial) o.initial = i.initial;
      if (i.max_length !== 32) o.max_length = i.max_length;
      if (i.multiline) {
        o.multiline = {};
        if (i.max_lines) o.multiline.max_lines = i.max_lines;
        if (i.height) o.multiline.height = i.height;
      }

    } else if (i.type === 'boolean') {
      if (i.initial) o.initial = true;
      if (i.on_true !== 'true') o.on_true = i.on_true;
      if (i.on_false !== 'false') o.on_false = i.on_false;

    } else if (i.type === 'single_option') {
      if (i.width !== 200) o.width = i.width;
      if (!i.label_visible) o.label_visible = false;
      o.options = i.options.map(function (opt) {
        var oo = { id: opt.id };
        if (MiniMessage.plain(opt.display).trim() && opt.display !== opt.id) {
          oo.display = MiniMessage.toComponent(opt.display);
        }
        if (opt.initial) oo.initial = true;
        return oo;
      });

    } else if (i.type === 'number_range') {
      if (i.label_format !== 'options.generic_value') o.label_format = i.label_format;
      if (i.width !== 200) o.width = i.width;
      o.start = Number(i.start);
      o.end = Number(i.end);
      if (i.step) o.step = Number(i.step);
      o.initial = Number(i.initial);
    }

    return o;
  }

  function toJson(dialog) {
    var o = { type: 'minecraft:' + dialog.type, title: MiniMessage.toComponent(dialog.title) };

    if (MiniMessage.plain(dialog.external_title).trim()) {
      o.external_title = MiniMessage.toComponent(dialog.external_title);
    }
    if (dialog.body.length) o.body = dialog.body.map(bodyJson);
    if (dialog.inputs.length) o.inputs = dialog.inputs.map(inputJson);
    if (!dialog.can_close_with_escape) o.can_close_with_escape = false;
    if (!dialog.pause) o.pause = false;
    if (dialog.after_action !== 'close') o.after_action = dialog.after_action;

    switch (Model.typeInfo(dialog.type).buttons) {
      case 'single':
        o.action = buttonJson(dialog.action);
        break;
      case 'yesno':
        o.yes = buttonJson(dialog.yes);
        o.no = buttonJson(dialog.no);
        break;
      case 'list':
        o.actions = dialog.actions.map(buttonJson);
        if (dialog.columns !== 2) o.columns = dialog.columns;
        if (dialog.has_exit_action) o.exit_action = buttonJson(dialog.exit_action);
        break;
      default:
        if (dialog.type === 'dialog_list') {
          o.dialogs = dialog.dialogs.filter(function (d) { return d.trim(); });
        }
        if (dialog.columns !== 2) o.columns = dialog.columns;
        if (dialog.button_width !== 150) o.button_width = dialog.button_width;
        if (dialog.has_exit_action) o.exit_action = buttonJson(dialog.exit_action);
    }

    return JSON.stringify(o, null, 2);
  }

  /* ---- Paper: shared code generation ---- */

  // Plain text becomes Component.text; anything with tags in it goes through
  // MiniMessage, which is what the tags are for.
  function comp(value, lang) {
    var raw = String(value == null ? '' : value);
    if (!MiniMessage.hasTags(raw)) {
      return 'Component.text(' + jstr(raw) + ')';
    }
    return (lang === 'kotlin' ? 'mm.deserialize(' : 'MM.deserialize(') + jstr(raw) + ')';
  }

  function paperAction(action, lang) {
    var arrow = lang === 'kotlin' ? '{ view, audience -> }' : '(view, audience) -> {}';
    switch (action.type) {
      case 'none': return null;
      case 'open_url':
        return 'DialogAction.staticAction(ClickEvent.openUrl(' + jstr(action.value) + '))';
      case 'run_command':
        return 'DialogAction.staticAction(ClickEvent.runCommand(' + jstr(action.value) + '))';
      case 'suggest_command':
        return 'DialogAction.staticAction(ClickEvent.suggestCommand(' + jstr(action.value) + '))';
      case 'copy_to_clipboard':
        return 'DialogAction.staticAction(ClickEvent.copyToClipboard(' + jstr(action.value) + '))';
      case 'show_dialog':
        return 'DialogAction.staticAction(ClickEvent.showDialog(Key.key(' + jstr(action.value) + ')))';
      case 'custom':
        return 'DialogAction.customClick(Key.key(' + jstr(action.value) + '), null)';
      case 'dynamic_run_command':
        return 'DialogAction.commandTemplate(' + jstr(action.value) + ')';
      case 'dynamic_custom':
        return 'DialogAction.customClick(\n'
          + '    // Runs on the server when this button is clicked.\n'
          + '    // "view" holds every answer the player filled in.\n'
          + '    ' + arrow + ',\n'
          + '    ClickCallback.Options.builder().build()\n'
          + ')';
      default: return null;
    }
  }

  function paperButton(b, lang) {
    var lines = ['ActionButton.builder(' + comp(b.label, lang) + ')'];
    if (MiniMessage.plain(b.tooltip).trim()) {
      lines.push('    .tooltip(' + comp(b.tooltip, lang) + ')');
    }
    if (b.width !== 150) lines.push('    .width(' + b.width + ')');
    var act = paperAction(b.action, lang);
    if (act) lines.push('    .action(' + indent(act, 1).trim() + ')');
    lines.push('    .build()');
    return lines.join('\n');
  }

  function paperBody(b, lang) {
    if (b.type === 'plain_message') {
      return b.width !== 200
        ? 'DialogBody.plainMessage(' + comp(b.contents, lang) + ', ' + b.width + ')'
        : 'DialogBody.plainMessage(' + comp(b.contents, lang) + ')';
    }

    var stack = (lang === 'kotlin' ? '' : 'new ')
      + 'ItemStack(Material.' + materialOf(b.item_id) + ', ' + b.count + ')';

    var plain = b.type === 'item' && MiniMessage.plain(b.description).trim();
    var custom = plain || !b.show_decoration || !b.show_tooltip || b.width !== 16 || b.height !== 16;
    if (!custom) return 'DialogBody.item(' + stack + ')';

    // The long form takes the description and the display flags together.
    var desc = plain
      ? 'DialogBody.plainMessage(' + comp(b.description, lang) + ', ' + b.description_width + ')'
      : 'null';

    return 'DialogBody.item(\n'
      + '    ' + stack + ',\n'
      + '    ' + desc + ',\n'
      + '    ' + (b.show_decoration ? 'true' : 'false') + ',\n'
      + '    ' + (b.show_tooltip ? 'true' : 'false') + ',\n'
      + '    ' + b.width + ',\n'
      + '    ' + b.height + '\n'
      + ')';
  }

  function materialOf(id) {
    return id.replace(/^.*:/, '').toUpperCase();
  }

  function paperInput(i, lang) {
    var lines;

    if (i.type === 'boolean') {
      lines = ['DialogInput.bool(' + jstr(i.key) + ', ' + comp(i.label, lang) + ')'];
      if (i.initial) lines.push('    .initial(true)');
      if (i.on_true !== 'true') lines.push('    .onTrue(' + jstr(i.on_true) + ')');
      if (i.on_false !== 'false') lines.push('    .onFalse(' + jstr(i.on_false) + ')');

    } else if (i.type === 'text') {
      lines = ['DialogInput.text(' + jstr(i.key) + ', ' + comp(i.label, lang) + ')'];
      if (i.initial) lines.push('    .initial(' + jstr(i.initial) + ')');
      if (i.max_length !== 32) lines.push('    .maxLength(' + i.max_length + ')');
      if (i.width !== 200) lines.push('    .width(' + i.width + ')');
      if (!i.label_visible) lines.push('    .labelVisible(false)');
      if (i.multiline) {
        lines.push('    .multiline(TextDialogInput.MultilineOptions.create('
          + i.max_lines + ', ' + i.height + '))');
      }

    } else if (i.type === 'single_option') {
      var opts = i.options.map(function (o) {
        return 'SingleOptionDialogInput.OptionEntry.create('
          + jstr(o.id) + ', ' + comp(o.display, lang) + ', ' + (o.initial ? 'true' : 'false') + ')';
      });
      var listOpen = lang === 'kotlin' ? 'listOf(' : 'List.of(';
      lines = [
        'DialogInput.singleOption(' + jstr(i.key) + ', ' + comp(i.label, lang) + ',',
        '    ' + listOpen,
        indent(opts.join(',\n'), 2),
        '    )'
      ];
      lines = [lines.join('\n') + ')'];
      if (i.width !== 200) lines.push('    .width(' + i.width + ')');
      if (!i.label_visible) lines.push('    .labelVisible(false)');

    } else {
      lines = ['DialogInput.numberRange(' + jstr(i.key) + ', ' + comp(i.label, lang) + ', '
        + fl(i.start) + ', ' + fl(i.end) + ')'];
      if (i.step) lines.push('    .step(' + fl(i.step) + ')');
      lines.push('    .initial(' + fl(i.initial) + ')');
      if (i.label_format !== 'options.generic_value') {
        lines.push('    .labelFormat(' + jstr(i.label_format) + ')');
      }
      if (i.width !== 200) lines.push('    .width(' + i.width + ')');
    }

    lines.push('    .build()');
    return lines.join('\n');
  }

  function paperType(dialog, lang) {
    var listOpen = lang === 'kotlin' ? 'listOf(' : 'List.of(';

    switch (Model.typeInfo(dialog.type).buttons) {
      case 'single':
        return 'DialogType.notice(\n' + indent(paperButton(dialog.action, lang), 1) + '\n)';
      case 'yesno':
        return 'DialogType.confirmation(\n'
          + indent(paperButton(dialog.yes, lang), 1) + ',\n'
          + indent(paperButton(dialog.no, lang), 1) + '\n)';
      case 'list': {
        var buttons = dialog.actions.map(function (b) { return paperButton(b, lang); });
        var out = 'DialogType.multiAction(\n'
          + '    ' + listOpen + '\n'
          + indent(buttons.join(',\n'), 2) + '\n'
          + '    ),\n'
          + (dialog.has_exit_action ? indent(paperButton(dialog.exit_action, lang), 1) : '    null') + ',\n'
          + '    ' + dialog.columns + '\n)';
        return out;
      }
      default:
        if (dialog.type === 'server_links') {
          return 'DialogType.serverLinks(\n'
            + (dialog.has_exit_action ? indent(paperButton(dialog.exit_action, lang), 1) : '    null') + ',\n'
            + '    ' + dialog.columns + ',\n'
            + '    ' + dialog.button_width + '\n)';
        }
        return '// A dialog list points at dialogs already registered on the server.\n'
          + '// Build the set with RegistrySet.keySet(RegistryKey.DIALOG, ...).\n'
          + 'DialogType.dialogList(\n'
          + '    RegistrySet.keySet(RegistryKey.DIALOG,\n'
          + indent(dialog.dialogs.filter(function (d) { return d.trim(); })
            .map(function (d) { return 'DialogKeys.create(Key.key(' + jstr(d) + '))'; })
            .join(',\n'), 2) + '\n'
          + '    ),\n'
          + (dialog.has_exit_action ? indent(paperButton(dialog.exit_action, lang), 1) : '    null') + ',\n'
          + '    ' + dialog.columns + ',\n'
          + '    ' + dialog.button_width + '\n)';
    }
  }

  function imports(dialog, lang) {
    var need = {
      'io.papermc.paper.dialog.Dialog': true,
      'io.papermc.paper.registry.data.dialog.ActionButton': true,
      'io.papermc.paper.registry.data.dialog.DialogBase': true,
      'io.papermc.paper.registry.data.dialog.type.DialogType': true,
      'net.kyori.adventure.text.Component': true,
      'org.bukkit.entity.Player': true
    };

    if (dialog.body.length) need['io.papermc.paper.registry.data.dialog.body.DialogBody'] = true;
    if (dialog.body.some(function (b) { return b.type === 'item'; })) {
      need['org.bukkit.Material'] = true;
      need['org.bukkit.inventory.ItemStack'] = true;
    }
    if (dialog.inputs.length) need['io.papermc.paper.registry.data.dialog.input.DialogInput'] = true;
    if (dialog.inputs.some(function (i) { return i.type === 'single_option'; })) {
      need['io.papermc.paper.registry.data.dialog.input.SingleOptionDialogInput'] = true;
    }
    if (dialog.inputs.some(function (i) { return i.type === 'text' && i.multiline; })) {
      need['io.papermc.paper.registry.data.dialog.input.TextDialogInput'] = true;
    }

    var actions = Model.buttonsOf(dialog).concat(dialog.has_exit_action ? [dialog.exit_action] : []);
    var types = actions.filter(Boolean).map(function (b) { return b.action.type; });

    if (types.some(function (t) { return t !== 'none'; })) {
      need['io.papermc.paper.registry.data.dialog.action.DialogAction'] = true;
    }
    if (types.some(function (t) {
      return ['open_url', 'run_command', 'suggest_command', 'copy_to_clipboard', 'show_dialog'].indexOf(t) >= 0;
    })) {
      need['net.kyori.adventure.text.event.ClickEvent'] = true;
    }
    if (types.indexOf('custom') >= 0 || types.indexOf('show_dialog') >= 0 || dialog.type === 'dialog_list') {
      need['net.kyori.adventure.key.Key'] = true;
    }
    if (types.indexOf('dynamic_custom') >= 0) {
      need['net.kyori.adventure.text.event.ClickCallback'] = true;
    }
    if (dialog.type === 'dialog_list') {
      need['io.papermc.paper.registry.RegistryKey'] = true;
      need['io.papermc.paper.registry.set.RegistrySet'] = true;
    }

    var usesMiniMessage = [dialog.title, dialog.external_title]
      .concat(dialog.body.map(function (b) { return b.contents || b.description || ''; }))
      .concat(dialog.inputs.map(function (i) { return i.label || ''; }))
      .concat(actions.filter(Boolean).map(function (b) { return b.label + b.tooltip; }))
      .some(function (v) { return MiniMessage.hasTags(v); });

    if (usesMiniMessage) need['net.kyori.adventure.text.minimessage.MiniMessage'] = true;

    var needsList = dialog.body.length || dialog.inputs.length
      || Model.typeInfo(dialog.type).buttons === 'list'
      || dialog.inputs.some(function (i) { return i.type === 'single_option'; });
    if (needsList && lang === 'java') need['java.util.List'] = true;

    return { list: Object.keys(need).sort(), miniMessage: usesMiniMessage };
  }

  function baseBlock(dialog, lang) {
    var listOpen = lang === 'kotlin' ? 'listOf(' : 'List.of(';
    var lines = ['DialogBase.builder(' + comp(dialog.title, lang) + ')'];

    if (MiniMessage.plain(dialog.external_title).trim()) {
      lines.push('    .externalTitle(' + comp(dialog.external_title, lang) + ')');
    }

    if (dialog.body.length) {
      var bodies = dialog.body.map(function (b) { return paperBody(b, lang); });
      lines.push('    .body(' + listOpen);
      lines.push(indent(bodies.join(',\n'), 2));
      lines.push('    ))');
    }

    if (dialog.inputs.length) {
      var ins = dialog.inputs.map(function (i) { return paperInput(i, lang); });
      lines.push('    .inputs(' + listOpen);
      lines.push(indent(ins.join(',\n'), 2));
      lines.push('    ))');
    }

    if (!dialog.can_close_with_escape) lines.push('    .canCloseWithEscape(false)');

    // Worth spelling out even at the default: pause(true) plus afterAction NONE
    // is the one combination the server rejects outright.
    lines.push('    .pause(' + (dialog.pause ? 'true' : 'false') + ')');

    if (dialog.after_action !== 'close') {
      lines.push('    .afterAction(DialogBase.DialogAfterAction.'
        + dialog.after_action.toUpperCase() + ')');
    }

    lines.push('    .build()');
    return lines.join('\n');
  }

  function toJava(dialog) {
    var imp = imports(dialog, 'java');
    var out = [];

    imp.list.forEach(function (i) { out.push('import ' + i + ';'); });
    out.push('');
    out.push('public final class GeneratedDialog {');
    out.push('');
    if (imp.miniMessage) {
      out.push('    private static final MiniMessage MM = MiniMessage.miniMessage();');
      out.push('');
    }
    out.push('    private GeneratedDialog() {');
    out.push('    }');
    out.push('');
    out.push('    public static void open(Player player) {');
    out.push('        Dialog dialog = Dialog.create(factory -> factory.empty()');
    out.push(indent('.base(' + indent(baseBlock(dialog, 'java'), 0).trim() + ')', 3));
    out.push(indent('.type(' + indent(paperType(dialog, 'java'), 0).trim() + ')', 3));
    out.push('        );');
    out.push('');
    out.push('        player.showDialog(dialog);');
    out.push('    }');
    out.push('}');

    return out.join('\n');
  }

  function toKotlin(dialog) {
    var imp = imports(dialog, 'kotlin');
    var out = [];

    // Kotlin imports carry no semicolon, and listOf makes java.util.List moot.
    imp.list.filter(function (i) { return i !== 'java.util.List'; })
      .forEach(function (i) { out.push('import ' + i); });
    out.push('');
    out.push('object GeneratedDialog {');
    out.push('');
    if (imp.miniMessage) {
      out.push('    private val mm = MiniMessage.miniMessage()');
      out.push('');
    }
    out.push('    fun open(player: Player) {');
    out.push('        val dialog = Dialog.create { factory ->');
    out.push('            factory.empty()');
    out.push(indent('.base(' + indent(baseBlock(dialog, 'kotlin'), 0).trim() + ')', 4));
    out.push(indent('.type(' + indent(paperType(dialog, 'kotlin'), 0).trim() + ')', 4));
    out.push('        }');
    out.push('');
    out.push('        player.showDialog(dialog)');
    out.push('    }');
    out.push('}');

    return out.join('\n');
  }

  global.Exporter = {
    toJson: toJson,
    toJava: toJava,
    toKotlin: toKotlin
  };
})(window);
