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
for one. On screen it is three bands:

- a **dark strip at the top** holding the title, with the game's own yellow
  warning button beside it (clicking that in game leaves the world — you cannot
  remove or change it);
- a **middle area the blurred world shows straight through**, holding
  everything to read, everything to fill in, and — on a multi-action dialog —
  your grid of buttons;
- a **dark strip at the bottom** holding the exit or confirm buttons, which is
  also what Escape does.

Within that, the order never changes:

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

## Fonts

Any piece of text in a dialog can ask for a different font. Java Edition has
four of its own:

| Key | What it is |
| --- | --- |
| `minecraft:default` | Mojangles, the pixel font almost everything uses |
| `minecraft:uniform` | GNU Unifont, the even-width fallback for unusual characters |
| `minecraft:alt` | Standard Galactic Alphabet — the enchanting table runes |
| `minecraft:illageralt` | Illager runes, which the game never uses itself |

Write `<font:minecraft:uniform>text</font>`, or select something and press
**Use here** in the Fonts panel.

Anything beyond those four has to be delivered in a resource pack. Drop a
`.ttf` or `.otf` onto the Fonts panel, give it a name like `mypack:fancy`, and
the builder will hand you back a working pack — the font, the font definition
at `assets/mypack/font/fancy.json`, a `pack.mcmeta` and a short README, zipped
and ready to load. Your font never leaves your browser.

The generated `pack.mcmeta` declares a version range of 63 to 999, so it keeps
loading as new Minecraft versions come out and never needs editing:

```json
{
  "pack": {
    "description": "mypack:fancy — font for Minecraft dialogs",
    "pack_format": 63,
    "supported_formats": { "min_inclusive": 63, "max_inclusive": 999 },
    "min_format": 63,
    "max_format": 999
  }
}
```

Both pairs are there deliberately. 1.21.9 replaced `pack_format` and
`supported_formats` with `min_format` and `max_format`, but kept reading the
old pair for packs that still support older releases — and for a resource pack
that cut-off is format 65. Since dialogs arrived in 1.21.6, whose resource pack
format is 63, the old fields are not merely allowed but required. Drop them and
the pack silently stops loading on 1.21.6 through 1.21.8.

Worth knowing: if a player does not have the pack, the game does not complain.
It quietly falls back to the normal font. So treat a custom font as decoration
on top of text that already reads correctly without it.

The preview draws the first two fonts truthfully — Mojangles ships with the
tool, Unifont is fetched only when something actually uses it. The two rune
fonts are pictures inside the game with no font file to borrow, so the preview
shows ordinary letters and says so on the card.

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

## How close the preview is

The layout, the three bands, and each control's shape were checked against the
screenshots on the wiki:

- a text field puts its label **above** the box, centred;
- a toggle puts its box **first**, label to the right;
- a multiple-choice control is a button reading **`Label: Choice`**;
- a slider is a track reading **`Label: value`**.

Text is drawn the way the game draws it, too: the shadow is the glyph's own
colour with red, green and blue divided by four, offset an eighth of a
character down and right; bold is the glyph drawn twice a pixel apart rather
than a heavier face; italic is a shear. That is why only the regular weight of
Mojangles ships here — the game synthesises the other two, and so does the
browser.

Item pictures are 16×16 textures from Mojang's
[bedrock-samples](https://github.com/Mojang/bedrock-samples) resource pack,
covering 110 common items. Any other item id still works — it just draws a
lettered placeholder instead.

## Sources

- [Minecraft Wiki: Dialog](https://minecraft.wiki/w/Dialog) — the format itself
- [Minecraft Wiki: Font](https://minecraft.wiki/w/Font) — the font providers, and
  how the game draws shadow, bold and italic
- [Minecraft Wiki: Pack format](https://minecraft.wiki/w/Pack_format) — the
  version numbers the generated resource pack declares
- [Paper: Dialogs](https://docs.papermc.io/paper/dev/dialogs) — the plugin API
- [Paper javadocs](https://jd.papermc.io/paper/26.2/) — every builder method the
  exports use was checked against the 26.2 API index

## Credits

Mojangles is © Mojang AB. GNU Unifont is by Roman Czyborra, Paul Hardy and
contributors, under the GNU GPL with font embedding exception / SIL OFL. Item
textures come from Mojang's
[bedrock-samples](https://github.com/Mojang/bedrock-samples) resource pack.
