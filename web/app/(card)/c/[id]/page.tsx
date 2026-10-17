// A shared game: the card picture, the full round list, and a way into the game. Link
// previews (WhatsApp, X, iMessage) read the tags below and show the card picture.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import React from 'react';
import { getCard, SITE_URL, summarise } from '../../../../lib/cards';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const card = await getCard(id);
  if (!card) return { title: 'Clue Line' };
  const { won, outOf, verdict } = summarise(card);
  const title = `We scored ${won}/${outOf} on Clue Line: ${verdict}`;
  const description = 'A word-chain party game for 2 to 5 friends. Chain words, lead the guesser to the secret word, beat the clock.';
  const image = { url: `${SITE_URL}/c/${id}/image.png`, width: 1200, height: 630, alt: `Clue Line: ${won} of ${outOf} rounds won` };
  return {
    title,
    description,
    openGraph: { title, description, url: `${SITE_URL}/c/${id}`, siteName: 'Clue Line', type: 'website', images: [image] },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
  };
}

const INK = '#17122B';
const sticker: React.CSSProperties = {
  background: '#FFFFFF',
  border: `3px solid ${INK}`,
  borderRadius: 20,
  boxShadow: `5px 5px 0 ${INK}`,
};

export default async function CardPage({ params }: Props) {
  const { id } = await params;
  const card = await getCard(id);
  if (!card) notFound();
  const { won, outOf, verdict } = summarise(card);

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px 48px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <img
        src={`/c/${id}/image.png`}
        width={1200}
        height={630}
        alt={`Clue Line: ${won} of ${outOf} rounds won. ${verdict}.`}
        style={{ width: '100%', height: 'auto', ...sticker, borderRadius: 16 }}
      />

      <a
        href="/"
        style={{
          ...sticker,
          background: '#FF5B4A',
          color: INK,
          textAlign: 'center',
          textDecoration: 'none',
          fontWeight: 800,
          fontSize: 24,
          padding: '16px 20px',
        }}
      >
        Play Clue Line free
      </a>

      <section style={{ ...sticker, padding: '8px 20px 12px' }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: '12px 0 4px' }}>Every round</h1>
        <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {card.rounds.map((r) => (
            <li key={r.round} style={{ padding: '10px 0', borderTop: r.round > 1 ? '2px solid #EFE7C8' : undefined }}>
              <div style={{ fontWeight: 800, fontSize: 18 }}>
                {r.outcome === 'won' ? '✓' : '✕'} {r.targetWord}
                <span style={{ fontWeight: 500, fontSize: 14, color: '#4A4360' }}> · Round {r.round} · {r.category}</span>
              </div>
              <div style={{ fontSize: 16, color: '#4A4360' }}>
                {(r.chain ?? []).length > 0 ? (r.chain ?? []).join(' → ') : 'No words played'}
                {r.outcome === 'lost-timeout' ? ' (time ran out)' : r.outcome === 'lost-guess' ? ' (wrong guess)' : ''}
              </div>
            </li>
          ))}
        </ol>
      </section>

      <p style={{ textAlign: 'center', fontSize: 15, margin: 0 }}>
        Clue Line is a word-chain party game for 2 to 5 friends, each on their own phone.
      </p>
    </main>
  );
}
