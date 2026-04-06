import { regularTileUrls, specialTileUrls } from '../tiles.js';

const HEX_SIZE = 52;
const PAD = HEX_SIZE;
const EXPORT_SCALE = 2; // 2x resolution for crisp PNG

// ── Geometry (mirrors HexMap.jsx) ─────────────────────────────────────────

function hexToPixel(q, r) {
  return {
    x: HEX_SIZE * 1.5 * q,
    y: HEX_SIZE * Math.sqrt(3) * (r + (q % 2 === 0 ? 0 : 0.5)),
  };
}

function hexCornerPoints(cx, cy) {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * 60 * i;
    return `${(cx + HEX_SIZE * Math.cos(a)).toFixed(2)},${(cy + HEX_SIZE * Math.sin(a)).toFixed(2)}`;
  }).join(' ');
}

// ── Image caching ─────────────────────────────────────────────────────────

const imgCache = {};

async function fetchDataUri(url) {
  if (imgCache[url]) return imgCache[url];
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return await new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => { imgCache[url] = reader.result; resolve(reader.result); };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function escapeXml(str) {
  return String(str).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c])
  );
}

// ── SVG generation ────────────────────────────────────────────────────────

function buildSVG(map, mode) {
  // mode: 'gm' | 'player'
  const svgW = HEX_SIZE * 1.5 * map.cols + HEX_SIZE * 0.5 + PAD * 2;
  const svgH = HEX_SIZE * Math.sqrt(3) * (map.rows + 0.5) + PAD * 2;

  const hexSVGs = Object.values(map.hexes).map(hex => {
    const { x, y } = hexToPixel(hex.q, hex.r);
    const cx = x + PAD;
    const cy = y + PAD;
    const points = hexCornerPoints(cx, cy);
    const clipId = `clip-${hex.q}-${hex.r}`;

    const imgW = HEX_SIZE * 2;
    const imgH = HEX_SIZE * Math.sqrt(3);
    const imgX = cx - HEX_SIZE;
    const imgY = cy - imgH / 2;

    const isRevealed = hex.revealed;
    const isSpecialRevealed = hex.specialRevealed;
    const showFog = mode === 'player' && !isRevealed;
    const showSpecial = hex.specialTile && (mode === 'gm' || isSpecialRevealed);

    const terrainUri = !showFog && hex.terrain ? (imgCache[regularTileUrls[hex.terrain]] || null) : null;
    const specialUri = showSpecial && hex.specialTile ? (imgCache[specialTileUrls[hex.specialTile]] || null) : null;

    let parts = `<defs><clipPath id="${clipId}"><polygon points="${points}"/></clipPath></defs>`;

    // Dark base
    parts += `<polygon points="${points}" fill="#2a2a2a"/>`;

    // Terrain image
    if (terrainUri) {
      parts += `<image href="${terrainUri}" x="${imgX.toFixed(2)}" y="${imgY.toFixed(2)}" width="${imgW.toFixed(2)}" height="${imgH.toFixed(2)}" clip-path="url(#${clipId})" preserveAspectRatio="xMidYMid slice"/>`;
    }

    // Special tile overlay
    if (specialUri) {
      const opacity = (mode === 'gm' && !isSpecialRevealed) ? 0.55 : 0.72;
      parts += `<image href="${specialUri}" x="${imgX.toFixed(2)}" y="${imgY.toFixed(2)}" width="${imgW.toFixed(2)}" height="${imgH.toFixed(2)}" clip-path="url(#${clipId})" preserveAspectRatio="xMidYMid slice" opacity="${opacity}"/>`;
    }

    // Fog (player view of unrevealed hex)
    if (showFog) {
      parts += `<polygon points="${points}" fill="#0a0a18"/>`;
      parts += `<polygon points="${points}" fill="#111133" opacity="0.6"/>`;
    }

    // GM dimming on unrevealed hexes
    if (mode === 'gm' && !isRevealed) {
      parts += `<polygon points="${points}" fill="#000" opacity="0.4"/>`;
    }

    // GM-only: special pending indicator
    if (mode === 'gm' && hex.specialTile && !isSpecialRevealed) {
      const fs = HEX_SIZE * 0.26;
      parts += `<text x="${cx.toFixed(2)}" y="${(cy - HEX_SIZE * 0.32).toFixed(2)}" text-anchor="middle" dominant-baseline="middle" font-size="${fs}" fill="#aaa">✦</text>`;
    }

    // Special revealed star
    if (isSpecialRevealed && hex.specialTile) {
      const fs = HEX_SIZE * 0.26;
      parts += `<text x="${cx.toFixed(2)}" y="${(cy - HEX_SIZE * 0.32).toFixed(2)}" text-anchor="middle" dominant-baseline="middle" font-size="${fs}" fill="#ffd700" stroke="#000" stroke-width="0.5" paint-order="stroke">★</text>`;
    }

    // Hex label
    if (!showFog && hex.label) {
      const fs = Math.max(HEX_SIZE * 0.17, 9);
      const labelY = hex.specialTile ? cy + HEX_SIZE * 0.18 : cy + HEX_SIZE * 0.05;
      parts += `<text x="${cx.toFixed(2)}" y="${labelY.toFixed(2)}" text-anchor="middle" dominant-baseline="middle" font-size="${fs}" fill="#fff" stroke="#000" stroke-width="0.6" paint-order="stroke" font-family="Georgia, serif" font-weight="600">${escapeXml(hex.label)}</text>`;
    }

    // Hex border
    parts += `<polygon points="${points}" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="1.5"/>`;

    return `<g>${parts}</g>`;
  });

  const title = escapeXml(`${map.name} — ${mode === 'gm' ? 'GM Map' : 'Player Map'}`);

  return {
    svgStr: [
      `<svg xmlns="http://www.w3.org/2000/svg" `,
      `width="${svgW * EXPORT_SCALE}" height="${svgH * EXPORT_SCALE}" `,
      `viewBox="0 0 ${svgW} ${svgH}" `,
      `style="background:#1a1a1a">`,
      `<title>${title}</title>`,
      hexSVGs.join(''),
      `</svg>`,
    ].join(''),
    svgW,
    svgH,
  };
}

// ── Main export function ──────────────────────────────────────────────────

export async function exportMapAsPng(map, mode) {
  // Collect all image URLs needed for this export
  const urlsNeeded = new Set();
  for (const hex of Object.values(map.hexes)) {
    const showFog = mode === 'player' && !hex.revealed;
    if (!showFog && hex.terrain && regularTileUrls[hex.terrain]) {
      urlsNeeded.add(regularTileUrls[hex.terrain]);
    }
    const showSpecial = hex.specialTile && (mode === 'gm' || hex.specialRevealed);
    if (showSpecial && specialTileUrls[hex.specialTile]) {
      urlsNeeded.add(specialTileUrls[hex.specialTile]);
    }
  }

  // Fetch all images as data URIs in parallel (safe for canvas export)
  await Promise.all([...urlsNeeded].map(fetchDataUri));

  const { svgStr, svgW, svgH } = buildSVG(map, mode);

  // Draw SVG to canvas
  const canvas = document.createElement('canvas');
  canvas.width = svgW * EXPORT_SCALE;
  canvas.height = svgH * EXPORT_SCALE;
  const ctx = canvas.getContext('2d');

  const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => { ctx.drawImage(img, 0, 0); resolve(); };
    img.onerror = reject;
    img.src = url;
  });
  URL.revokeObjectURL(url);

  // Trigger download
  return new Promise(resolve => {
    canvas.toBlob(pngBlob => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(pngBlob);
      a.download = `${map.name.replace(/\s+/g, '-')}-${mode}.png`;
      a.click();
      resolve();
    }, 'image/png');
  });
}
