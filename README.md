# Chanki

**Four-sided Chinese flashcards with spaced repetition — character, pinyin, meaning and tone on every card. Offline-first installable PWA, no accounts required.**

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## Highlights

- 🎲 **Cube cards** — every card has four sides (character · pinyin · meaning · tone). Tap, swipe or scroll to rotate; visit all four sides to grade. Progressive reveal keeps recall honest.
- 🧠 **Real spaced repetition** — FSRS scheduler (`ts-fsrs`) with an Anki-style queue: Learning / Due / New chips, grade buttons, per-device schedules.
- 📴 **Works offline** — installable PWA. Cards come from Firestore (cached by Firestore's own IndexedDB persistence), progress lives in Dexie and syncs in the background when you're back online.
- 🔐 **No accounts** — identity is a hardware-derived device fingerprint that survives storage wipes, private-mode flips and reinstalls. Reviews never get lost to a cleared cache.
- 🔊 **Neural audio** — every card and example sentence ships with an edge-tts clip (Microsoft `zh-CN-XiaoxiaoNeural`) played through a WhatsApp-style voice-clip visualizer. Browser TTS (preferring Chrome's network voices) remains as an offline fallback.
- 🎤 **Tone trainer** — sing a tone and watch the live pitch contour against the target curve (`Pitchy` + Web Audio).
- ✍️ **Writing practice** — stroke-order practice with `hanzi-writer` before you're allowed to grade the card.
- 🛠️ **Admin console** — tiered search over a 17k-entry dictionary index, one-pick card creation with auto-enrichment (chars breakdown, examples, frequency), and deck seeding to Firestore.

## Quick start

Prerequisites: **Node 20+**, a Firebase project (web app config), and optionally [`edge-tts`](https://pypi.org/project/edge-tts/) for audio generation.

```bash
git clone <your-fork-url> chanki
cd chanki
npm install

cp .env.example .env   # fill in your VITE_FIREBASE_* web config
npm run dev            # http://localhost:5173
```

Push the bundled starter deck to Firestore (first run only):

```bash
npm run db:seed
```

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server with HMR |
| `npm run build` | Type-check + production build (PWA service worker included) |
| `npm run preview` | Serve `dist/` locally |
| `npm run lint` | oxlint |
| `npm run test` | Vitest watch · `test:run` once · `test:coverage` with coverage |
| `npm run data:build` | Rebuild the deck JSON from open sources (`--refresh` re-downloads) |
| `npm run data:audio` | Synthesize missing audio: deck files **and** Firestore cards added via admin |
| `npm run db:seed` | Seed/refresh the starter deck in Firestore |
| `npm run pwa:audit` | Lighthouse PWA audit against a local build |
| `npm run tone:bench` | Pitch-detection benchmark |

## Deck & audio pipeline

The bundled **HSK 1 starter deck** (150 words, 298 example sentences) is rebuilt
from open data — CC-CEDICT, wordfreq, hanzi metadata and more; attribution and
licenses live in [`public/assets/deck/SOURCES.md`](public/assets/deck/SOURCES.md).

Audio is generated **at build time**, not by the browser:

```bash
pip3 install --user edge-tts   # once
npm run data:audio             # deck JSON + Firestore backfill, then:
firebase deploy --only hosting # ship new mp3s + service worker
```

- Cards are read from **Firestore only** — after editing the deck JSON, re-run
  `npm run db:seed` so devices pick up changes.
- Voice is swappable: `CHANKI_TTS_VOICE=zh-TW-HsiaoChenNeural npm run data:audio`.
- Word clips are precached for offline review; example clips load on demand and
  are cached at runtime (`starter-deck-audio`).

## Architecture

```
Firestore (cards, decks)  ──►  remoteCards  ──►  UI
        ▲                                   │
        │ background sync                   ▼
devices/{fingerprint}/progress ◄──── Dexie (progress + review logs)
```

- **Cards never live in Dexie** — one source of truth (Firestore), offline
  reads via Firestore's persistent cache. Dexie holds only per-device state.
- **Sync is last-write-wins** by `updatedAt`, batched through `writeBatch`.
- **Identity**: `deviceId = fingerprint(stable hardware signals)` — see
  `src/data/device-id.ts` and `src/data/fingerprint.ts`.

```
src/
├── components/     # AudioClip, TabBar, install/update prompts, Review/, ui/
├── data/           # zod schema, Dexie, Firestore, sync, fingerprint, API clients
├── hooks/          # tone capture, misc hooks
├── pages/          # Home, ReviewSession, Stats, ToneTrainer, Resources, Admin
├── scheduler/      # FSRS wrapper + due-queue building
├── pwa/            # service worker registration
└── utils/          # audio playback, stats, helpers
scripts/
└── data/           # deck ETL: build-deck, audio synthesis, sources
```

## Deploy

```bash
firebase deploy --only hosting            # app + assets + service worker
firebase deploy --only firestore:rules,database
```

Admin access is gated client-side: tap the **Chanki** logo 7 times, then enter
the code (dev fallback `5173`, production value from the Remote Config
parameter `admin_code`). It is a UX gate, not a security boundary — lock the
real security down in Firestore rules.

## Contributing

Issues and PRs welcome. Run `npm run lint`, `npm run test:run` and
`npm run build` before pushing — all three must be green.

## License

[MIT](LICENSE) — deck data sources are separately attributed in
[`SOURCES.md`](public/assets/deck/SOURCES.md).
