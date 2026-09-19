# Project Research Summary

**Project:** Chanki — Chinese 4-sided Anki PWA
**Domain:** Offline-first PWA spaced-repetition flashcard app (Chinese: 4-sided review + handwriting + TTS + mic tone trainer, Firebase sync, hidden admin)
**Researched:** 2026-09-19
**Confidence:** MEDIUM-HIGH (HIGH on versions/core libs; MEDIUM on iOS PWA behavior, TTS quirks, pitch approach)

## Executive Summary

Chanki is an offline-first PWA for Chinese vocabulary: 4-sided cards (character / pinyin / meaning / tone+audio) with random-prompt prompt, whole-card Again/Hard/Good/Easy grading, stroke-order writing quiz, tiered TTS audio, and an on-device mic tone-contour trainer — all local-first in IndexedDB with Firebase as sync peer, no login by design. Experts build this class of app as three composable layers: service worker (offline shell + audio/stroke caching), local DB as sole read source of truth, and a background push-then-pull sync engine. That is the recommended approach here: Vite 8 + React 19 + TS 5.9, vite-plugin-pwa (Workbox 7.4.1), Dexie 4.4.5 as source of truth, Firestore/Storage as cloud peer, ts-fsrs scheduler behind a pure wrapper, hanzi-writer for strokes, pitchy (MPM) + custom Canvas 2D for tone contour.

The key judgment call: FEATURES.md suggests SM-2-first with FSRS later, but STACK + ARCHITECTURE + PITFALLS all point the other way — ship ts-fsrs from day one behind a `Scheduler` interface. A mid-stream scheduler rewrite invalidates every existing interval, and ts-fsrs is verified, dependency-free, and already tested with Vitest. Second call: the mic tone trainer is the highest-risk piece (pitch octave errors, iOS mic quirks, canvas perf) and must be isolated as the LAST phase with a research spike before UI commitment — it cannot be allowed to block core SRS value. Third: Firestore rules (not the easter-egg admin gate) are the real security boundary, and must land locked from the first backend commit with emulator tests.

## Key Findings

### Recommended Stack

Vite 8.3.0 + React 19.3.0 + TypeScript 5.9 (pinned — TS 7.0.2 Go port exists but plugin/hook compat unverified) + vite-plugin-pwa 1.3.0 (Workbox 7.4.1) + Firebase modular SDK 12.18.0 + Dexie 4.4.5. Domain libs: ts-fsrs 5.4.2 (scheduler), hanzi-writer 3.7.3 + hanzi-writer-data 2.x (strokes), pitchy 4.1.0 (MPM pitch, ESM-only), custom Canvas 2D (tone graph — no chart lib). Dexie is source of truth; Firestore offline persistence is NOT the read path. Audio is tiered: Storage MP3 primary → Cache API → speechSynthesis fallback only. See STACK.md for install commands, version-compat matrix, and NOT-to-use list (compat SDK, raw IDB, Meyda-as-pitch, speechSynthesis-as-primary, MediaRecorder-for-pitch).

**Core technologies:**
- Vite 8.3.0 + vite-plugin-pwa 1.3.0: PWA shell, precache + MP3 runtime cache, `registerType: 'prompt'` update flow
- React 19.3.0 + dexie-react-hooks: 4-side flip + session flow with live queries
- TypeScript 5.9 (pinned): card schema + FSRS state strictness; validate TS 7 before adopting
- Firebase JS SDK 12.18.0 (modular): Firestore + Storage + Hosting; user-mandated, current since July 2025
- Dexie 4.4.5: offline cards/progress/FSRS/audio-meta; queue = `syncStatus:'pending'` rows, never in-memory
- ts-fsrs 5.4.2: `repeat()` interval preview + `next()` grade apply; wrap behind `Scheduler` interface
- hanzi-writer 3.7.3: quiz mode with mistake callbacks; self-host stroke JSON, bundle top ~500 chars
- pitchy 4.1.0 + custom canvas: MPM pitch gated on clarity <0.5, voice band 80–500 Hz, speaker-relative shape scoring

### Expected Features

Nobody does 4-sided random-prompt with whole-card grading (Anki is 2-sided, Pleco splits modes, Du Chinese is 3-way) — that is the core thesis to validate. Free built-in stroke quiz (Pleco gates it paid, HelloChinese tracing is shallow) and in-deck mic+graph tone trainer (competitors do tap-the-number or pass/fail with no curve) are the two real differentiators. Zero-login anon sync is a friction/privacy win with a known cost (no cross-device until v2 QR transfer). See FEATURES.md for competitor matrix and dependency graph.

**Must have (table stakes):**
- 4-sided review (random prompt, flip-through, whole-card Again/Hard/Good/Easy) + failed-side in-session retry
- Scheduler + per-card state (`ease/interval/due/reps/lapses/sideHistory[]`) + revlog from day one
- 20-card session queue + summary (count/accuracy/next-due)
- Offline-first PWA (cards + progress + cached audio, installable iOS/Android)
- Bundled HSK1-ish starter deck with consistent-voice native/recorded audio + tone colors + pinyin marks
- Stroke-order writing quiz on single-char cards
- TTS fallback chain + manual playback; hidden admin CRUD + locked rules; versioned JSON import/export; anon UUID + Firestore sync overlay

**Should have (competitive):**
- Mic tone-contour trainer — flagship follow-up, P2, isolate risk (HIGH value + HIGH cost)
- CSV import; study goals/streaks; example-sentence context field; HSK/tag-filtered sessions

**Defer (v2+):**
- FSRS parameter tuning from v1 history (ship ts-fsrs defaults now, optimize later) — NOT a scheduler rewrite
- Cross-device QR transfer; Anki-style stats graphs; .apkg import; server-side pronunciation scoring (violates on-device privacy)
- Anti-features: real accounts/OAuth, per-side grading, social/leaderboards, video curriculum, autoplay-on-hidden-tone-side

### Architecture Approach

Local-replica + push-then-pull sync: UI never reads network; every mutation writes Dexie locally with `syncStatus:'pending'`, sync pushes pending batch then pulls remote with field-level last-write-wins by `updatedAt`. Pure `domain/` (srs, session machine, tone templates, schema migrator, device ID) with zero I/O imports; `data/` owns all persistence; `audio/` owns mic/worklet/pitch/TTS lifecycle in one boundary; `admin/` shares only the `data/` write path; `rules/` versioned + emulator-tested. Card schema freezes early with `schemaVersion`, additive-only changes, canonical tone enum `1|2|3|4|5`. See ARCHITECTURE.md for system diagram, project structure, and five patterns.

**Major components:**
1. App shell / SW — offline shell, CacheFirst audio/stroke JSON, update prompt, /offline fallback
2. Local store (Dexie) — source of truth; tables decks/cards/progress/reviewLogs/audioMeta; indexes on nextReview/updatedAt/syncStatus
3. Sync engine — push-then-pull, backoff+jitter, `fromCache` stale badge; per-device docs, no CRDTs
4. Review session machine — prompt(random side) → revealing → grading (preview intervals on buttons) → retryQueue → summary
5. Writing canvas + TTS service + tone pipeline — hanzi-writer quiz; 3-tier audio; worklet → pitch → speaker-relative contour compare → canvas, 100% on-device
6. Hidden admin + schema migrator — easter-egg UI gate, rules-enforced writes, versioned JSON round-trip

### Critical Pitfalls

Top risks with prevention (full list of 9 + debt/integration/perf tables in PITFALLS.md):

1. **Easter-egg admin becomes open-write hole** — client gate is bypassable; deny-by-default rules, admin custom claim via Cloud Function (never client-verified code), uid-scoped device docs, App Check enforce, emulator `assertFails` tests from first backend commit.
2. **iOS PWA cache eviction kills offline-first** — ~50 MB cap, 7-day eviction, no Background Sync; design empty-cache as normal (re-sync state), minimal precache + LRU audio with size cap, `storage.estimate()` guard at 80%, re-download button, eviction-recovery acceptance test.
3. **SM-2 ease hell + whole-card grade distortion** — Anki-correct scheduler (ease floor 1.3, relearning exempt, fuzz), log per-side pass/fail even with whole-card grade, cap grade by failed-side count, scheduler unit tests as phase exit gate.
4. **hanzi-writer CDN + coverage + Arphic license** — self-host stroke JSON (bundle top-N, lazy-fetch rest), import-time coverage check, ship ARPHICPL.TXT + attribution, generous `leniency` default on small screens.
5. **TTS voice inconsistency (esp. iOS)** — MP3 primary, speechSynthesis fallback only; `voiceschanged` wait, zh-CN allowlist + user override, gesture-primed `speak()`, sanitize `<>`/CJK quotes, 3-platform audio matrix test.
6. **Pitch octave errors + canvas jank** — YIN/autocorr in AudioWorklet, 65–500 Hz clamp, RMS silence gate, semitone-normalize then shape-match (never absolute Hz), DPR cap ≤2, 30 fps throttle, incremental draw, detection decoupled from render.

## Implications for Roadmap

Based on research, suggested phase structure (compresses ARCHITECTURE.md's 7-step build order into roadmap phases; highest-risk piece last):

### Phase 1: Offline foundation + data contract
**Rationale:** Everything reads from the local store; schema frozen early prevents drift across all later phases.
**Delivers:** Vite PWA shell (precache, update prompt, /offline), Dexie schema (decks/cards/progress/reviewLogs/audioMeta + indexes), anon device UUID, Zod card schema + `schemaVersion: 1` + migrator skeleton, seeded starter deck, eviction-recovery path.
**Addresses:** Offline review, progress persistence, simplified/traditional + example fields, tone enum `1..5`.
**Avoids:** iOS eviction death (Pitfall 2), schema drift (Pitfall 8), audio budget blowup (Pitfall 9 — budget set here).

### Phase 2: Review + SRS core
**Rationale:** Core thesis (4-sided random-prompt) must be proven airplane-mode solid against local store alone before sync exists.
**Delivers:** ts-fsrs wrapper (`repeat`/`next`), 20-card session machine (prompt/flip/grade/retry/summary), per-side logging + grade capping, interval preview on buttons, scheduler unit tests, basic stats.
**Addresses:** 4-sided review, scheduler + revlog, session + summary, pinyin/tone colors.
**Avoids:** Ease hell + grade distortion (Pitfall 3); scheduler-in-UI anti-pattern.

### Phase 3: Sync backend + rules lockdown
**Rationale:** Sync mirrors rows only after review is proven; rules must be locked before any production deploy.
**Delivers:** Push-then-pull engine (pending flags, backoff, status badges), Firestore init with persistent cache, deny-by-default rules + uid-scoped device docs + admin claim, App Check, emulator CI tests, re-sync-on-launch.
**Addresses:** Anon device sync overlay, progress survival.
**Avoids:** Open-write admin hole (Pitfall 1), in-memory queue loss, Firestore-as-UI-source.

### Phase 4: Hidden admin + deck pipeline
**Rationale:** Content pipeline unlocks deck authoring; reuses schema module (Phase 1) and sync path (Phase 3).
**Delivers:** Easter-egg gate + code→claim UI, deck/card CRUD, versioned JSON export/import with per-row error report + coverage check + audio-existence check, round-trip CI test.
**Addresses:** Hidden admin, JSON import/export, starter-deck authoring, HSK tags.
**Avoids:** Schema drift (Pitfall 8), client-only admin gate, silent import drops.

### Phase 5: Writing quiz + TTS audio
**Rationale:** Top differentiator #1 (medium cost) + audio tier that tone side depends on; both need the cache budget from Phase 1.
**Delivers:** hanzi-writer wrapper (offline-bundled top-N strokes, fallback free-draw, leniency setting), ARPHICPL.TXT + attribution, 3-tier TTS (Storage MP3 → cache → speechSynthesis hardened fallback), low-bitrate mono MP3s, 3-platform audio matrix pass.
**Addresses:** Stroke quiz, native audio + TTS fallback, tone-side playback.
**Avoids:** CDN-offline break + license violation (Pitfall 4), TTS inconsistency (Pitfall 5), cache budget blowup (Pitfall 9).

### Phase 6: Mic tone-contour trainer (flagship follow-up)
**Rationale:** Highest value + highest risk; deliberately last so it cannot block core SRS value. Requires research spike BEFORE UI commitment.
**Delivers:** Research spike (validate pitchy MPM vs YIN/pYIN on target phones with ni3/ma1 samples) → worklet capture → pitch → speaker-relative normalize → DTW/correlation vs templates → throttled canvas graph → calibration + "test mic" screen + noise state.
**Addresses:** Mic tone trainer differentiator; drill-weak-tones loop.
**Avoids:** Octave/noise useless feedback (Pitfall 6), canvas jank (Pitfall 7), mic-upload privacy violation, absolute-pitch scoring.

### Phase Ordering Rationale

- Dependency order: store → review → sync → admin → writing/audio → tone (each layer demoable offline before next is added; ARCHITECTURE.md §Build Order).
- Risk order: uncertain pitch estimator + iOS mic fragility isolated last; locked rules placed before any deploy (breach cost HIGH, recovery HIGH).
- Grouping: writing + TTS share the audio/cache boundary and the tone-side dependency (TTS target playback required before mic attempt); admin + import/export share schema + sync path.
- Scheduler decision: ts-fsrs from day one (not SM-2-then-migrate) because mid-stream rewrite invalidates intervals — FEATURES.md's SM-2-first suggestion is overruled, FSRS weight-tuning deferred to v2+ instead.

### Research Flags

Phases likely needing deeper research during planning (`/gsd-research-phase`):
- **Phase 6 (tone trainer):** pitch-estimator choice is LOW confidence (training knowledge only) — spike must measure YIN vs MPM vs pYIN/SWIPE on real phones (Tone-3 creak, noisy mic), plus iOS PWA `getUserMedia`-in-gesture + permission-recovery flow. Also validate samueleddy.com audio-session claims (single field source).
- **Phase 5 (TTS):** iOS SpeechSynthesis bugs are version-specific converging reports (MEDIUM) — re-verify on current iOS with real iPhone PWA test; confirm offline zh voice availability to size MP3-vs-TTS split.
- **Phase 1 (offline):** iOS quota/eviction numbers (~50 MB, 7-day) from multiple converging community sources (MEDIUM) — validate with storage-estimate test on target devices; affects audio budget math.
- **Phase 4 (admin rules):** custom-claim-via-Cloud-Function pattern is standard but instance-specific — verify against current Firebase docs during planning.

Phases with standard patterns (skip research-phase):
- **Phase 2 (review/SRS):** ts-fsrs API (`repeat`/`next`) verified HIGH against repo; Anki SM-2 guardrails documented HIGH. Pure-module pattern, Vitest-tested.
- **Phase 3 (sync):** push-then-pull + Dexie + `persistentLocalCache` verified HIGH/MEDIUM across 3 corroborating sources; no CRDTs needed (single-learner decision tree).
- **Phase 5 (writing):** hanzi-writer quiz API verified HIGH against official docs; self-host + cache pattern standard.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All versions verified via npm registry + Firebase release notes; only TS-7 pin rationale is judgment (MEDIUM) |
| Features | MEDIUM | Official docs + multiple 2026 reviews agree; no API-level research needed; HSK 3.0 level mapping LOW — validate deck tags against official lists |
| Architecture | MEDIUM-HIGH | HIGH on PWA/data/scheduler/handwriting layers (official docs + repos); LOW on pitch-estimator choice — flagged spike |
| Pitfalls | MEDIUM | Rules + SM-2 + hanzi-writer license verified HIGH (official/authoritative); iOS quotas, TTS quirks, pitch heuristics from converging community sources |

**Overall confidence:** MEDIUM-HIGH — build order and stack are solid; risk concentrates in Phase 6 (pitch) and iOS-specific behaviors.

### Gaps to Address

- Pitch-estimator selection (YIN vs MPM vs pYIN): handle via Phase 6 research spike with on-device measurement before UI work — keep `estimatePitch(frame): Hz | null` seam narrow so algorithm swaps cleanly.
- iOS PWA field behaviors (mic gesture requirement, audio-session demotion, storage persist guarantees, current-TTS bugs): handle via real-device acceptance matrix (iOS Safari PWA / Android Chrome PWA / desktop) in Phases 1, 5, 6 — do not trust docs alone.
- HSK 3.0 (2026) tag mapping: validate starter-deck tags against official word lists during Phase 4 content work.
- TS 5.9 vs 7.0.2: Phase 0 spike — attempt build on 7, fall back to pinned 5.9 on any plugin/hook type failure.
- "Looks done but isn't" checklist (PITFALLS.md) should become per-phase exit gates during roadmap creation.

## Sources

### Primary (HIGH confidence)
- npm registry: vite 8.3.0, vite-plugin-pwa 1.3.0 (Workbox 7.4.1), react 19.3.0, firebase 12.18.0, dexie 4.4.5, ts-fsrs 5.4.2, hanzi-writer 3.7.3, pitchy 4.1.0, meyda 5.6.3, uplot 1.6.32 — version verification
- firebase.google.com release notes + Firestore docs (offline `persistentLocalCache`, insecure-rules guide, rules structure)
- open-spaced-repetition/ts-fsrs repo (793★, FSRS v6, `repeat`/`next` API)
- hanziwriter.org docs + chanind/hanzi-writer README (quiz API, Make-Me-a-Hanzi lineage, Arphic license)
- Anki Manual + SM-2 spec (scheduling guardrails, revlog, sync model)
- Pleco product pages + Android flashcard manual (test modes, stroke order, tone practice)

### Secondary (MEDIUM confidence)
- OpenReplay / APIScout / youngju.dev 2026 offline-first guides (3-layer model, queue-in-IDB, field-LWW, Dexie-vs-idb decision tree)
- HelloChinese / Du Chinese 2026 feature reviews (SRS, study goals, native audio, offline tiers)
- Yutone / MandaTone / TonePerfect / Pure Language Tone Mirror (contour-normalize, shape-not-size scoring)
- iOS PWA limits (magicbell, firt.dev, hashhackers/vinova.sg — quota, eviction, no Background Sync)
- Firebase anon-auth rules abuse reports (Valtik, UnboundCompute, CloudThinker, app369 — converging)
- TTS iOS bug threads (SO iOS 17/26, Apple Dev Forums) + samueleddy.com audio-session field guide (single source)
- Pitch-detection practice (DEV YIN walkthrough, erhu-tuner, SeePitch, pitch-detector repo) + canvas perf guides (DPR-squared cost, throttle patterns)

### Tertiary (LOW confidence)
- Pitch-estimator final choice — no verified current source; needs Phase 6 spike
- iOS 26 SpeechSynthesis `<...>` hang — single SO thread; re-verify on device
- Exact HSK 3.0 level mapping for deck tags — validate against official lists

---
*Research completed: 2026-09-19*
*Ready for roadmap: yes*
