// 把像素风图标用「最近邻」缩小，这样托盘里的小图标每一格都清清楚楚，不会糊。
function nearestResize(bitmap, width, height, size) {
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    const sy = Math.min(height - 1, Math.floor((y + 0.5) * height / size));
    for (let x = 0; x < size; x++) {
      const sx = Math.min(width - 1, Math.floor((x + 0.5) * width / size));
      bitmap.copy(out, (y * size + x) * 4, (sy * width + sx) * 4, (sy * width + sx) * 4 + 4);
    }
  }
  return out;
}

// Windows 托盘在 100% / 125% / 150% / 175% / 200% 缩放下分别用 16 / 20 / 24 / 28 / 32 像素的图标
const TRAY_SIZES = [16, 20, 24, 28, 32];

function pixelTrayImage(nativeImage, pngPath) {
  const source = nativeImage.createFromPath(pngPath);
  if (source.isEmpty()) return source;
  const { width, height } = source.getSize();
  const bitmap = source.toBitmap();
  const image = nativeImage.createEmpty();
  for (const size of TRAY_SIZES) {
    const small = nativeImage.createFromBitmap(nearestResize(bitmap, width, height, size), { width: size, height: size });
    image.addRepresentation({ scaleFactor: size / 16, buffer: small.toPNG() });
  }
  return image;
}

module.exports = { nearestResize, pixelTrayImage, TRAY_SIZES };
