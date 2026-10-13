# Yappa — App Brief (for marketing & growth planning)

_Last updated: 13 October 2026_

This document describes Yappa in full so it can be used as context for planning how to launch, position, integrate and promote the app.

---

## 1. One-line pitch

**Yappa is a fast, loud word-chain party game for exactly three friends, each on their own phone or browser: two players build a chain of linked words towards a secret word, and the third races a 30-second clock to guess it.**

Store title: **Yappa: Word Chain Party Game**
Store short description: _"Chain words with friends, lead the guesser to the secret word, beat the clock!"_

---

## 2. How the game works

- **Players:** exactly 3, each on their own device, all online. They can mix the Android app and the web version, and don't need to be on the same Wi-Fi or in the same room.
- **Roles each round:** 1 **Guesser** and 2 **Knowers**.
  - The Knowers see the secret target word. The Guesser doesn't.
  - The Knowers take turns adding **one word at a time** to a chain.
  - Each new word must form a **compound word or common two-word phrase** with the previous word.
  - Knowers can't type the target word itself or obvious variants of it.
  - The Guesser watches the chain grow live and can lock in a guess at any moment. The Guesser never adds words.
- **Example:** the target is "lighthouse". Knower A plays _sun_. Knower B plays _light_ (sunlight). Knower A plays _house_ (lighthouse). The Guesser guesses "lighthouse!" and wins the round.
- **Timer:** 30 seconds per turn. It resets each time play passes to the other Knower and never pauses. If time runs out, the round is lost.
- **Scoring:**
  - The team either wins or loses each round together. It's cooperative: the three players versus the secret word.
  - A game is **9 rounds**. Roles rotate so everyone is the Guesser 3 times.
  - The final score is rounds won out of 9.
- **Words:**
  - 251 hand-picked target words in 5 categories: Objects, Animals, Places, Food & Drink, Sports.
  - Each game has 3 Easy, 4 Medium and 2 Hard words, from at least 3 categories.
- **AI judging:**
  - An AI model (Anthropic Claude Haiku) decides whether a guess is correct. Close guesses, plurals, multi-word answers and close synonyms count, so the game rewards the idea rather than the spelling.
  - AI also judges whether two linked words really form a phrase.
  - The Guesser can flag a "cheeky" link on the round results screen. A flag doesn't change the score.
- **Typical game length:** about 9 rounds of under a minute each, plus transitions. Roughly 10 minutes.

The heart of the comedy is the time pressure. Knowers freeze, make strange-but-valid links, and the Guesser shouts wrong answers as the chain takes odd turns.

---

## 3. Features

| Feature | Details |
|---|---|
| Private games | The host creates a room, gets a 4-letter code and shares it with a share button. Friends join with the code, or on the web by tapping an invite link (yappa-three.vercel.app/join/CODE) that opens the Join form with the code filled in. |
| Web version | The full game runs in any browser at **yappa-three.vercel.app**, with no install. It can be added to the home screen like an app, works on phones, tablets and desktops (including landscape and with the keyboard open), and invite links show a bright preview card in WhatsApp and other chats. |
| Share results | At the end of a game, **Share results** creates a link (yappa-three.vercel.app/c/…) whose preview in WhatsApp, X or iMessage is a picture of the game: the score, a ✓/✕ per round and the best round's chain. The link opens a page with every round and a "Play Yappa free" button. Cards hold no player names. |
| Play online (quick match) | A player with no friends around taps **Play online** and is matched into an open public lobby, or opens a new one. A host can also open a private lobby to online players to fill empty seats. A full public lobby starts itself after a 5-second countdown. |
| Safety for online play | Server-side offensive-word filter on names and words. In-app **Report a player** from the lobby, round results and game end. A first-time online-play notice (be kind, don't share personal info). |
| No sign-up | Anonymous login. No email, password or account. Players just type a name. A Cloudflare Turnstile check, usually invisible, blocks bots from creating throwaway players. |
| Design | Bright "sticker party" style: bold outlines, yellow, coral and blue, plus a dark mode. Custom sound effects and music, with sound and music toggles. |
| How to Play | A built-in rules screen. |
| Disconnection handling | If a player drops, the game pauses (turn timer included) with a 30-second countdown before ending early. A device that reloads or comes back from the background picks the game and the timer up where they are. |
| Privacy | Games are deleted after 24 hours. Unused anonymous IDs are deleted after 30 days. Reports are deleted after 90 days. Shared result cards are deleted after a year. No ads, no tracking. The only numbers kept are daily totals with nothing that identifies anyone. |
| Credit | A small "Powered by Nanotek" credit on Home, How to Play and the support pages. |

---

## 4. Current status

- **Platforms:**
  - **Android** first: package `com.ptm2.yappa`, version 1.0.0. Fixes ship as over-the-air updates (Expo EAS) without a store release.
  - **Web**: live at https://yappa-three.vercel.app (Next.js on Vercel), from the same code as the app.
  - **iOS**: technically possible from the same code, but not yet built or tested. iPhone users can already play on the web.
- **Google Play:** preparing for a **closed test**. Google requires 12 or more testers for 14 days on new personal developer accounts before production release.
  - Store listing copy, Data Safety answers and the content rating plan are ready.
  - Expected rating: Everyone / PEGI 3 with a "Users Interact" notice.
  - Target audience: 13+.
- **App Store (iOS):** not started. It needs an Apple Developer account at $99/year, then TestFlight.
- **Ready-made assets:**
  - App icon, adaptive icon and splash screen.
  - 512×512 Play icon and a 1024×500 feature graphic.
  - Phone screenshots still need to be taken.
- **Website:** https://ptm-ngelale.github.io/yappa/ (support page), plus a privacy policy and a data-deletion page.
- **Done since the last brief:**
  - Bot protection (CAPTCHA) on sign-up.
  - The crash when leaving an online lobby with the back arrow.
  - The web version, with invite links, link previews and "Add to Home Screen".
  - Share results cards.
  - Privacy-safe daily game counts (see section 5).
  - The turn timer now runs on each device instead of the host writing it to the server every second, and survives reloads.
  - Fixed players wrongly showing as disconnected, especially in browsers.
  - Layout fixes for small phones, landscape, the on-screen keyboard and desktop.
- **Next:**
  - Real playtests: 5–10 games with groups of three.
  - Recruit the 12 Play Store testers and take the phone screenshots.
- **Name:** "Yappa" is the working name. It hasn't been trademark-checked yet; "Tellr" and "Threadly" were ruled out for trademark reasons.

---

## 5. Business model & costs

- **Monetization:** none yet. Free, with no ads and no in-app purchases. The store listing currently promises "No sign-up, no ads". Monetization is an open question.
- **Running costs:**
  - Backend: Supabase (database, realtime sync, anonymous auth). The free tier covers early usage.
  - AI judging: Anthropic API, a few small calls per round with the low-cost Haiku model. Cost grows with the number of games played. Safeguards: at most 300 AI calls per player per hour, 5,000 per hour across everyone, and a monthly spending cap in the Anthropic console.
  - Web hosting: Vercel.
  - Builds and over-the-air updates: Expo EAS, free tier.
- **Numbers:** daily totals kept with no personal data: games created (private and online), joins by invite link, typed code or Play online, games started, finished and ended early, rematches, and result cards shared.
- **Team:** solo developer and passion project. Contact: preciousngelale@gmail.com.

---

## 6. Audience & positioning

- **Who it's for:**
  - Groups of three friends: roommates, couples plus a friend, siblings, students, long-distance friends on a call.
  - Fans of word games: Wordle, Codenames, Contexto, Heads Up!, Wavelength, Psych!, Jackbox.
  - Age 13+.
- **Moments it fits:** pre-drinks or hangouts, boring commutes, group video calls, family gatherings, classrooms and clubs (as a vocabulary game).
- **What makes it different:**
  - **Asymmetric and cooperative:** two "knowers" leading one "guesser". Unlike Codenames, it needs only 3 people and no board.
  - **Phone-per-player and remote-friendly:** works whether you're in the same room or not.
  - **A compound-word chain mechanic** that produces funny, shareable chains, e.g. _sun → light → house_.
  - **Ultra-short rounds (30-second turns)** with AI judging, so there are no arguments about spelling.
  - **Online matchmaking** when you don't have two friends free.
  - **No account and no ads.**
- **Known constraints that affect marketing:**
  - **Exactly 3 players.** No 2-player or 4+ mode yet. Each game needs two friends invited, which is a big viral hook. The web version removes the install step: friends can tap an invite link and play in their browser.
  - **Needs internet.** No offline or pass-and-play mode.
  - **English only** for now.
  - **Online matchmaking needs enough simultaneous players.** At low install numbers, "Play online" may sit waiting. This is a cold-start problem to solve with launch timing, communities or scheduled play sessions.

---

## 7. Shareable / viral hooks already in the product

- The room share button sends "Join my Yappa game! Room code: XXXX". On the web it also sends an invite link that opens the game with the code filled in, and the link shows a bright preview card in chats.
- **Share results** turns every finished game into a link with a picture of the score and the best chain, plus a "Play Yappa free" button. Shares are counted (`cards_shared`).
- The 3-player requirement means every new player tends to bring 2 more.

---

## 8. Links

| | |
|---|---|
| Web version | https://yappa-three.vercel.app |
| Support site | https://ptm-ngelale.github.io/yappa/ |
| Privacy policy | https://ptm-ngelale.github.io/yappa/privacy.html |
| Delete my data | https://ptm-ngelale.github.io/yappa/delete.html |
| Source code | github.com/PTM-Ngelale/yappa (public) |
| Contact | preciousngelale@gmail.com |

---

## 9. Questions I want help with

1. **Launch plan:** how should I run the Google Play closed test (finding 12+ testers for 14 days) and then launch, with a near-zero budget?
2. **Cold start for Play online:** how do I make sure there are people to match with early on? For example scheduled "Yappa hours", Discord or community nights, or bots.
3. **Channels:** which are most promising for a 3-player party word game? Options include TikTok/Reels/Shorts (funny chain clips), Reddit (r/wordgames, r/boardgames, r/AndroidGaming, r/playmygame), Discord communities, campus clubs, ESL teachers, game streamers, Product Hunt and app review sites.
4. **Content ideas:** short-form video formats that show off the comedy of the chain and the timer.
5. **Store optimization (ASO):** title, keywords, screenshots and feature graphic messaging for Google Play.
6. **Product features that would help growth:** daily challenge, 2-player or 4+ modes, word packs, streaks, invite links that open the Android app directly, a share image people can post to WhatsApp Status, TikTok or Instagram stories, iOS version. (Done: web version, web invite links, share-results link cards.)
7. **Integrations:** Discord Activities, video-call integrations, classroom or education use. Should Yappa go on game portals such as CrazyGames, given their SDK and ads?
8. **Monetization later** without breaking "no ads": optional word packs, cosmetic themes, supporter tip jar, a premium tier.
9. **Name and branding:** is "Yappa" strong enough, and what should I check before committing (trademark, domain, social handles)?
10. **Metrics:** the app now keeps privacy-safe daily totals (games created, started, finished and ended early, joins by link, code or online, rematches, cards shared). What else is worth measuring without tracking anyone, and how should I read these numbers during playtests?
