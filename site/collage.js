// One picture of a whole meal for sharing: a heading band, the main dish large on the left,
// the sides stacked on the right, each labelled. Dishes without a photo get their emoji on a tile.

const W = 1200;
const H = 900;
const HEAD = 120;
const GAP = 6;
const MAX_SIDES = 3;

function loadImage(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// Like CSS object-fit: cover.
function drawCover(ctx, img, x, y, w, h) {
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const sw = w / scale;
  const sh = h / scale;
  ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, x, y, w, h);
}

function drawEmojiTile(ctx, emoji, color, x, y, w, h) {
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, color);
  g.addColorStop(1, '#fff6ea');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  ctx.font = `${Math.round(Math.min(w, h) * 0.42)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, x + w / 2, y + h / 2 - Math.min(w, h) * 0.06);
}

// Shrinks the text to fit, then cuts it with an ellipsis if it still doesn't.
function fitText(ctx, text, maxWidth, size, minSize, family, weight = 700) {
  let s = size;
  ctx.font = `${weight} ${s}px ${family}`;
  while (s > minSize && ctx.measureText(text).width > maxWidth) {
    s -= 2;
    ctx.font = `${weight} ${s}px ${family}`;
  }
  let out = text;
  while (out.length > 1 && ctx.measureText(out).width > maxWidth) out = out.slice(0, -2) + '…';
  return out;
}

function drawLabel(ctx, text, x, y, w, h, size, family) {
  const band = size * 2.4;
  const g = ctx.createLinearGradient(0, y + h - band, 0, y + h);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,.72)');
  ctx.fillStyle = g;
  ctx.fillRect(x, y + h - band, w, band);
  const pad = Math.round(size * 0.6);
  const line = fitText(ctx, text, w - pad * 2, size, Math.round(size * 0.6), family);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(line, x + pad, y + h - pad);
}

/**
 * dishes: [{ name, src, emoji }], main dish first. Resolves to a JPEG Blob.
 */
export async function mealCollage({ heading, dishes, color, family = 'sans-serif' }) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  try { await document.fonts?.ready; } catch { /* fonts are optional */ }

  ctx.fillStyle = '#fffaf3';
  ctx.fillRect(0, 0, W, H);

  // Heading band in the meal's colour.
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, W, HEAD);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(fitText(ctx, heading, W - 80, 54, 30, family, 800), 40, HEAD / 2 + 2);

  const [main, ...rest] = dishes;
  const sides = rest.slice(0, MAX_SIDES);
  const hidden = rest.length - sides.length;
  const images = await Promise.all([main, ...sides].map((d) => loadImage(d.src)));

  const top = HEAD + GAP;
  const areaH = H - top;
  const mainW = sides.length ? Math.round(W * 0.64) : W;
  const tile = (d, img, x, y, w, h, size) => {
    if (img) drawCover(ctx, img, x, y, w, h);
    else drawEmojiTile(ctx, d.emoji || '🍽️', color, x, y, w, h);
    drawLabel(ctx, d.name, x, y, w, h, size, family);
  };

  tile(main, images[0], 0, top, mainW, areaH, 44);
  if (sides.length) {
    const x = mainW + GAP;
    const w = W - x;
    const h = (areaH - GAP * (sides.length - 1)) / sides.length;
    sides.forEach((d, i) => {
      const y = top + i * (h + GAP);
      tile(d, images[i + 1], x, y, w, h, sides.length > 2 ? 28 : 32);
      if (hidden && i === sides.length - 1) {
        ctx.fillStyle = 'rgba(0,0,0,.55)';
        ctx.beginPath();
        ctx.arc(x + w - 48, y + 48, 34, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = `800 30px ${family}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`+${hidden}`, x + w - 48, y + 50);
      }
    });
  }

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86));
}
