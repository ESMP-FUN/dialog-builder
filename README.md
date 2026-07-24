# Dialog Builder

A visual editor for Minecraft's dialog screens. Lay one out by dragging fields
around, see it as the player would, and copy out either the data pack JSON or
ready-made Paper plugin code.

Nothing is installed and nothing is sent anywhere — it is one HTML page that
runs entirely in your browser. Your work is remembered in that browser until
you press **Start over**.

## Running it

Open `index.html`. That is all.

To put it online, push this folder to a GitHub repository and turn on GitHub
Pages for the `main` branch, root folder. There is no build step.

## What a dialog actually is

A dialog is the pop-up window the game shows when a plugin or data pack asks
for one. It has four parts, always in this order, always in one centred column:

1. **The title** at the top.
2. **Things to read** — paragraphs of text, and items shown in a slot.
3. **Things to fill in** — toggles, sliders, text boxes and multiple choice.
4. **Things to click** — buttons, arranged in rows.

You cannot put two things side by side, and you cannot move anything by a few
pixels. The only layout choices the game gives you are the *order* of the
elements and *how many buttons fit on a row*. That is why this tool only lets
you do those two things: anything else would show you a screen the game cannot
produce.

## The five kinds of dialog

| Kind | What it gives you |
| --- | --- |
| Notice | One button. Escape does the same thing that button does. |
| Confirmation | A yes and a no button. Escape picks no. |
| Multi-action | As many buttons as you like, in a grid, plus an optional exit button underneath. |
| Server links | The game fills in the buttons from the links your server advertises. |
| Dialog list | Buttons that open other dialogs. |

Only **multi-action** lets you place buttons yourself. The others build their
own, which is why the Button card in the palette greys out on those.

## Traps worth knowing about

These are the things that cost real time to discover, so the builder warns you
about each one as you hit it.

- **Answer names are strict.** An input's name may only contain letters,
  numbers and underscores. A name like `zones.end_city.enabled` does not
  produce a warning at runtime — the whole dialog silently fails to build.
- **Pausing and staying open cannot be combined.** A dialog set to keep itself
  open after a click is rejected if it also pauses the game, because in
  single-player that would freeze the game with no way out.
- **Staying open also stops buttons closing.** Once a dialog is set to stay
  open, the exit button no longer closes it on its own — your own code has to.
- **Sliders show float noise.** The value is worked out as `lowest + n × step`
  in floating point, so a step of `0.1` renders on screen as `0.30000001`.
  Whole numbers, `0.5` and `0.25` are the safe choices.
- **Text blocks are padded.** The screen puts a gap above and below every
  paragraph, so a body written as ten short lines reads as a tall, airy page.
  Prefer a few full sentences.
- **Text boxes hold 32 characters by default**, which is far shorter than most
  people expect.

## The three exports

- **Data pack JSON** is the real format. Save it as
  `data/<your namespace>/dialog/<name>.json` inside a data pack.
- **Java** and **Kotlin** build the same thing through Paper's Dialog API.
  Drop the class into a plugin and call `open(player)`.

The buttons and fields you build here are for looks only — this page has no
server to talk to. Wiring a button up to something that happens is the part you
do in your own code.

## Layout details that are inferred, not confirmed

Two things about how the client draws inputs were taken from the format spec
rather than measured against a running game, so treat them as close-but-check:

- where a text field's label sits relative to its box, and
- exactly how a multiple-choice button composes its `Label: Choice` face.

Everything else — the ordering, the zones, the button grid, every field and
every limit — comes straight from the format.

## Sources

- [Minecraft Wiki: Dialog](https://minecraft.wiki/w/Dialog) — the format itself
- [Paper: Dialogs](https://docs.papermc.io/paper/dev/dialogs) — the plugin API
