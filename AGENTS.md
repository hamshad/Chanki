# Chanki — agent working agreement

## What this is

Four-sided Chinese flashcard PWA (character · pinyin · meaning · tone). React 19 + TS + Vite + Dexie + Firebase (Firestore + RTDB + Remote Config). No accounts — identity is a hardware fingerprint.

Live: **https://chanki-hanzi.vercel.app** (Vercel hosts the app; Firebase holds data).

## HARD RULE — non-regression

**Everything currently works.** As of 2026-10-03 the full stack is verified working end-to-end:

- review session, cube rotation (tap / swipe / scroll / map / keyboard)
- FSRS scheduling, Anki-style queue chips, grading, stats
- offline-first PWA (install, service worker, precache, runtime caches)
- device-fingerprint identity + background Firestore sync
- neural card audio + voice-clip visualizer
- tone trainer, writing practice, admin console
- mobile tab bar shell, card Details sheet

**From now on, changes are EDGE-CASES ONLY. Do not regress, refactor, or "improve" any working behaviour unless the user deliberately asks for it by name.** Treat every green path above as a locked contract.

Required gates before calling any change done:

```bash
npm run lint      # must stay at or below 12 warnings
npm run test:run  # 198 tests must stay green
npm run build     # tsc -b clean + vite build
```

Add tests for new behaviour; never delete or weaken an existing test to make something pass.

## Load-bearing invariants — breaking any of these reintroduces a fixed bug

1. **Cube rotation lives on `.cube-face`, not `.cube`.** A cube rotated to ±90°/±270° projects a zero-width quad; Chrome then drops the whole subtree from hit-testing and face buttons become untappable. Face angle = `rotateY(${90 * (i - sideIndex)}deg) translateZ(var(--cube-half))`. Never move the transform back onto `.cube`.
2. **Vercel `vercel.json` headers use path-to-regexp**, not globs. `/**/*.html` fails config validation. Later rules win, so the catch-all `no-cache` must stay FIRST and hashed-asset `immutable` after.
3. **Cards come from Firestore only.** Dexie never stores cards (db v2). Editing `hsk1-starter.json` requires `npm run db:seed` before devices see it.
4. **PWA precache policy**: word clips (`assets/deck/audio/<hanzi>.mp3`) precached; `ex-*.mp3` and `assets/deck/index/**` excluded from precache (admin dict is ~2.3MB) and served by runtime caches. Do NOT put mp3/json globs in `includeAssets` — that bypasses workbox `globIgnores` and fattened the precache from 349 to 960 entries.
5. **Admin gate is a UX gate, not security.** `admin_code` from Remote Config, dev fallback `5173`. Firestore rules are the real boundary.
6. `isControl()` guard in `CardView` handlers (stage click / keydown / pointerdown) must keep checks before any rotate/swipe — controls inside the card never rotate it.

## Audio architecture

Two paths, both intentional:

1. **Neural clips** — `npm run data:audio` synthesizes mp3s via `edge-tts` (`zh-CN-XiaoxiaoNeural`, override `CHANKI_TTS_VOICE`). Phase 1 = deck JSON, phase 2 = Firestore backfill for admin-added cards. Files land in `public/assets/deck/audio/`, must be committed and pushed for Vercel to serve them.
2. **Runtime TTS fallback** (`src/utils/audio.ts`) — only when no clip exists; prefers Chrome network voices over local ones.

Admin card workflow: add card → `npm run data:audio` → `git push` (Vercel redeploys).

## Data model

- Firestore `cards` / `decks` = source of truth. `devices/{fingerprint}/progress` + `reviewLogs` = per-device state, last-write-wins by `updatedAt`.
- Dictionary search history: `localStorage` key `chanki.dict.history` — device-local, never synced (deliberate).
- zod schemas in `src/data/schema.ts` — validate before any write.
- Starter deck: 150 HSK1 cards, 298 examples, built by `scripts/data/build-deck.mjs` from OSS sources (attribution in `public/assets/deck/SOURCES.md`).

## Commands

```bash
npm run dev            # vite dev
npm run build          # tsc -b + vite build (PWA SW included)
npm run test:run       # vitest once
npm run lint           # oxlint
npm run data:build     # rebuild deck JSON from sources (--refresh re-downloads)
npm run data:audio     # synthesize missing clips (deck + Firestore)
npm run data:handwriting  # rebuild dictionary draw-pad stroke index
npm run db:seed        # push starter deck to Firestore
npm run pwa:audit      # lighthouse
```

Deploy: `git push` → Vercel auto-deploys. `firebase deploy --only firestore:rules,database` for backend config changes (NOT `--only hosting` — hosting is Vercel now).

## Style

- No Tailwind. Hand-written utilities in `src/index.css`, semantic classes elsewhere.
- Comments explain *why*, not *what*.
- Cards in `.ts` may be CJK-named mp3s (`你好.mp3`) — that is deliberate.