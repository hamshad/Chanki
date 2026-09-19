# Feature Research

**Domain:** Chinese-learning flashcard PWA (Anki-style SRS + handwriting + tones)
**Researched:** 2026-09-19
**Confidence:** MEDIUM (official docs + multiple review sources agree; no Context7 needed — feature-level, not library-API research)

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Spaced repetition scheduling (Again/Hard/Good/Easy) | Every serious flashcard user knows Anki's 4-button model; Anki manual defines Again/Hard/Good/Easy semantics, FSRS default since 23.10 | MEDIUM | Start with SM-2 (simpler, well-documented), leave FSRS upgrade path. Per-card `{ease, interval, due, reps, lapses}` fields required from day one or migration pain later. |
| Flip-then-grade review loop | Anki/Pleco/Du Chinese all use prompt → recall → reveal → self-grade; users will not learn a novel grading UX | LOW | Chanki's twist is 4-sided flip-through, but the loop shape must stay familiar. Keyboard (Space/1-4) + tap targets on mobile. |
| Session structure + summary screen | Anki shows due counts; HelloChinese/Du Chinese use bite-sized sessions + progress; users expect "done for today" feeling | LOW | 20-card session + summary (count, accuracy, next due) is standard gamification minimum. Cheap to build, high retention value. |
| Native-speaker audio per card | Pleco ships 34k+ recorded headwords; Du Chinese uses native audio for every lesson (explicitly "not synthetic"); HelloChinese has 2000+ native clips | MEDIUM | Users distrust robot-only audio for tones. Plan: pre-generated MP3 in Storage for bundled deck + TTS fallback for custom cards. Audio must start <500ms cached. |
| Offline review of due cards | HelloChinese premium offers downloadable offline courses; Du Chinese paid tier offers offline study; Anki is offline-first by design | MEDIUM | PWA service worker + IndexedDB cache of cards, progress, audio. Table stakes for commute/airplane use. |
| Progress persistence across sessions | Anki revlog never loses history; Du Chinese tracks progress + study goals; HelloChinese syncs across devices | LOW | Even without accounts, local IndexedDB persistence is non-negotiable. Firestore sync is enhancement, not replacement. |
| Simplified + Traditional support | Pleco, HelloChinese, Du Chinese all support both; HSK 3.0 (2026) materials assume both scripts exist | LOW | Card model should carry `hanzi` + optional `traditional` variant field from start; rendering toggle is cheap if data model allows. |
| Pinyin display with tone marks + tone colors | Du Chinese shows pinyin + tone colors + HSK level per word; Pleco shows pinyin/zhuyin; universal expectation | LOW | Use numbered→marked conversion + CSS tone colors (1 red, 2 green, 3 blue, 4 purple convention). Trivial cost, high readability. |
| Deck import (at least one format) | Anki lives on shared decks; Pleco imports premade lists; Du Chinese exports to Anki/Pleco/Skritter | MEDIUM | Versioned JSON import/export (`schemaVersion` field) covers v1. CSV/TSV import is the most-requested follow-up (Anki users have CSV decks). |
| Basic stats (due count, retention/accuracy) | Anki stats page (Again count, answer buttons, retention table); Pleco scorefiles/statistics; Du Chinese progress tracking | LOW | Summary screen + simple counts suffice for v1. Full Anki-style graphs are v2. |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valuable.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| 4-sided card (character / pinyin / meaning / tone+audio) with random prompt side | Nobody does this: Anki is 2-sided, Pleco tests one axis at a time (fill-in-blank, tone drill, stroke order as separate modes), Du Chinese is Forgot/Almost/Got-it 3-way. Random-prompt + whole-card grade forces true recall, Chanki's core thesis | MEDIUM | Whole-card grade (not per-side) keeps mobile sessions fast — matches PROJECT.md decision. Failed-side retry in-session is the reinforcement loop. Must validate: does 4-sided actually improve retention vs slower sessions? |
| Stroke-order writing quiz (hanzi-writer) | Pleco gates stroke-order diagrams + quiz behind paid add-on; HelloChinese tracing is "trace a couple times, not from memory" (weak); Skritter owns this space as paid leader. Free built-in quiz is a real gap | MEDIUM | hanzi-writer 3.7.3 (Sep 2025, MIT, ~35KB, quiz callbacks onCorrectStroke/onMistake/onComplete, hint-after-3-misses) is the standard choice. Data derived from Make Me a Hanzi. Single-char cards only — matches Pleco's constraint (stroke mode single-char only). |
| Mic tone-contour trainer (pitch graph vs target shape) | HelloChinese speech recognition catches tone errors but gives no visual curve; Pleco tone practice is tap-the-tone-number (no mic); dedicated tools (MandaTone, Yutone, TonePerfect, CPAIT, Pure Language Tone Mirror) prove demand but are separate apps. In-deck mic+graph is unique | HIGH | Highest-risk feature. Validated pattern: browser autocorrelation/YIN pitch detection, semitone-normalized vs speaker average, shape-score not size-score (Pure Language Tone Mirror documents this well). Neutral tone has no target shape — drill by ear only. Mic must work in iOS Safari PWA + process on-device (privacy constraint). |
| Zero-login anon device sync | Anki requires AnkiWeb account; HelloChinese/Du Chinese require accounts for sync. No-login + anon UUID sync = zero friction, privacy story | MEDIUM | Device UUID in IndexedDB + `devices/{deviceId}` Firestore doc. Tradeoff: no cross-device unless manual transfer code — document as known limitation, possible v2 QR-transfer. |
| Hidden admin (easter-egg + code gate) | Consumer apps don't have this; it serves single-creator deck authoring without building full CMS/auth | LOW | Secret trigger (multi-tap/logo route) + access code; Firestore rules must still deny public writes (security review needed). Cheap, but rules misconfiguration = spam hole. |
| On-device TTS fallback for custom cards | Pleco uses system TTS free / enhanced paid; Du Chinese deliberately avoids synthetic. Hybrid (recorded audio for bundled deck, Web Speech API zh-CN fallback for custom) gives full coverage without recording costs | LOW | Web Speech `speechSynthesis` zh voice availability varies iOS/Android — must cache what can be cached; offline TTS on iOS PWA is the known unknown. Never present TTS as primary for bundled content. |
| Sentence/context on card | Du Chinese's killer detail: flashcard created with source sentence as context; Pleco cards link back to dictionary entry. Isolated-word cards underperform | LOW | Add optional `example` sentence field to card model now (cheap); auto-generating examples is v2. High learning value per cost. |
| HSK level tags + tone colors | Du Chinese shows HSK level per word; 2026 HSK 3.0 lists make this freshly relevant; Pleco added 2026 HSK 3.0 premade cards | LOW | `tags: ["HSK1"]` + difficulty field already in draft card model. Enables filtered sessions later. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Real user accounts / OAuth login | "Sync across devices, social, progress safety" | Directly contradicts no-login design; adds auth backend, password resets, PII liability, review friction. PROJECT.md out-of-scope by design | Anon device UUID + optional v2 manual transfer code (QR/short code) |
| Per-side grading (4 grades per card) | "More precise SRS data" | 4x taps per card kills mobile session pace; Anki data shows Good is used 80-95% anyway — precision is illusory. PROJECT.md already decided whole-card grade | Whole-card grade + in-session retry of failed sides |
| Full Anki import (.apkg) support | "Let users bring existing decks" | .apkg is SQLite+media bundle — parser complexity HIGH, media licensing mess, scope explosion for v1 | Versioned JSON first; CSV second (v1.x); .apkg only if users demand (v2+) |
| Social / leaderboards / sharing | "Engagement, virality" | Single-learner v1; moderation, cheating, backend cost, privacy surface. Du/HelloChinese engagement comes from content, not social | Study goals/streaks solo (Du Chinese 2026 study-goals pattern) |
| Video lessons / grammar curriculum | "Complete learning app" | Content production cost enormous; HelloChinese/Du Chinese employ teacher teams. Flashcards+writing+tones is already 3 features | Link out / HSK-tagged example sentences; curriculum is v2+ decision |
| Server-side speech scoring (upload mic audio) | "More accurate AI scoring like TonePerfect" | Violates on-device privacy constraint; latency kills real-time graph; backend cost. Browser pitch detection suffices for shape feedback | On-device autocorrelation/YIN, shape-score; server scoring only if v2 demands it |
| Auto-playing audio on prompt side | "Immersive listening" | Leaks the tone answer when tone side is the tested axis; destroys random-prompt integrity | Autoplay only when tone side is shown as prompt, never as hidden answer; manual tap otherwise |
| Custom SRS algorithm from scratch | "Better than SM-2" | Anki spent years validating FSRS vs SM-2; custom algorithm = unvalidated scheduling + research burden | SM-2 now (documented, simple), FSRS parameters later (Anki-compatible DSR fields) |

## Feature Dependencies

```
4-sided review (random prompt, flip, whole-card grade)
    └──requires──> Card model (hanzi/pinyin/meaning/tone/audioUrl/tags/schemaVersion)
    └──requires──> SRS scheduler (SM-2 state per card)
    └──requires──> Session engine (20-card queue, retry failed sides, summary)
                        └──requires──> Progress store (IndexedDB local first)

SRS scheduler ──enhances──> Progress store (writes ease/interval/due/revlog)
Session summary ──requires──> Progress store (counts, accuracy, next-due)

Handwriting quiz (hanzi-writer)
    └──requires──> Card model (single hanzi char field)
    └──requires──> Stroke data (bundled Make-Me-a-Hanzi JSON or CDN, cached offline)

TTS audio
    └──requires──> Card model (audioUrl nullable → fallback chain)
    └──requires──> Audio cache (Storage MP3 + Cache API; Web Speech fallback uncached)
Tone playback ──requires──> TTS audio (model playback before mic attempt)

Mic tone-contour trainer
    └──requires──> TTS audio (target playback + reference contour)
    └──requires──> Mic permission flow (PWA, iOS Safari quirk handling)
    └──enhances──> Tone side of 4-sided review (drill weak tones)

Offline PWA
    └──requires──> Card model + Progress store + Audio cache (all cached)
    └──enhances──> Every review/writing feature (airplane-mode gate test)

Hidden admin CRUD
    └──requires──> Card model + schemaVersion (admin edits must migrate cleanly)
    └──requires──> Firestore rules (deny public writes; code-gate is UX, not security)

JSON import/export
    └──requires──> Card model + schemaVersion (version check + migration)
    └──enhances──> Hidden admin (bulk deck authoring path)

Device progress sync (Firestore devices/{deviceId})
    └──requires──> Progress store (local-first, sync is overlay)
    └──requires──> Anon UUID identity (IndexedDB-persisted)
    └──conflicts──> Real user accounts (explicitly rejected; do not mix both)
```

### Dependency Notes

- **Review requires card model + scheduler + session engine:** card model is the foundation — freeze `schemaVersion: 1` fields early (add optional `example`, `traditional` now while cheap).
- **Mic trainer requires TTS target playback:** user must hear model before recording; target contour can be idealized tone shape (no need for per-card recorded contour analysis in v1).
- **Sync is overlay on local-first store:** offline review must never block on network; sync queue with last-write-wins per card + revlog append. Anki's merge model (both reviews preserved, latest state wins) is the reference.
- **Admin gate is UX, rules are security:** easter-egg + code stops casual discovery; only Firestore rules stop abuse. Never rely on obscurity.
- **Stroke data size vs offline:** full Make-Me-a-Hanzi-derived hanzi-writer-data for all chars is large — bundle common ~500 chars (Pleco free-tier precedent: 500 free / 28k paid) + lazy-fetch rest, cache in IndexedDB/Cache API.

## MVP Definition

### Launch With (v1)

Minimum viable product — what's needed to validate the concept.

- [ ] 4-sided review with random prompt, flip-through, whole-card Again/Hard/Good/Easy — core thesis, nothing else matters without it
- [ ] SM-2 scheduler + per-card state + revlog — retention engine; FSRS-later needs these fields
- [ ] 20-card session queue + failed-side retry + summary (count/accuracy/next-due) — session shape already locked in Phase 1 discussion
- [ ] Offline-first PWA shell (cards + progress + cached audio, installable iOS/Android) — core value states offline explicitly
- [ ] Bundled HSK1-ish starter deck with recorded/native audio + tone colors + pinyin — empty app validates nothing
- [ ] Stroke-order writing quiz on single-char cards (hanzi-writer) — top differentiator, medium cost
- [ ] TTS fallback (Web Speech zh) + manual audio playback — coverage for custom/admin-created cards
- [ ] Hidden admin CRUD + code gate + locked Firestore rules — deck authoring path
- [ ] Versioned JSON import/export — portability + admin bulk path
- [ ] Anon device UUID + Firestore progress sync (last-write-wins) — zero-login sync promise

### Add After Validation (v1.x)

Features to add once core is working.

- [ ] Mic tone-contour trainer — trigger: core review retention validated; reason to defer: highest complexity/risk (pitch latency, iOS mic quirks), isolate from launch critical path
- [ ] CSV import — trigger: users ask to bring Anki/Pleco lists
- [ ] Study goals / streaks (Du Chinese 2026 pattern) — trigger: retention data shows drop-off after week 1
- [ ] Example sentences auto-display + sentence-context cards — trigger: vocabulary-without-context complaints
- [ ] HSK-level filtering + tag-filtered sessions — trigger: deck grows beyond starter set

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] FSRS scheduler upgrade — why defer: SM-2 suffices for validation; FSRS needs parameter tuning + history data you only get from v1 usage
- [ ] Cross-device transfer code (QR) — why defer: single-device v1 is coherent; adds UX + conflict-resolution surface
- [ ] Full Anki stats graphs (retention curves, answer-button breakdown) — why defer: summary screen suffices until power users arrive
- [ ] .apkg import — why defer: high cost, demand unproven
- [ ] Server-side pronunciation AI scoring — why defer: privacy/latency/cost; on-device shape-score first

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| 4-sided review + flip + whole-card grade | HIGH | MEDIUM | P1 |
| SM-2 scheduler + revlog | HIGH | MEDIUM | P1 |
| 20-card session + summary | HIGH | LOW | P1 |
| Offline PWA (cards/progress/audio cached) | HIGH | MEDIUM | P1 |
| Bundled starter deck + native audio | HIGH | MEDIUM | P1 |
| Stroke-order writing quiz | HIGH | MEDIUM | P1 |
| TTS fallback + audio playback | HIGH | LOW | P1 |
| Hidden admin + locked rules | MEDIUM | LOW | P1 |
| JSON import/export | MEDIUM | LOW | P1 |
| Anon device sync (Firestore) | MEDIUM | MEDIUM | P1 |
| Mic tone-contour trainer | HIGH | HIGH | P2 (flagship follow-up, isolate risk) |
| CSV import | MEDIUM | LOW | P2 |
| Study goals / streaks | MEDIUM | LOW | P2 |
| Example sentences on cards | MEDIUM | LOW | P2 |
| HSK/tag-filtered sessions | MEDIUM | LOW | P2 |
| FSRS upgrade | MEDIUM | MEDIUM | P3 |
| Cross-device transfer | LOW | MEDIUM | P3 |
| Anki stats graphs | LOW | MEDIUM | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | Anki | Pleco | HelloChinese | Du Chinese | Our Approach |
|---------|------|-------|--------------|------------|--------------|
| SRS scheduling | SM-2/FSRS, 4-button, revlog, deep stats (docs.ankiweb.net) | SRS in paid flashcard add-on; free = random, no scores | Spaced repetition, personalized review | SRS Forgot/Almost/Got-it + study goals (2026) | SM-2 + 4-button + revlog from day one; FSRS path later |
| Prompt variety | 2-sided, user-defined templates | Self-graded, multiple-choice, fill-in-blank, stroke-order, tone-practice modes | Game lessons, speech + writing mixed | Tap-to-reveal + sentence context | 4-sided random prompt, whole-card grade — nobody else does this |
| Handwriting | Add-ons only, not core | Fullscreen handwriting lookup (tolerant engine) + stroke-order diagrams (28k, paid) + stroke-order test mode | On-screen trace, strong recognition but shallow (trace-only, not from-memory) | None (reading app) | hanzi-writer quiz-from-memory with mistake callbacks — free, core-integrated |
| Tone training | None built-in | Tone Practice mode = tap tone number (no mic), ≤4-char cards | Speech recognition pass/fail per lesson, no visual curve; dedicated pinyin+tone course | Native audio shadowing only, no scoring | Mic + real-time pitch contour vs target shape (Yutone/MandaTone pattern, on-device) |
| Audio | User-supplied media, synced via AnkiWeb | 34k recorded headwords + system TTS fallback | 2000+ native clips + TTS | All-native recordings, synced text-audio | Recorded MP3 bundled + Web Speech zh fallback for custom cards |
| Offline | Offline-first desktop/mobile | Fully offline (downloaded dicts) | Downloadable courses (premium) | Offline on paid plans | Full review+writing+cached audio offline after first sync (PWA) |
| Sync | AnkiWeb account, media+review merge | Paid add-on device transfer | Account sync across devices | Account progress tracking | Anon device UUID, no login, last-write-wins overlay |
| Import/export | .apkg, CSV, shared decks ecosystem | Premade lists, import/export, 2026 HSK 3.0 cards | Closed curriculum, no import | Export to Pleco/Anki/Skritter; no import | Versioned JSON v1, CSV v1.x, .apkg only if demanded |
| Content model | User decks | Dictionary-first (card from any entry) | HSK curriculum 430+ grammar / 2500+ words (2026) | 3000+ graded stories, weekly updates | Bundled starter deck + hidden-admin authoring; sentences as context (Du pattern) |

## Sources

- Anki Manual: Studying (answer buttons), SRS algorithms FAQ (SM-2/FSRS), Syncing with AnkiWeb, Statistics — https://docs.ankiweb.net (HIGH)
- Pleco product pages + Android flashcard manual (test modes, SRS, stroke order, tone practice) — https://www.pleco.com, https://android.pleco.com/manual/310/flash.html (HIGH)
- HelloChinese official feature list (Play Store) + aipilotsg review 2026-08 + linguasteps review — speech recognition, handwriting, HSK course, offline premium (MEDIUM)
- Du Chinese official site + Play Store listing + languavibe review 2026-08 + LTL review 2025-02 — SRS, study goals, Pleco/Skritter export, native audio, offline paid (MEDIUM)
- hanzi-writer docs + npm (v3.7.3, Sep 2025) + GitHub chanind/hanzi-writer — quiz API, Make-Me-a-Hanzi data lineage (HIGH)
- Tone-trainer pattern sources: Yutone (yutone.app), MandaTone (mandatone.com), TonePerfect, CPAIT (on-device AI), Pure Language Tone Mirror (browser pitch, semitone normalization, shape-not-size scoring) (MEDIUM)
- HSK 3.0 2026 context: Pleco 2026 HSK flashcards update, HelloChinese Main Course 2.0 covering new HSK 1-2 (MEDIUM, LOW for exact level mapping — validate deck tags against official word lists)

---
*Feature research for: Chanki Chinese 4-sided Anki PWA*
*Researched: 2026-09-19*
