/*
 * Turns the labelled alphabet charts in fonts/ into sprite strips the preview
 * can draw with.
 *
 * The charts alternate a row of Latin labels with a row of the matching runes.
 * The labels are what make this safe: each one is a single blob of ink, so the
 * number of blobs in a label row must equal the number of characters that row
 * is supposed to cover. If it does not, the chart was read wrongly and the
 * build stops rather than shipping runes under the wrong letters.
 *
 * Slicing happens on the midpoints between neighbouring label centres, because
 * a rune often breaks into several separate blobs (a dot over a stroke, say)
 * and cannot be found by looking for connected ink alone.
 *
 * Output per font:
 *   assets/fonts/<name>.png   every glyph in one horizontal strip, white on
 *                             transparent so CSS can tint it with currentColor
 *   js/glyphs.js              character -> { x, w } within that strip
 *
 * Run with:  npm i pngjs && node tools/build-glyphs.js
 * A .webp source is converted with ffmpeg first.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { PNG } = require('pngjs');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'assets', 'fonts');

const SOURCES = [
  {
    key: 'minecraft:alt',
    name: 'sga',
    file: 'fonts/sga.png',
    // Dark runes printed on a light background.
    ink: (r, g, b, a) => (a > 16 ? Math.max(0, 255 - (r + g + b) / 3) : 0),
    // The chart puts the runes above their labels.
    order: 'glyphs-first',
    rows: ['abcdefghijklmn', 'opqrstuvwxyz']
  },
  {
    key: 'minecraft:illageralt',
    name: 'illageralt',
    file: 'fonts/illagerart.webp',
    // Light runes on a dark background.
    ink: (r, g, b) => Math.max(0, (r + g + b) / 3 - 40) * (255 / 215),
    // This chart puts the labels above their runes.
    order: 'labels-first',
    rows: ['abcdefghijklm', 'nopqrstuvwxyz', '123456789', '?!.,']
  }
];

/* ---- helpers ---- */

function load(file) {
  let full = path.join(ROOT, file);

  if (/\.webp$/i.test(full)) {
    const png = path.join(OUT_DIR, '.tmp-' + path.basename(full, '.webp') + '.png');
    fs.mkdirSync(OUT_DIR, { recursive: true });
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', full, png]);
    const img = PNG.sync.read(fs.readFileSync(png));
    fs.unlinkSync(png);
    return img;
  }

  return PNG.sync.read(fs.readFileSync(full));
}

function alphaMap(img, ink) {
  const a = new Float32Array(img.width * img.height);
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const i = (img.width * y + x) << 2;
      a[img.width * y + x] = ink(img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]);
    }
  }
  return a;
}

// Contiguous runs of non-zero values, used for both rows and columns.
function bands(counts, threshold) {
  const out = [];
  let start = -1;
  for (let i = 0; i < counts.length; i++) {
    if (counts[i] > threshold && start < 0) start = i;
    else if (counts[i] <= threshold && start >= 0) { out.push([start, i - 1]); start = -1; }
  }
  if (start >= 0) out.push([start, counts.length - 1]);
  return out;
}

function rowBands(alpha, w, h) {
  const counts = [];
  for (let y = 0; y < h; y++) {
    let n = 0;
    for (let x = 0; x < w; x++) if (alpha[w * y + x] > 40) n++;
    counts.push(n);
  }
  return bands(counts, 0);
}

function colBands(alpha, w, band, from, to) {
  const counts = [];
  for (let x = from; x <= to; x++) {
    let n = 0;
    for (let y = band[0]; y <= band[1]; y++) if (alpha[w * y + x] > 40) n++;
    counts.push(n);
  }
  return bands(counts, 0).map(b => [b[0] + from, b[1] + from]);
}

/*
 * Groups the blobs of ink on one rune row into exactly `count` runes.
 *
 * A rune often breaks into several blobs — a dot above a stroke, a pair of
 * separated bars — so blob count alone is not rune count. What separates two
 * runes is always a wider gap than anything inside a single rune, so taking
 * the count-1 widest gaps as the boundaries recovers the runes without
 * needing to know the font's pitch.
 */
function cluster(pieces, count, name, row) {
  if (pieces.length < count) {
    throw new Error(name + ' row ' + (row + 1) + ': found only ' + pieces.length
      + ' marks for ' + count + ' characters — two runes are probably touching, '
      + 'so they cannot be told apart.');
  }
  if (pieces.length === count) return pieces.map(p => [p[0], p[1]]);

  const gaps = [];
  for (let i = 1; i < pieces.length; i++) {
    gaps.push({ at: i, size: pieces[i][0] - pieces[i - 1][1] });
  }

  const ranked = gaps.slice().sort((a, b) => b.size - a.size);
  const kept = ranked.slice(0, count - 1);
  const merged = ranked.slice(count - 1);

  // The split is only trustworthy when every gap between runes is wider than
  // every gap inside one. Warn loudly when those two sets nearly touch.
  const narrowestKept = kept.length ? kept[kept.length - 1].size : Infinity;
  const widestMerged = merged.length ? merged[0].size : -Infinity;
  if (merged.length && narrowestKept - widestMerged < 2) {
    console.warn('  ! ' + name + ' row ' + (row + 1) + ': gaps between runes (' + narrowestKept
      + 'px) are barely wider than gaps inside one (' + widestMerged + 'px). Check the output.');
  }
  if (process.env.VERBOSE) {
    console.log('  row ' + (row + 1) + ': ' + pieces.length + ' marks -> ' + count + ' runes; '
      + 'gaps kept >= ' + narrowestKept + 'px, merged <= '
      + (merged.length ? widestMerged + 'px' : 'none'));
  }

  const splits = kept.map(g => g.at).sort((a, b) => a - b);

  const runes = [];
  let start = 0;
  splits.concat([pieces.length]).forEach(end => {
    runes.push([pieces[start][0], pieces[end - 1][1]]);
    start = end;
  });

  return runes;
}

/* ---- the work ---- */

function extract(source) {
  const img = load(source.file);
  const alpha = alphaMap(img, source.ink);
  const all = rowBands(alpha, img.width, img.height);

  const expectedBands = source.rows.length * 2;
  if (all.length !== expectedBands) {
    throw new Error(source.name + ': expected ' + expectedBands + ' bands of ink ('
      + source.rows.length + ' rows of labels plus runes) but found ' + all.length);
  }

  const glyphs = [];

  source.rows.forEach((chars, row) => {
    const first = all[row * 2];
    const second = all[row * 2 + 1];
    const labelBand = source.order === 'labels-first' ? first : second;
    const glyphBand = source.order === 'labels-first' ? second : first;

    const labels = colBands(alpha, img.width, labelBand, 0, img.width - 1);
    if (labels.length !== chars.length) {
      throw new Error(source.name + ' row ' + (row + 1) + ': the chart labels "' + chars
        + '" should be ' + chars.length + ' characters but ' + labels.length
        + ' were found. Refusing to guess which rune belongs to which letter.');
    }

    // The labels only confirm the count. They cannot be used to place the
    // cuts: on the Illageralt chart the runes sit on their own pitch and do
    // not line up under their letters at all.
    const pieces = colBands(alpha, img.width, glyphBand, 0, img.width - 1);
    const runes = cluster(pieces, chars.length, source.name, row);

    runes.forEach((rune, i) => {
      glyphs.push({
        char: chars[i],
        // Trimmed to the rune's own width, but keeping the full band height so
        // every rune on a line keeps its vertical position relative to the rest.
        x0: rune[0],
        x1: rune[1],
        y0: glyphBand[0],
        y1: glyphBand[1]
      });
    });
  });

  return { img, alpha, glyphs };
}

function pack(source, data) {
  const { img, alpha, glyphs } = data;

  // Every band is one line of text, so aligning their bottoms lines the runes
  // up on a common baseline.
  const height = Math.max(...glyphs.map(g => g.y1 - g.y0 + 1));
  const gap = 1;
  const widths = glyphs.map(g => g.x1 - g.x0 + 1);
  const total = widths.reduce((n, w) => n + w + gap, 0) - gap;

  const out = new PNG({ width: total, height, fill: true });
  out.data.fill(0);

  const map = {};
  let cursor = 0;

  glyphs.forEach((g, i) => {
    const w = widths[i];
    const bandH = g.y1 - g.y0 + 1;
    const yOffset = height - bandH; // bottom-aligned

    for (let y = 0; y < bandH; y++) {
      for (let x = 0; x < w; x++) {
        const a = alpha[img.width * (g.y0 + y) + (g.x0 + x)];
        const o = (total * (y + yOffset) + cursor + x) << 2;
        out.data[o] = 255;
        out.data[o + 1] = 255;
        out.data[o + 2] = 255;
        out.data[o + 3] = Math.max(0, Math.min(255, Math.round(a)));
      }
    }

    map[g.char] = { x: cursor, w: w };
    cursor += w + gap;
  });

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, source.name + '.png'), PNG.sync.write(out));

  return { width: total, height: height, glyphs: map };
}

function main() {
  const fonts = {};

  SOURCES.forEach(source => {
    const data = extract(source);
    const packed = pack(source, data);
    fonts[source.key] = Object.assign({ sheet: 'assets/fonts/' + source.name + '.png' }, packed);
    console.log(source.name + ': ' + Object.keys(packed.glyphs).length + ' runes, strip '
      + packed.width + 'x' + packed.height);
  });

  const body = '/*\n'
    + ' * Rune glyphs, generated by tools/build-glyphs.js from the labelled\n'
    + ' * alphabet charts in fonts/. Do not edit by hand — rerun the tool.\n'
    + ' *\n'
    + ' * Each font is one horizontal strip of white-on-transparent runes; the\n'
    + ' * map gives each character its offset and width within that strip.\n'
    + ' */\n'
    + '(function (global) {\n'
    + '  \'use strict\';\n\n'
    + '  global.Glyphs = ' + JSON.stringify(fonts, null, 2).replace(/\n/g, '\n  ') + ';\n'
    + '})(window);\n';

  fs.writeFileSync(path.join(ROOT, 'js', 'glyphs.js'), body);
  console.log('wrote js/glyphs.js');
}

main();
