/*
 * The tips window. Opens by itself the first time somebody uses the builder,
 * and from the Tips button after that.
 *
 * Every snippet is click-to-copy. The MiniMessage examples are the tags people
 * reach for most; the traps below them are the ones that cost real time to
 * work out from scratch.
 */
(function (global) {
  'use strict';

  var SEEN_KEY = 'mc-dialog-builder:tips-seen';

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  var MINIMESSAGE = [
    {
      title: 'Colour',
      snippet: '<gold>Treasure</gold> and <red>danger</red>',
      note: 'All sixteen Minecraft colour names work. Close a tag with a slash.'
    },
    {
      title: 'Any colour you like',
      snippet: '<#5AC8FA>a custom blue</#5AC8FA>',
      note: 'A hex code works anywhere a colour name does.'
    },
    {
      title: 'Bold, italic, underline',
      snippet: '<bold>heavy</bold> <italic>slanted</italic> <underlined>lined</underlined>',
      note: 'Short forms <b>, <i> and <u> do the same thing.'
    },
    {
      title: 'Fading between colours',
      snippet: '<gradient:#FFD479:#FF7B54>a warm fade</gradient>',
      note: 'The fade is spread across the letters. Add more colours for more stops.'
    },
    {
      title: 'Rainbow',
      snippet: '<rainbow>every colour at once</rainbow>',
      note: 'Best kept for one short word.'
    },
    {
      title: 'Click to open a link',
      snippet: '<click:open_url:\'https://example.com\'>Visit our site</click>',
      note: 'The player is asked to confirm before their browser opens. Quote the address '
        + 'so the colon in "https:" is not read as part of the tag.'
    },
    {
      title: 'Click to run a command',
      snippet: '<click:run_command:\'/spawn\'>Go to spawn</click>',
      note: 'Runs as if the player typed it, so they need permission for it themselves.'
    },
    {
      title: 'Click to fill in chat',
      snippet: '<click:suggest_command:\'/msg Notch \'>Message Notch</click>',
      note: 'Opens chat with the text ready, but does not send it.'
    },
    {
      title: 'Click to copy',
      snippet: '<click:copy_to_clipboard:\'hello\'>Copy that word</click>',
      note: 'Puts the text straight on the player\'s clipboard.'
    },
    {
      title: 'Hover for more',
      snippet: '<hover:show_text:\'<gray>Costs 10 levels</gray>\'>Buy an elytra</hover>',
      note: 'The hover text can be styled too. Hovering a link here shows you the same thing.'
    },
    {
      title: 'A new line',
      snippet: 'First line<newline>Second line',
      note: 'Prefer one full paragraph over many short lines — see the trap below.'
    },
    {
      title: 'A different font',
      snippet: '<font:minecraft:uniform>even-width text</font>',
      note: 'Java Edition has four fonts of its own. Anything beyond those has to come from '
        + 'a resource pack — the Fonts panel on the right will build you one.'
    }
  ];

  var TRAPS = [
    {
      title: 'The mouse jumping back to the middle of the screen',
      body: 'By default every button click closes the dialog, so the game grabs the mouse '
        + 'back, your cursor snaps to the centre, and only then does the next screen open. '
        + 'On a settings screen with several buttons that gets maddening fast.\n\n'
        + 'Tell the dialog to stay open instead, and the cursor stays exactly where you '
        + 'clicked. The catch: the game refuses to do that while the dialog also pauses '
        + 'the game, because in single-player that would freeze it with no way to unpause. '
        + 'So you have to turn pausing off in the same breath.',
      code: {
        kotlin: 'DialogBase.builder(title)\n'
          + '    .afterAction(DialogBase.DialogAfterAction.NONE)  // cursor stays put\n'
          + '    .pause(false)                                    // required alongside NONE\n'
          + '    .build()',
        java: 'DialogBase.builder(title)\n'
          + '    .afterAction(DialogBase.DialogAfterAction.NONE)  // cursor stays put\n'
          + '    .pause(false)                                    // required alongside NONE\n'
          + '    .build();',
        json: '"after_action": "none",\n"pause": false'
      },
      after: 'One more thing follows from it: once the dialog stays open, no button closes '
        + 'it on its own any more. A Close button has to actually close it — call '
        + 'player.closeDialog() from your own click handler.'
    },
    {
      title: 'Names for answers are stricter than they look',
      body: 'An input\'s name may only contain letters, numbers and underscores. Give it a '
        + 'name like zones.end_city.enabled and you get no warning at all — the whole dialog '
        + 'silently fails to build and nothing opens.\n\n'
        + 'If your settings live under dotted paths, register the input under a safe name and '
        + 'translate back when you read the answer.',
      code: {
        kotlin: 'fun String.dialogKey() = replace(Regex("[^A-Za-z0-9_]"), "_")',
        java: 'String dialogKey(String s) {\n'
          + '    return s.replaceAll("[^A-Za-z0-9_]", "_");\n'
          + '}',
        json: '"key": "end_city_enabled"'
      }
    },
    {
      title: 'Sliders that show 0.30000001',
      body: 'The client works the value out as lowest + n x step in floating point, so a step '
        + 'of 0.1 renders on screen as a long ugly number.\n\n'
        + 'Whole numbers, 0.5 and 0.25 are the safe choices. If you need finer control, store '
        + 'the real value differently: a slider in whole seconds that you multiply by 20 for '
        + 'ticks reads far better than a slider in ticks.',
      code: {
        kotlin: '// shown in seconds, stored in ticks\n'
          + 'slider("cooldown", "Cooldown (seconds)", 0f, 5f, 0.25f, ticks / 20f)',
        java: '// shown in seconds, stored in ticks\n'
          + 'slider("cooldown", "Cooldown (seconds)", 0f, 5f, 0.25f, ticks / 20f);',
        json: '"start": 0, "end": 5, "step": 0.25'
      }
    },
    {
      title: 'Text blocks are padded, so short lines look wrong',
      body: 'The screen puts a gap above and below every block of text. Write your description '
        + 'as ten short hand-broken lines and it renders as a tall, airy page with gaps '
        + 'everywhere.\n\nWrite a few sentence-length paragraphs and set a generous width '
        + 'instead — 400 rather than the default 200 — and let the game wrap them.'
    },
    {
      title: 'Text boxes only hold 32 characters',
      body: 'That is the default maximum length, and it is far shorter than most people '
        + 'expect. If you are asking for anything longer than a nickname, raise it.'
    },
    {
      title: 'A custom font only works if the player has the pack',
      body: 'Java Edition has four fonts built in: the normal one, GNU Unifont, the '
        + 'enchanting-table runes and the illager runes. Those work for everyone, always.\n\n'
        + 'Any other font has to be delivered in a resource pack. If a player does not have '
        + 'it, the game does not complain — it quietly draws your text in the normal font '
        + 'instead. So never rely on a custom font to make something readable or make sense; '
        + 'treat it as decoration on top of text that already works.\n\n'
        + 'Drop a .ttf into the Fonts panel and the builder will hand you back a working pack '
        + 'with the font, the font definition and instructions already in it.',
      code: {
        json: '{\n'
          + '  "providers": [\n'
          + '    { "type": "ttf", "file": "mypack:fancy.ttf",\n'
          + '      "shift": [0, 0], "size": 11, "oversample": 2 }\n'
          + '  ]\n'
          + '}'
      },
      after: 'That file goes at assets/mypack/font/fancy.json, and the .ttf beside it in the '
        + 'same folder. Then the name "mypack:fancy" is real and your text can ask for it.'
    },
    {
      title: 'Only multi-action lets you place your own buttons',
      body: 'Notice gives you one button. Confirmation gives you a yes and a no. Server links '
        + 'and dialog list build their rows from the server\'s own data.\n\n'
        + 'If you want a row of buttons you control, multi-action is the only type that offers '
        + 'it — and its exit button is what Escape does.'
    }
  ];

  function snippetBlock(text, lang) {
    var box = el('div', 'snippet');
    var pre = el('pre', 'snippet-code', text);
    box.appendChild(pre);

    var copy = el('button', 'snippet-copy', 'Copy');
    copy.title = 'Copy to clipboard';
    copy.addEventListener('click', function () {
      navigator.clipboard.writeText(text).then(function () {
        copy.textContent = 'Copied';
        copy.classList.add('is-done');
        setTimeout(function () {
          copy.textContent = 'Copy';
          copy.classList.remove('is-done');
        }, 1200);
      });
    });
    box.appendChild(copy);
    if (lang) box.appendChild(el('span', 'snippet-lang', lang));
    return box;
  }

  function buildMiniMessage() {
    var wrap = el('div', 'tips-pane');
    wrap.appendChild(el('p', 'tips-lead',
      'MiniMessage is the tag language Paper uses for coloured text. Anywhere this builder '
      + 'asks for words — titles, labels, button text, tooltips — you can use these. The '
      + 'preview renders them as you type.'));

    MINIMESSAGE.forEach(function (t) {
      var card = el('div', 'tip-card');
      card.appendChild(el('h4', null, t.title));

      var demo = el('div', 'tip-demo');
      MiniMessage.into(demo, t.snippet);
      card.appendChild(demo);

      card.appendChild(snippetBlock(t.snippet));
      card.appendChild(el('p', 'tip-note', t.note));
      wrap.appendChild(card);
    });

    return wrap;
  }

  function buildTraps() {
    var wrap = el('div', 'tips-pane');
    wrap.appendChild(el('p', 'tips-lead',
      'Things the format will not warn you about. Each of these costs an evening to work out '
      + 'the first time.'));

    TRAPS.forEach(function (t) {
      var card = el('div', 'tip-card');
      card.appendChild(el('h4', null, t.title));

      t.body.split('\n\n').forEach(function (para) {
        card.appendChild(el('p', 'tip-note', para));
      });

      if (t.code) {
        var tabs = el('div', 'mini-tabs');
        var host = el('div', 'mini-tab-body');
        var langs = Object.keys(t.code);

        langs.forEach(function (lang, i) {
          var b = el('button', 'mini-tab' + (i === 0 ? ' is-active' : ''),
            { kotlin: 'Kotlin', java: 'Java', json: 'JSON' }[lang] || lang);
          b.addEventListener('click', function () {
            Array.prototype.forEach.call(tabs.children, function (c) {
              c.classList.remove('is-active');
            });
            b.classList.add('is-active');
            host.textContent = '';
            host.appendChild(snippetBlock(t.code[lang]));
          });
          tabs.appendChild(b);
        });

        host.appendChild(snippetBlock(t.code[langs[0]]));
        card.appendChild(tabs);
        card.appendChild(host);
      }

      if (t.after) card.appendChild(el('p', 'tip-note', t.after));
      wrap.appendChild(card);
    });

    return wrap;
  }

  function buildBasics() {
    var wrap = el('div', 'tips-pane');
    wrap.appendChild(el('p', 'tips-lead',
      'A dialog is the pop-up window a plugin or data pack asks the game to show. It always '
      + 'has the same four parts, always in this order, always in one centred column.'));

    [
      ['1. The title', 'At the top, in a dark band. The yellow warning button beside it is put '
        + 'there by the game and cannot be removed — clicking it in game leaves the world.'],
      ['2. Things to read', 'Paragraphs of text, and items shown in a slot with optional text '
        + 'beside them.'],
      ['3. Things to fill in', 'Toggles, sliders, text boxes and multiple choice. Each one has '
        + 'a name your code reads the answer back by.'],
      ['4. Things to click', 'Buttons. On a multi-action dialog they sit in a grid you control; '
        + 'the exit button goes in the dark band at the bottom and is what Escape does.']
    ].forEach(function (pair) {
      var card = el('div', 'tip-card');
      card.appendChild(el('h4', null, pair[0]));
      card.appendChild(el('p', 'tip-note', pair[1]));
      wrap.appendChild(card);
    });

    var why = el('div', 'tip-card');
    why.appendChild(el('h4', null, 'Why you cannot put two things side by side'));
    why.appendChild(el('p', 'tip-note',
      'Because the game will not. There is no free layout: no columns, no nudging something '
      + 'a few pixels, no putting a toggle next to a slider. The only layout choices you get '
      + 'are the order of the elements and how many buttons fit on a row. That is why this '
      + 'builder only offers those two things — anything else would show you a screen the '
      + 'game cannot actually produce.'));
    wrap.appendChild(why);

    return wrap;
  }

  var PANES = [
    { id: 'basics', name: 'How a dialog works', build: buildBasics },
    { id: 'minimessage', name: 'Colours & links', build: buildMiniMessage },
    { id: 'traps', name: 'Traps worth knowing', build: buildTraps }
  ];

  var overlay = null;

  function close() {
    if (!overlay) return;
    overlay.remove();
    overlay = null;
    document.removeEventListener('keydown', onKey);
  }

  function onKey(e) { if (e.key === 'Escape') close(); }

  function open() {
    if (overlay) return;

    overlay = el('div', 'modal-overlay');
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) close();
    });

    var modal = el('div', 'modal');

    var head = el('div', 'modal-head');
    var titles = el('div');
    titles.appendChild(el('h2', 'modal-title', 'Tips & tricks'));
    titles.appendChild(el('p', 'modal-sub',
      'Everything worth knowing before you build your first dialog.'));
    head.appendChild(titles);

    var x = el('button', 'modal-close', '✕');
    x.title = 'Close (Escape)';
    x.addEventListener('click', close);
    head.appendChild(x);
    modal.appendChild(head);

    var tabs = el('div', 'modal-tabs');
    var body = el('div', 'modal-body');

    PANES.forEach(function (pane, i) {
      var b = el('button', 'modal-tab' + (i === 0 ? ' is-active' : ''), pane.name);
      b.addEventListener('click', function () {
        Array.prototype.forEach.call(tabs.children, function (c) {
          c.classList.remove('is-active');
        });
        b.classList.add('is-active');
        body.textContent = '';
        body.appendChild(pane.build());
        body.scrollTop = 0;
      });
      tabs.appendChild(b);
    });

    body.appendChild(PANES[0].build());
    modal.appendChild(tabs);
    modal.appendChild(body);

    var foot = el('div', 'modal-foot');
    foot.appendChild(el('span', 'modal-hint', 'Reopen this any time with the Tips button.'));
    var done = el('button', 'btn btn-primary', 'Start building');
    done.addEventListener('click', close);
    foot.appendChild(done);
    modal.appendChild(foot);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    document.addEventListener('keydown', onKey);

    try { localStorage.setItem(SEEN_KEY, '1'); } catch (e) { /* private browsing */ }
  }

  function openIfFirstVisit() {
    var seen;
    try { seen = localStorage.getItem(SEEN_KEY); } catch (e) { seen = '1'; }
    if (!seen) open();
  }

  global.Tips = { open: open, openIfFirstVisit: openIfFirstVisit };
})(window);
