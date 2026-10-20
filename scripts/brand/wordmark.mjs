// Yarnz splash wordmark and Play Store feature graphic, drawn like the app's stickers.
// Run from the repo root: node scripts/brand/wordmark.mjs
import fs from 'node:fs/promises';
import path from 'node:path';

const repo = process.argv[2] ?? process.cwd();
import { pathToFileURL } from 'node:url';
const { ImageResponse } = await import(pathToFileURL(path.join(repo, 'node_modules/next/dist/compiled/@vercel/og/index.node.js')).href);

const INK = '#17122B';
const YELLOW = '#FFE14D';
const WHITE = '#FFFFFF';
const CORAL = '#FF5B4A';
const BLUE = '#3B5BFF';

const fonts = [
  { name: 'Bricolage', data: await fs.readFile(path.join(repo, 'web/fonts/BricolageGrotesque_700Bold.ttf')), weight: 700, style: 'normal' },
  { name: 'Bricolage', data: await fs.readFile(path.join(repo, 'web/fonts/BricolageGrotesque_800ExtraBold.ttf')), weight: 800, style: 'normal' },
];

// A tiny element builder (no React needed).
const h = (type, style, ...children) => ({ type, props: { style: { display: 'flex', ...style }, children: children.length === 1 ? children[0] : children } });
const sticker = (bg, border, shadow, radius) => ({
  display: 'flex', background: bg, border: `${border}px solid ${INK}`, borderRadius: radius, boxShadow: `${shadow}px ${shadow}px 0 ${INK}`,
});

async function save(element, width, height, file) {
  const res = new ImageResponse(element, { width, height, fonts });
  await fs.writeFile(path.join(repo, file), Buffer.from(await res.arrayBuffer()));
  console.log('wrote', file, `${width}x${height}`);
}

// A sticker with its shadow as a solid layer behind it (a box-shadow leaves a faint seam).
const solidSticker = ({ text, fontSize, padding, border, shadow, radius, rotate, bg = WHITE, color = INK, letterSpacing = 0, align = 'flex-start' }) =>
  h('div', { position: 'relative', transform: `rotate(${rotate}deg)`, alignSelf: align },
    h('div', { position: 'absolute', top: shadow, left: shadow, right: -shadow, bottom: -shadow, background: INK, borderRadius: radius }),
    // The outline is a solid ink box with the card inset in it, so no white edge leaks past it.
    h('div', { background: INK, borderRadius: radius, padding: border },
      h('div', { background: bg, borderRadius: radius - border, padding, fontSize, fontWeight: 800, letterSpacing, color }, text),
    ),
  );

// Splash: the wordmark sticker alone on a transparent square (app.json paints the yellow).
await save(
  h('div', { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', fontFamily: 'Bricolage' },
    solidSticker({ text: 'Yarnz', fontSize: 172, padding: '18px 56px 34px', border: 16, shadow: 34, radius: 70, rotate: -4, letterSpacing: -6, align: 'center' }),
  ),
  1024, 1024, 'assets/splash-icon.png',
);

// Feature graphic (Play Store) and link preview (website): wordmark, tagline, and a few clues
// on their way to the answer. `k` scales the 1024x500 layout.
function promo(k) {
  const n = (v) => Math.round(v * k);
  const chip = (text, rotate, bg = WHITE, color = INK) =>
    solidSticker({ text, fontSize: n(30), padding: `${n(2)}px ${n(18)}px ${n(8)}px`, border: n(5), shadow: n(6), radius: n(16), rotate, bg, color, align: 'flex-end' });
  return h('div', { width: '100%', height: '100%', background: YELLOW, fontFamily: 'Bricolage', position: 'relative', color: INK },
    h('div', { position: 'absolute', top: n(-130), left: n(-110), width: n(340), height: n(340), borderRadius: n(170), background: CORAL, border: `${n(5)}px solid ${INK}` }),
    h('div', { position: 'absolute', bottom: n(-130), right: n(-90), width: n(260), height: n(260), borderRadius: n(130), background: BLUE, border: `${n(5)}px solid ${INK}` }),
    h('div', { position: 'absolute', left: n(84), top: n(78), flexDirection: 'column', gap: n(34) },
      solidSticker({ text: 'Yarnz', fontSize: n(112), padding: `${n(4)}px ${n(34)}px ${n(16)}px`, border: n(9), shadow: n(16), radius: n(38), rotate: -4, letterSpacing: n(-4) }),
      h('div', { flexDirection: 'column', fontSize: n(36), fontWeight: 800, lineHeight: 1.18 },
        h('div', {}, 'Describe it together.'),
        h('div', {}, 'Guess the secret.'),
        h('div', {}, 'Beat the clock.'),
      ),
    ),
    h('div', { position: 'absolute', right: n(96), top: n(48), flexDirection: 'column', alignItems: 'flex-end', gap: n(16) },
      chip('tall', 3),
      chip('rocks', -2),
      chip('beam', 2),
      chip('Lighthouse!', -3, BLUE, WHITE),
    ),
  );
}
await save(promo(1), 1024, 500, 'assets/store/feature-graphic.png');
await save(promo(1200 / 1024), 1200, 630, 'web/public/og.png');
