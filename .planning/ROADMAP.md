# Roadmap: Chanki — Chinese 4-Sided Anki PWA

## Overview

From empty repo to offline-first 4-sided Chinese flashcard PWA: installable shell first, then local data contract with starter deck, then review UI and SRS engine proving core retention thesis airplane-mode solid, then Firebase sync with locked rules, then hidden admin and deck pipeline, then writing and audio differentiators, finally mic tone trainer isolated last behind a research spike so highest risk never blocks core value.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: PWA Shell** - Installable app shell with update prompt and offline fallback
- [ ] **Phase 2: Data Contract** - Local Dexie store, card schema, device identity, starter deck
- [ ] **Phase 3: Review UI** - 4-sided flip flow with random prompt and tone styling
- [ ] **Phase 4: SRS Engine** - ts-fsrs scheduler, per-card state, immutable review log
- [ ] **Phase 5: Grading + Session** - 4-button grading, in-session retry, 20-card summary
- [ ] **Phase 6: Sync + Rules** - Background push-then-pull sync with locked Firestore rules
- [ ] **Phase 7: Admin + Deck Pipeline** - Hidden admin CRUD and versioned JSON import/export
- [ ] **Phase 8: Writing Trainer** - Stroke-order handwriting quiz with offline bundle
- [ ] **Phase 9: Audio + Full Offline** - Tiered TTS chain and airplane-mode verification
- [ ] **Phase 10: Tone Spike + Scoring** - Pitch estimator spike and speaker-relative shape score
- [ ] **Phase 11: Tone Trainer UI** - Mic contour graph vs target tone shape

## Phase Details

### Phase 1: PWA Shell
**Goal**: User can install the app on phone home screen and always get a working shell, even offline or on update
**Depends on**: Nothing (first phase)
**Requirements**: OFFLINE-01, OFFLINE-03
**Success Criteria** (what must be TRUE):
  1. User can install app from iOS Safari Share → Add to Home Screen and Android Chrome install prompt
  2. User sees an update prompt when a new version is available (no silent stale shell)
  3. User opening app with empty/evicted cache sees offline fallback page with re-sync recovery, not a blank error
**Plans**: 3 plans

Plans:
- [ ] 01-01-PLAN.md — Scaffold + PWA foundation (VitePWA prompt config, manifest, offline fallback precache)
- [ ] 01-02-PLAN.md — Install + update UX (update banner, iOS hint, Chromium install button)
- [ ] 01-03-PLAN.md — Hosting + verification (firebase.json headers, Lighthouse gate, device matrix)

### Phase 2: Data Contract
**Goal**: App has a versioned local source of truth with real starter content and anonymous device identity
**Depends on**: Phase 1
**Requirements**: OFFLINE-04, DECK-03, SYNC-01, DECK-01
**Success Criteria** (what must be TRUE):
  1. User's cards, progress, and audio-meta persist across restarts from IndexedDB (Dexie) as sole read source
  2. User gets an anonymous device UUID on first launch with no login screen anywhere
  3. User sees a bundled HSK1-ish starter deck with native/recorded audio and HSK/tag metadata on first run
  4. Invalid card data (bad tone value, missing required field) is rejected by schema validation, and old schemaVersion data migrates additively
**Plans**: TBD

Plans:
- [ ] 02-01: TBD

### Phase 3: Review UI
**Goal**: User can flip through all four sides of a card starting from a random prompt side
**Depends on**: Phase 2
**Requirements**: REVIEW-01, REVIEW-02, REVIEW-06
**Success Criteria** (what must be TRUE):
  1. User starting a session sees a random prompt side (character/pinyin/meaning/tone) per card, not always the same side
  2. User can flip through all 4 sides of a card before any grading control appears
  3. User sees pinyin with correct tone marks and consistent tone colors on every side, every card
**Plans**: TBD

Plans:
- [ ] 03-01: TBD

### Phase 4: SRS Engine
**Goal**: Every grade durably reschedules the card via a real spaced-repetition scheduler with full audit trail
**Depends on**: Phase 3
**Requirements**: SRS-01, SRS-02, SRS-03
**Success Criteria** (what must be TRUE):
  1. User grading a card sees interval previews (Again/Hard/Good/Easy each show when card returns) computed by ts-fsrs behind the Scheduler interface
  2. User's per-card progress (stability/difficulty/due/reps/lapses) plus per-side pass/fail history survives app restart
  3. Every review appends an immutable review-log entry that is never overwritten by later reviews
**Plans**: TBD

Plans:
- [ ] 04-01: TBD

### Phase 5: Grading + Session
**Goal**: User completes fast 20-card whole-card-graded sessions with weak sides retried and a summary at the end
**Depends on**: Phase 4
**Requirements**: REVIEW-03, REVIEW-04, REVIEW-05
**Success Criteria** (what must be TRUE):
  1. User grades each card whole-card with Again/Hard/Good/Easy and sees the interval preview on each button
  2. User who fails sides on a card sees that card retried within the same session
  3. User finishing 20 cards sees a summary with count, accuracy, and next-due information
**Plans**: TBD

Plans:
- [ ] 05-01: TBD

### Phase 6: Sync + Rules
**Goal**: User's progress syncs across launches in the background while the backend stays locked against public writes
**Depends on**: Phase 5
**Requirements**: SYNC-02, SYNC-03, ADMIN-03
**Success Criteria** (what must be TRUE):
  1. User going offline then online sees progress push then pull automatically, with pending flags and stale/offline badges during the gap
  2. User reinstalling the app recovers prior data via re-sync when the device doc exists; conflicting edits resolve last-write-wins by updatedAt
  3. Unauthorized write attempts against Firestore fail (deny-by-default rules + server-minted admin claim), proven by emulator assertFails tests in CI
**Plans**: TBD

Plans:
- [ ] 06-01: TBD

### Phase 7: Admin + Deck Pipeline
**Goal**: Admin can author decks through a hidden gate and round-trip them as versioned JSON without silent data loss
**Depends on**: Phase 6
**Requirements**: ADMIN-01, ADMIN-02, DECK-02
**Success Criteria** (what must be TRUE):
  1. Admin opens the hidden admin via easter-egg trigger plus access-code gate (ordinary users never stumble into it)
  2. Admin can create, edit, and delete decks and cards including hanzi, pinyin, meaning, tone, tags, and audio
  3. Admin exporting then importing a deck gets a byte-identical round-trip, and importing malformed JSON yields a per-row error report naming each bad row
**Plans**: TBD

Plans:
- [ ] 07-01: TBD

### Phase 8: Writing Trainer
**Goal**: User can practice single-character handwriting with stroke-order correction, fully offline
**Depends on**: Phase 7
**Requirements**: WRITE-01, WRITE-02, WRITE-03
**Success Criteria** (what must be TRUE):
  1. User drawing a character on canvas gets stroke-order mistake detection with correction hints
  2. User in airplane mode can still practice top characters from the bundled stroke bundle; rare characters lazy-fetch when online and fall back to free-draw when missing
  3. Shipped bundle includes the stroke-data license file with attribution, and importing new stroke data fails loudly on coverage gaps
**Plans**: TBD

Plans:
- [ ] 08-01: TBD

### Phase 9: Audio + Full Offline
**Goal**: Every card speaks reliably on every platform, and the whole learning loop works in airplane mode
**Depends on**: Phase 8
**Requirements**: AUDIO-01, AUDIO-02, AUDIO-03, OFFLINE-02
**Success Criteria** (what must be TRUE):
  1. User tapping replay on the tone side hears audio within 500ms cached / 2s on network, served by the tiered chain (Storage MP3 → Cache API → speechSynthesis fallback)
  2. User replaying audio manually never triggers autoplay when the tone side is hidden
  3. User on iOS Safari, Android Chrome, and desktop each hear correct zh-CN voice output with gesture priming and sanitized text
  4. User in airplane mode (after first sync) can review, write, and hear cached audio end-to-end with no network errors
**Plans**: TBD

Plans:
- [ ] 09-01: TBD

### Phase 10: Tone Spike + Scoring
**Goal**: Pitch estimation approach is proven on real phones with a speaker-relative scoring function, before any trainer UI is built
**Depends on**: Phase 9
**Requirements**: TONE-02, TONE-03
**Success Criteria** (what must be TRUE):
  1. Spike report documents measured pitchy-MPM vs YIN comparison on target phones (ni3 dip-rise and ma1 samples) with a chosen winner
  2. Shape score for the same tone sung at different absolute pitches returns the same result (speaker-relative, never absolute Hz), with calibration and test-mic flow handling noise/silence states
  3. No mic audio leaves the device — network inspection during a tone attempt shows zero audio upload without explicit consent
**Plans**: TBD

Plans:
- [ ] 10-01: TBD

### Phase 11: Tone Trainer UI
**Goal**: User can record a tone attempt and see their live pitch contour against the target tone shape
**Depends on**: Phase 10
**Requirements**: TONE-01
**Success Criteria** (what must be TRUE):
  1. User recording a tone attempt (e.g. nǐ third-tone dip-rise) sees a real-time pitch contour graph drawn against the target tone shape at ~60fps with <100ms pitch latency
  2. User sees their shape score and which part of the contour diverged after each attempt
**Plans**: TBD

Plans:
- [ ] 11-01: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. PWA Shell | 0/1 | Not started | - |
| 2. Data Contract | 0/1 | Not started | - |
| 3. Review UI | 0/1 | Not started | - |
| 4. SRS Engine | 0/1 | Not started | - |
| 5. Grading + Session | 0/1 | Not started | - |
| 6. Sync + Rules | 0/1 | Not started | - |
| 7. Admin + Deck Pipeline | 0/1 | Not started | - |
| 8. Writing Trainer | 0/1 | Not started | - |
| 9. Audio + Full Offline | 0/1 | Not started | - |
| 10. Tone Spike + Scoring | 0/1 | Not started | - |
| 11. Tone Trainer UI | 0/1 | Not started | - |
