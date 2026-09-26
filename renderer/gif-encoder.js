// 小小的 GIF 编码器：把几帧 RGBA 画面存成一张会动的、背景透明的 GIF（拍照用）
(function (root) {
  // 所有帧里用到的颜色做一个调色板（第 0 格留给透明）。颜色太多就把颜色精度降一点。
  function buildPalette(frames) {
    for (let shift = 0; shift <= 4; shift++) {
      const mask = (0xff << shift) & 0xff;
      const colors = new Map();
      let tooMany = false;
      for (const { data } of frames) {
        for (let i = 0; i < data.length && !tooMany; i += 4) {
          if (data[i + 3] < 128) continue;
          const key = ((data[i] & mask) << 16) | ((data[i + 1] & mask) << 8) | (data[i + 2] & mask);
          if (!colors.has(key)) {
            if (colors.size >= 255) tooMany = true;
            else colors.set(key, colors.size + 1);
          }
        }
        if (tooMany) break;
      }
      if (!tooMany) return { mask, colors };
    }
    throw new Error('颜色太多了');
  }

  function lzw(indices, minCodeSize) {
    const out = [];
    let cur = 0, bits = 0;
    const write = (code, size) => {
      cur |= code << bits;
      bits += size;
      while (bits >= 8) { out.push(cur & 0xff); cur >>>= 8; bits -= 8; }
    };
    const clear = 1 << minCodeSize, end = clear + 1;
    let dict = new Map(), next = end + 1, size = minCodeSize + 1;
    write(clear, size);
    let prefix = indices[0];
    for (let i = 1; i < indices.length; i++) {
      const k = indices[i];
      const key = prefix * 4096 + k;
      if (dict.has(key)) { prefix = dict.get(key); continue; }
      write(prefix, size);
      if (next < 4096) {
        dict.set(key, next++);
        if (next > (1 << size) && size < 12) size++;
      } else {
        write(clear, size);
        dict = new Map(); next = end + 1; size = minCodeSize + 1;
      }
      prefix = k;
    }
    write(prefix, size);
    write(end, size);
    if (bits > 0) out.push(cur & 0xff);
    return out;
  }

  // frames: [{ data: RGBA 数组, delay: 百分之一秒 }]
  function encodeGif(frames, width, height) {
    const { mask, colors } = buildPalette(frames);
    const bytes = [];
    const push = (...b) => bytes.push(...b);
    const word = n => push(n & 0xff, (n >> 8) & 0xff);
    push(0x47, 0x49, 0x46, 0x38, 0x39, 0x61); // GIF89a
    word(width); word(height);
    push(0xf7, 0, 0); // 全局调色板 256 色
    const table = new Array(256 * 3).fill(0);
    for (const [key, index] of colors) table.splice(index * 3, 3, key >> 16, (key >> 8) & 0xff, key & 0xff);
    push(...table);
    push(0x21, 0xff, 0x0b, ...[...'NETSCAPE2.0'].map(c => c.charCodeAt(0)), 0x03, 0x01, 0, 0, 0); // 一直循环
    for (const { data, delay } of frames) {
      push(0x21, 0xf9, 0x04, 0x09, delay & 0xff, (delay >> 8) & 0xff, 0x00, 0x00); // 播完清空，第 0 格透明
      push(0x2c); word(0); word(0); word(width); word(height); push(0);
      const indices = new Array(width * height);
      for (let p = 0, i = 0; p < indices.length; p++, i += 4) {
        indices[p] = data[i + 3] < 128 ? 0 : colors.get(((data[i] & mask) << 16) | ((data[i + 1] & mask) << 8) | (data[i + 2] & mask));
      }
      push(8);
      const packed = lzw(indices, 8);
      for (let i = 0; i < packed.length; i += 255) {
        const chunk = packed.slice(i, i + 255);
        push(chunk.length, ...chunk);
      }
      push(0);
    }
    push(0x3b);
    return Uint8Array.from(bytes);
  }

  const api = { encodeGif };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GifEncoder = api;
})(this);
