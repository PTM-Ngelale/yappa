# Google Play Console — answers and listing copy

Everything Play Console asks for, filled in from what the app actually does.
Package: `com.ptm2.yappa` · Upload the newest production AAB from EAS (`eas build -p android --profile production`).

## Links

| Field | Value |
|---|---|
| Privacy policy | https://ptm-ngelale.github.io/yappa/privacy.html |
| Delete data URL | https://ptm-ngelale.github.io/yappa/delete.html |
| Website | https://ptm-ngelale.github.io/yappa/ |
| Contact email | preciousngelale@gmail.com |

## Store listing

**App name** (max 30): `Yappa: Word Chain Party Game`

**Short description** (max 80):
`Chain words with friends, lead the guesser to the secret word, beat the clock!`

**Full description** (max 4000):

```
Yappa is a fast, loud word-chain party game for three friends, each on their own phone.

HOW IT WORKS
Two players see the secret word. Taking turns, they add one word at a time to a chain that leads towards it — every word has to make a phrase with the one before (sea → shell → fish…). The third player watches the chain grow and races the clock to guess the secret.

Guess it and you all win the round. Run out of time and the secret wins. Everyone takes a turn as the guesser across nine rounds — how many can your team get?

WHY YOU'LL LOVE IT
• Quick rounds — 30 seconds a turn keeps everyone on their toes
• Play together in the same room or apart — anyone with an internet connection can join with a 4-letter code
• Smart judging — close guesses and plurals count, so it's about the idea, not the spelling
• Flag a cheeky link on the round results
• Bright, bold design with a dark mode
• No sign-up, no ads

You need three players, each with the app and an internet connection.
```

**App category:** Game → Word
**Tags:** Word, Party, Multiplayer, Casual, Trivia (pick the closest Play offers)

**Graphics**
- App icon (512×512): `assets/store/play-icon-512.png`
- Feature graphic (1024×500): `assets/store/feature-graphic.png`
- Phone screenshots (2–8, at least 1080px on the short side): take on your phone — suggested: Home, Lobby with three players, Round Intro, Knower's turn, Guesser, Round Result (win), Game End. Use light mode for most and include one dark-mode shot.

## App content (Policy → App content)

**Privacy policy:** the URL above.

**Ads:** No, the app doesn't contain ads.

**App access:** All functionality is available without special access. (No login: the app signs in anonymously.) Note for reviewers if asked: "A game needs three players. Open the app on three devices, create a game on one and join with the 4-letter code on the other two."

**Content rating (IARC questionnaire):**
- Category: Game (word / puzzle / party).
- Violence, fear, sexuality, language, controlled substances, gambling: No to all.
- Does the app let users interact or exchange content? **Yes** — players see each other's chosen names and the words they type during a game. (No chat, no images, no voice.)
- Does it share the user's location? No. Digital purchases? No.
- Expected result: Everyone / PEGI 3 with the "Users Interact" notice.

**Target audience and content:** Ages **13 and over** (13–15, 16–17, 18+). Don't select under-13 groups — that brings in the Families policy and its stricter requirements. Appeals to children: No.

**News app:** No. **Health apps:** No. **Financial features:** None. **Government app:** No.

**AI-generated content:** Yappa doesn't generate content for users. AI (Anthropic Claude) only judges whether a guess matches the secret and whether two words make a phrase — answer accordingly if asked.

## Data safety

**Does your app collect or share any of the required user data types?** Yes.
**Is all user data encrypted in transit?** Yes.
**Do you provide a way for users to request that their data is deleted?** Yes (delete data URL above).
**Account creation:** The app doesn't let users create an account (it uses an anonymous ID; no username, email or password).

Service providers (Supabase, Anthropic, Expo) process data on our behalf, so under Play's definitions this is **collected, not shared**.

| Data type | Collected | Shared | Processed ephemerally | Required / optional | Purposes |
|---|---|---|---|---|---|
| Personal info → **Name** (player name) | Yes | No | No | Required | App functionality |
| App activity → **Other user-generated content** (game words, guesses) | Yes | No | No | Required | App functionality |
| Device or other IDs (anonymous player ID) | Yes | No | No | Required | App functionality, Fraud prevention / security |

Not collected: location, contacts, photos/videos, audio, files, calendar, messages, health, financial info, email, phone, web browsing, crash logs, diagnostics, installed apps.

## Before you press "publish"

1. Run `supabase/migrations/008_data_retention.sql` in the Supabase SQL editor. The privacy policy promises 24-hour game deletion and 30-day ID deletion, and this is what does it.
2. Rotate the Anthropic API key, since the old one was pasted in chat.
3. Personal developer accounts: closed test with at least 12 testers for 14 days before applying for production.
4. Upload the newest production AAB to closed testing. Play App Signing: accept.
