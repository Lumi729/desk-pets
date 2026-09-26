// Reads a GIF's size and how long one loop lasts, so the pet knows when an action has finished.
function gifInfo(bytes) {
  if (bytes.length < 13 || bytes[0] !== 0x47 || bytes[1] !== 0x49 || bytes[2] !== 0x46) throw new Error('not a GIF');
  const width = bytes[6] | (bytes[7] << 8);
  const height = bytes[8] | (bytes[9] << 8);
  let p = 13;
  if (bytes[10] & 0x80) p += 3 * (1 << ((bytes[10] & 7) + 1));
  const skipSubBlocks = () => { while (p < bytes.length) { const n = bytes[p++]; if (!n) break; p += n; } };
  let frames = 0, duration = 0;
  while (p < bytes.length) {
    const block = bytes[p++];
    if (block === 0x3b) break;
    if (block === 0x21) {
      const label = bytes[p++];
      if (label === 0xf9 && bytes[p] === 4) {
        const delay = bytes[p + 2] | (bytes[p + 3] << 8);
        duration += (delay <= 1 ? 10 : delay) * 10; // browsers play 0/1 as 100ms
      }
      skipSubBlocks();
    } else if (block === 0x2c) {
      frames++;
      const flags = bytes[p + 8];
      p += 9;
      if (flags & 0x80) p += 3 * (1 << ((flags & 7) + 1));
      p++; // LZW minimum code size
      skipSubBlocks();
    } else break;
  }
  return { width, height, frames, duration: duration || frames * 100 };
}

module.exports = { gifInfo };
