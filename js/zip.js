/*
 * A very small ZIP writer, just enough to hand back a resource pack.
 *
 * Entries are stored uncompressed (method 0). A resource pack is a handful of
 * small files plus a font that is already compressed, so compression would buy
 * almost nothing and cost a deflate implementation.
 */
(function (global) {
  'use strict';

  var CRC_TABLE = (function () {
    var table = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) {
      c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    }
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function textBytes(str) { return new TextEncoder().encode(str); }

  // "data:font/ttf;base64,AAAA..." -> raw bytes
  function dataUrlBytes(dataUrl) {
    var b64 = String(dataUrl).split(',')[1] || '';
    var bin = atob(b64);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function Writer(size) {
    this.buf = new Uint8Array(size);
    this.view = new DataView(this.buf.buffer);
    this.at = 0;
  }
  Writer.prototype.u16 = function (v) { this.view.setUint16(this.at, v, true); this.at += 2; };
  Writer.prototype.u32 = function (v) { this.view.setUint32(this.at, v >>> 0, true); this.at += 4; };
  Writer.prototype.bytes = function (b) { this.buf.set(b, this.at); this.at += b.length; };

  /**
   * files: [{ name: 'path/in/zip', bytes: Uint8Array }]
   * Returns a Blob ready to hand to a download link.
   */
  function build(files) {
    var entries = files.map(function (f) {
      var name = textBytes(f.name);
      return { name: name, bytes: f.bytes, crc: crc32(f.bytes) };
    });

    var localSize = entries.reduce(function (n, e) {
      return n + 30 + e.name.length + e.bytes.length;
    }, 0);
    var centralSize = entries.reduce(function (n, e) {
      return n + 46 + e.name.length;
    }, 0);

    var w = new Writer(localSize + centralSize + 22);
    var offsets = [];

    entries.forEach(function (e) {
      offsets.push(w.at);
      w.u32(0x04034B50);      // local file header
      w.u16(20);              // version needed
      w.u16(0);               // flags
      w.u16(0);               // method: stored
      w.u16(0); w.u16(0);     // mod time / date
      w.u32(e.crc);
      w.u32(e.bytes.length);  // compressed size
      w.u32(e.bytes.length);  // uncompressed size
      w.u16(e.name.length);
      w.u16(0);               // extra length
      w.bytes(e.name);
      w.bytes(e.bytes);
    });

    var centralStart = w.at;

    entries.forEach(function (e, i) {
      w.u32(0x02014B50);      // central directory header
      w.u16(20);              // version made by
      w.u16(20);              // version needed
      w.u16(0); w.u16(0);     // flags / method
      w.u16(0); w.u16(0);     // mod time / date
      w.u32(e.crc);
      w.u32(e.bytes.length);
      w.u32(e.bytes.length);
      w.u16(e.name.length);
      w.u16(0); w.u16(0);     // extra / comment length
      w.u16(0);               // disk number
      w.u16(0);               // internal attrs
      w.u32(0);               // external attrs
      w.u32(offsets[i]);
      w.bytes(e.name);
    });

    w.u32(0x06054B50);        // end of central directory
    w.u16(0); w.u16(0);       // disk numbers
    w.u16(entries.length);
    w.u16(entries.length);
    w.u32(centralSize);
    w.u32(centralStart);
    w.u16(0);                 // comment length

    return new Blob([w.buf], { type: 'application/zip' });
  }

  global.Zip = { build: build, textBytes: textBytes, dataUrlBytes: dataUrlBytes };
})(window);
