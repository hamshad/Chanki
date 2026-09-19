# Requirements: Chanki

**Defined:** 2026-09-19
**Core Value:** Retention via 4-prompt recall works offline on a phone.

## v1 Requirements

### Review (4-sided session)

- [ ] **REVIEW-01**: User can start a review session with random prompt side (character/pinyin/meaning/tone) per card
- [ ] **REVIEW-02**: User can flip through all 4 sides of a card before grading
- [ ] **REVIEW-03**: User can grade whole card with Again/Hard/Good/Easy and see interval preview on buttons
- [ ] **REVIEW-04**: User sees failed sides retried within the same session
- [ ] **REVIEW-05**: User completes 20-card sessions and sees summary (count, accuracy, next due)
- [ ] **REVIEW-06**: User sees pinyin with tone marks and tone colors consistently

### SRS Scheduler

- [ ] **SRS-01**: User reschedule is driven by ts-fsrs behind a Scheduler interface (repeat preview + next apply)
- [ ] **SRS-02**: User progress persists per card (stability/difficulty/due/reps/lapses) plus per-side pass/fail history
- [ ] **SRS-03**: Every review writes an immutable review log entry

### Offline PWA

- [ ] **OFFLINE-01**: User can install app as PWA on iOS Safari and Android Chrome
- [ ] **OFFLINE-02**: User can review, write, and hear cached audio fully offline after first sync
- [ ] **OFFLINE-03**: User sees app update prompt and offline fallback page; empty-cache recovers via re-sync (not error)
- [ ] **OFFLINE-04**: User device stores cards/progress/audio-meta in IndexedDB (Dexie) as read source of truth

### Sync (device identity)

- [ ] **SYNC-01**: User gets anonymous device UUID on first launch, stored locally, no login required
- [ ] **SYNC-02**: User progress syncs in background push-then-pull with pending flags and stale/offline badges
- [ ] **SYNC-03**: User data survives app reinstall via re-sync when same device doc exists; conflicts resolve last-write-wins by updatedAt

### Admin (hidden)

- [ ] **ADMIN-01**: Admin can open hidden admin via easter-egg trigger plus access-code gate
- [ ] **ADMIN-02**: Admin can create/edit/delete decks and cards (hanzi, pinyin, meaning, tone, tags, audio)
- [ ] **ADMIN-03**: Writes are enforced by deny-by-default Firestore rules + server-minted claim (client gate is UX only), covered by emulator tests

### Deck / JSON pipeline

- [ ] **DECK-01**: User gets bundled HSK1-ish starter deck with native/recorded audio and HSK/tag metadata
- [ ] **DECK-02**: Admin can export decks to versioned JSON (schemaVersion 1) and import with per-row error report
- [ ] **DECK-03**: Card schema validates (tone 1-5 enum, required fields) with additive-only migrator

### Writing (stroke order)

- [ ] **WRITE-01**: User can practice single-character writing on canvas with stroke-order detection and mistake correction/hints
- [ ] **WRITE-02**: User writing works offline with bundled top-N stroke data, lazy-fetch for rest, free-draw fallback
- [ ] **WRITE-03**: Stroke data ships with license file + attribution and import-time coverage check

### Audio (TTS)

- [ ] **AUDIO-01**: User hears card audio via tiered chain: cached Storage MP3 primary → Cache API → speechSynthesis fallback
- [ ] **AUDIO-02**: User can manually replay tone-side audio; no autoplay on hidden tone side
- [ ] **AUDIO-03**: TTS fallback handles zh-CN voice selection, gesture priming, and sanitized text across iOS/Android/desktop

### Tone trainer (mic contour)

- [ ] **TONE-01**: User can record tone attempt via mic and see real-time pitch contour graph vs target tone shape (e.g. ni3 dip-rise)
- [ ] **TONE-02**: User gets speaker-relative shape score (never absolute Hz), with calibration + test-mic screen and noise/silence states
- [ ] **TONE-03**: All mic audio is processed on-device; nothing uploads without consent

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
| REVIEW-01 | Phase 3 | Pending |
| REVIEW-02 | Phase 3 | Pending |
| REVIEW-03 | Phase 5 | Pending |
| REVIEW-04 | Phase 5 | Pending |
| REVIEW-05 | Phase 5 | Pending |
| REVIEW-06 | Phase 3 | Pending |
| SRS-01 | Phase 4 | Pending |
| SRS-02 | Phase 4 | Pending |
| SRS-03 | Phase 4 | Pending |
| OFFLINE-01 | Phase 1 | Pending |
| OFFLINE-02 | Phase 9 | Pending |
| OFFLINE-03 | Phase 1 | Pending |
| OFFLINE-04 | Phase 2 | Pending |
| SYNC-01 | Phase 2 | Pending |
| SYNC-02 | Phase 6 | Pending |
| SYNC-03 | Phase 6 | Pending |
| ADMIN-01 | Phase 7 | Pending |
| ADMIN-02 | Phase 7 | Pending |
| ADMIN-03 | Phase 6 | Pending |
| DECK-01 | Phase 2 | Pending |
| DECK-02 | Phase 7 | Pending |
| DECK-03 | Phase 2 | Pending |
| WRITE-01 | Phase 8 | Pending |
| WRITE-02 | Phase 8 | Pending |
| WRITE-03 | Phase 8 | Pending |
| AUDIO-01 | Phase 9 | Pending |
| AUDIO-02 | Phase 9 | Pending |
| AUDIO-03 | Phase 9 | Pending |
| TONE-01 | Phase 11 | Pending |
| TONE-02 | Phase 10 | Pending |
| TONE-03 | Phase 10 | Pending |

**Coverage:**
- v1 requirements: 31 total
- Mapped to phases: 31
- Unmapped: 0

---
*Requirements defined: 2026-09-19*
*Last updated: 2026-09-19 after initial definition*
