// The share card's picture: 1200x630, the size link previews (WhatsApp, X, iMessage) expect.
// Drawn in the app's "Sticker Party" style: thick outlines, hard shadows, yellow ground.
import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { getCard, summarise } from '../../../../../lib/cards';

const INK = '#17122B';
const YELLOW = '#FFE14D';
const BLUE = '#3B5BFF';
const CORAL = '#FF5B4A';
const WHITE = '#FFFFFF';
/** Longest chain shown in full; longer ones keep their last words. */
const MAX_CHAIN = 6;

const fontsDir = path.join(process.cwd(), 'fonts');
const fonts = Promise.all([
  readFile(path.join(fontsDir, 'BricolageGrotesque_700Bold.ttf')),
  readFile(path.join(fontsDir, 'BricolageGrotesque_800ExtraBold.ttf')),
]);

/** ✓ / ✕ drawn as shapes: the card font has no glyphs for them. */
function Mark({ won, color }: { won: boolean; color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
      {won ? <path d="M4 12.5l5 5L20 6.5" /> : <path d="M6 6l12 12M18 6L6 18" />}
    </svg>
  );
}

function sticker(bg: string, shadow = 10) {
  return {
    display: 'flex',
    background: bg,
    border: `5px solid ${INK}`,
    borderRadius: 28,
    boxShadow: `${shadow}px ${shadow}px 0 ${INK}`,
  } as const;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const card = await getCard(id);
  if (!card) return new Response('Not found', { status: 404 });
  const { won, outOf, finished, played, verdict, best } = summarise(card);
  const [bold, black] = await fonts;

  const chain = best?.chain ?? [];
  const shown = chain.length > MAX_CHAIN ? chain.slice(-MAX_CHAIN) : chain;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          background: YELLOW,
          padding: 56,
          gap: 48,
          fontFamily: 'Bricolage',
          color: INK,
          position: 'relative',
        }}
      >
        {/* Background shapes, as on the app's Home screen. */}
        <div style={{ position: 'absolute', top: -120, right: -90, width: 320, height: 320, borderRadius: 160, background: CORAL, border: `5px solid ${INK}` }} />
        <div style={{ position: 'absolute', bottom: -100, left: -60, width: 170, height: 170, borderRadius: 36, background: BLUE, border: `5px solid ${INK}`, transform: 'rotate(-14deg)' }} />

        {/* Left: wordmark, score, verdict. */}
        <div style={{ display: 'flex', flexDirection: 'column', width: 420, gap: 26 }}>
          <div style={{ ...sticker(WHITE, 8), alignSelf: 'flex-start', padding: '0 26px 6px', transform: 'rotate(-4deg)', fontSize: 64, fontWeight: 800, letterSpacing: -2 }}>
            Clue Line
          </div>
          <div style={{ ...sticker(WHITE), flexDirection: 'column', alignItems: 'center', padding: '18px 24px 22px', marginTop: 10 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 150, fontWeight: 800, letterSpacing: -6, lineHeight: 1 }}>{won}</span>
              <span style={{ fontSize: 56, fontWeight: 800 }}>/ {outOf}</span>
            </div>
            <div style={{ fontSize: 40, fontWeight: 800, marginTop: 6 }}>{verdict}</div>
            {!finished && <div style={{ fontSize: 26, marginTop: 4 }}>{`after ${played} round${played === 1 ? '' : 's'}`}</div>}
          </div>
          {/* One block per round: blue for a win, white with a cross for a loss. */}
          <div style={{ display: 'flex', gap: 8 }}>
            {card.rounds.map((r) => (
              <div
                key={r.round}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  border: `4px solid ${INK}`,
                  background: r.outcome === 'won' ? BLUE : WHITE,
                }}
              >
                <Mark won={r.outcome === 'won'} color={r.outcome === 'won' ? WHITE : INK} />
              </div>
            ))}
          </div>
        </div>

        {/* Right: the slickest chain, ending on the word they guessed. */}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', gap: 22 }}>
          <div style={{ ...sticker(WHITE), flexDirection: 'column', padding: '26px 30px 30px', gap: 18 }}>
            <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: 3 }}>{best ? 'BEST ROUND' : 'NO WINS THIS TIME'}</div>
            {best ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
                {chain.length > shown.length && <span style={{ fontSize: 34, fontWeight: 700 }}>…</span>}
                {shown.map((w, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {(i > 0 || chain.length > shown.length) && <span style={{ fontSize: 34, fontWeight: 700 }}>→</span>}
                    <div style={{ display: 'flex', border: `4px solid ${INK}`, borderRadius: 14, padding: '2px 16px 6px', fontSize: 38, fontWeight: 700 }}>{w}</div>
                  </div>
                ))}
                <span style={{ fontSize: 34, fontWeight: 700 }}>→</span>
                <div style={{ ...sticker(YELLOW, 5), borderRadius: 14, padding: '2px 16px 6px', fontSize: 40, fontWeight: 800 }}>
                  {best.targetWord}
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 40, fontWeight: 700, lineHeight: 1.2 }}>Some words just won’t chain. Can you do better?</div>
            )}
            {best && (
              <div style={{ fontSize: 26, fontWeight: 700 }}>
                {`Guessed in ${chain.length} word${chain.length === 1 ? '' : 's'}`}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <div style={{ ...sticker(CORAL, 6), borderRadius: 18, padding: '6px 22px 10px', fontSize: 30, fontWeight: 800 }}>Play free →</div>
            <div style={{ fontSize: 26, fontWeight: 700 }}>A word-chain game for 3</div>
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [
        { name: 'Bricolage', data: bold, weight: 700, style: 'normal' },
        { name: 'Bricolage', data: black, weight: 800, style: 'normal' },
      ],
      headers: { 'Cache-Control': 'public, max-age=86400, s-maxage=31536000, immutable' },
    }
  );
}
