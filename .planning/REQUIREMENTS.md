# Requirements: Chanki

**Defined:** 2026-09-19
**Core Value:** Retention via 4-prompt recall works offline on a phone.

## v1 Requirements

### Review (4-sided session)

- [x] **REVIEW-01**: User can start a review session with random prompt side (character/pinyin/meaning/tone) per card
- [x] **REVIEW-02**: User can flip through all 4 sides of a card before grading
- [x] **REVIEW-03**: User can grade whole card with Again/Hard/Good/Easy and see interval preview on buttons
- [x] **REVIEW-04**: User sees failed sides retried within the same session
- [x] **REVIEW-05**: User completes 20-card sessions and sees summary (count, accuracy, next due)
- [x] **REVIEW-06**: User sees pinyin with tone marks and tone colors consistently

### SRS Scheduler

- [x] **SRS-01**: User reschedule is driven by ts-fsrs behind a Scheduler interface (repeat preview + next apply)
- [x] **SRS-02**: User progress persists per card (stability/difficulty/due/reps/lapses) plus per-side pass/fail history
- [x] **SRS-03**: Every review writes an immutable review log entry

### Offline PWA

- [x] **OFFLINE-01**: User can install app as PWA on iOS Safari and Android Chrome
- [x] **OFFLINE-02**: User can review, write, and hear cached audio fully offline after first sync
- [x] **OFFLINE-03**: User sees app update prompt and offline fallback page; empty-cache recovers via re-sync (not error)
- [x] **OFFLINE-04**: User device stores cards/progress/audio-meta in IndexedDB (Dexie) as read source of truth

### Sync (device identity)

- [x] **SYNC-01**: User gets anonymous device UUID on first launch, stored locally, no login required
- [x] **SYNC-02**: User progress syncs in background push-then-pull with pending flags and stale/offline badges
- [x] **SYNC-03**: User data survives app reinstall via re-sync when same device doc exists; conflicts resolve last-write-wins by updatedAt

### Admin (hidden)

- [x] **ADMIN-01**: Admin can open hidden admin via easter-egg trigger plus access-code gate
- [x] **ADMIN-02**: Admin can create/edit/delete decks and cards (hanzi, pinyin, meaning, tone, tags, audio)
- [x] **ADMIN-03**: Writes are enforced by deny-by-default Firestore rules + server-minted claim (client gate is UX only), covered by emulator tests

### Deck / JSON pipeline

- [x] **DECK-01**: User gets bundled HSK1-ish starter deck with native/recorded audio and HSK/tag metadata
- [x] **DECK-02**: Admin can export decks to versioned JSON (schemaVersion 1) and import with per-row error report
- [x] **DECK-03**: Card schema validates (tone 1-5 enum, required fields) with additive-only migrator

### Writing (stroke order)

- [x] **WRITE-01**: User can practice single-character writing on canvas with stroke-order detection and mistake correction/hints
- [x] **WRITE-02**: User writing works offline with bundled top-N stroke data, lazy-fetch for rest, free-draw fallback
- [x] **WRITE-03**: Stroke data ships with license file + attribution and import-time coverage check

### Audio (TTS)

- [x] **AUDIO-01**: User hears card audio via tiered chain: cached Storage MP3 primary → Cache API → speechSynthesis fallback
- [x] **AUDIO-02**: User can manually replay tone-side audio; no autoplay on hidden tone side
- [x] **AUDIO-03**: TTS fallback handles zh-CN voice selection, gesture priming, and sanitized text across iOS/Android/desktop

### Tone trainer (mic contour)

- [ ] **TONE-01**: User can record tone attempt via mic and see real-time pitch contour graph vs target tone shape (e.g. ni3 dip-rise)
- [x] **TONE-02**: User gets speaker-relative shape score (never absolute Hz), with calibration + test-mic screen and noise/silence states
- [x] **TONE-03**: All mic audio is processed on-device; nothing uploads without consent

## v2 Requirements

### Study extras

- **REVIEW-07**: User can filter sessions by HSK/tag
- **REVIEW-08**: User sees study goals and streaks
- **REVIEW-09**: User sees example-sentence context field on cards

### Import / stats

- **DECK-04**: Admin can import CSV decks
- **SRS-04**: User sees Anki-style stats graphs
- **SYNC-04**: User transfers progress cross-device via QR

### Scheduler tuning

- **SRS-05**: FSRS parameters tune from v1 history (defaults in v1)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Real accounts / OAuth login | Zero-friction + privacy by design; device identity only |
| Per-side grading | Kept whole-card for mobile speed; per-side logged only |
| Social / leaderboards | Single-learner focus for v1 |
| Video lessons / grammar curriculum | Flashcards + writing + tones only |
| Server-side pronunciation scoring | Violates on-device mic privacy |
| .apkg import | Cost high, demand unproven for v1 |
| Autoplay audio on hidden tone side | Leaks answer, anti-learning |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| REVIEW-01 | Phase 3 | Complete |
| REVIEW-02 | Phase 3 | Complete |
| REVIEW-03 | Phase 5 | Complete |
| REVIEW-04 | Phase 5 | Complete |
| REVIEW-05 | Phase 5 | Complete |
| REVIEW-06 | Phase 3 | Complete |
| SRS-01 | Phase 4 | Complete |
| SRS-02 | Phase 4 | Complete |
| SRS-03 | Phase 4 | Complete |
| OFFLINE-01 | Phase 1 | Complete |
| OFFLINE-02 | Phase 9 | Complete |
| OFFLINE-03 | Phase 1 | Complete |
| OFFLINE-04 | Phase 2 | Complete |
| SYNC-01 | Phase 2 | Complete |
| SYNC-02 | Phase 6 | Complete |
| SYNC-03 | Phase 6 | Complete |
| ADMIN-01 | Phase 7 | Complete |
| ADMIN-02 | Phase 7 | Complete |
| ADMIN-03 | Phase 6 | Complete |
| DECK-01 | Phase 2 | Complete |
| DECK-02 | Phase 7 | Complete |
| DECK-03 | Phase 2 | Complete |
| WRITE-01 | Phase 8 | Complete |
| WRITE-02 | Phase 8 | Complete |
| WRITE-03 | Phase 8 | Complete |
| AUDIO-01 | Phase 9 | Complete |
| AUDIO-02 | Phase 9 | Complete |
| AUDIO-03 | Phase 9 | Complete |
| TONE-01 | Phase 11 | Pending |
| TONE-02 | Phase 10 | Complete |
| TONE-03 | Phase 10 | Complete |

**Coverage:**
- v1 requirements: 31 total
- Mapped to phases: 31
- Unmapped: 0

---
*Requirements defined: 2026-09-19*
*Last updated: 2026-09-24 — Phases 2 + 3 recovered from interrupted session (OFFLINE-04, SYNC-01, DECK-01, DECK-03, REVIEW-01, REVIEW-02, REVIEW-06 complete)*
*Last updated: 2026-09-29 — Phase 10 complete (TONE-02, TONE-03)*
