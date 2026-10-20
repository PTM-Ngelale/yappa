// Yarnz icon: the sticker speech bubble with a line of three dots (the clues, one word at
// a time), drawn as SVG and rendered to every size the app, store and website use.
// Run from the repo root: node scripts/brand/icons.mjs
import path from 'node:path';
import { createRequire } from 'node:module';

const repo = process.argv[2] ?? process.cwd();
const require = createRequire(path.join(repo, 'package.json'));
const sharp = require('sharp');

const INK = '#17122B';
const YELLOW = '#FFE14D';
const WHITE = '#FFFFFF';
const CORAL = '#FF5B4A';
const BLUE = '#3B5BFF';

// The bubble on a 1024 canvas, centred, tilted like the app's stickers.
function bubble({ background }) {
  const shape = `M 330 282 H 694 Q 772 282 772 360 V 600 Q 772 678 694 678 H 470 L 360 760 L 384 678 H 330 Q 252 678 252 600 V 360 Q 252 282 330 282 Z`;
  const dots = [
    { x: 390, c: INK },
    { x: 512, c: INK },
    { x: 634, c: BLUE },
  ];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  ${background ? `<rect width="1024" height="1024" fill="${background}"/>` : ''}
  <g transform="rotate(-6 512 520)">
    <path d="${shape}" transform="translate(26 26)" fill="${INK}" stroke="${INK}" stroke-width="24" stroke-linejoin="round"/>
    <path d="${shape}" fill="${WHITE}" stroke="${INK}" stroke-width="24" stroke-linejoin="round"/>
    ${dots.map((d) => `<circle cx="${d.x}" cy="480" r="46" fill="${d.c}"/>`).join('\n    ')}
    <circle cx="742" cy="300" r="46" fill="${CORAL}" stroke="${INK}" stroke-width="20"/>
  </g>
</svg>`;
}

async function render(svg, size, file, { scale = 1 } = {}) {
  let img = sharp(Buffer.from(svg), { density: 72 * (size / 1024) * 4 }).resize(size, size);
  if (scale !== 1) {
    // Shrink the artwork inside a transparent square (Android's adaptive-icon safe zone).
    const inner = Math.round(size * scale);
    const art = await sharp(Buffer.from(svg), { density: 288 }).resize(inner, inner).png().toBuffer();
    const pad = Math.round((size - inner) / 2);
    img = sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: art, left: pad, top: pad }]);
  }
  await img.png().toFile(path.join(repo, file));
  console.log('wrote', file, `${size}x${size}`);
}

const full = bubble({ background: YELLOW });
const bare = bubble({ background: null });
await render(full, 1024, 'assets/icon.png');
await render(bare, 1024, 'assets/adaptive-icon.png', { scale: 0.72 });
await render(full, 48, 'assets/favicon.png');
await render(full, 512, 'assets/store/play-icon-512.png');
await render(full, 192, 'web/public/icons/icon-192.png');
await render(full, 512, 'web/public/icons/icon-512.png');
