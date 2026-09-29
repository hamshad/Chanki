# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-09-24)

**Core value:** Retention via 4-prompt recall works offline on a phone.
**Current focus:** v1 code-complete — real-device verification pass

## Current Position

Phase: 11 of 11 complete — all planned phases done
Plan: 11-01-PLAN.md (done)
Status: Phases 1–11 complete — all 31 v1 requirements implemented; device-matrix sign-off outstanding
Last activity: 2026-09-29 — Phase 11 complete: /tone trainer with live rAF canvas contour, divergence zone + hints, useToneCapture hook shared with spike

Progress: [████████████] 100% (code); device verification pending

## Performance Metrics

**Velocity:**
- Total plans completed: 3 (Phase 1) + 4 (Phase 2) + 3 (Phase 3 equivalent) = 10
- Average duration: ~10 min
- Total execution time: ~60 min estimated

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-pwa-shell | 3 | 31 min | 10 min |
| 02-data-contract | 4 | ~20 min | ~5 min |
| 03-review-ui | 3 (est.) | ~15 min | ~5 min |

**Recent Trend:**
- Last 5 plans: 01-03 (23 min), 02-01 through 02-04 + 03 (interrupted session)
- Trend: on pace

*Updated after each plan completion*
| Phase 01-pwa-shell P01 | 6min | 2 tasks | 24 files |
| Phase 01-pwa-shell P02 | 2 min | 2 tasks | 7 files |
| Phase 01-pwa-shell P03 | 23 min | 3 tasks | 7 files |
| Phase 02-data-contract P01-P04 | ~20 min | 10 tasks | 20 files |
| Phase 03-review-ui | ~15 min | 6 tasks | 8 files |
| Phase 04-srs-engine | ~20 min | 3 tasks | 4 files |
| Phase 05-grading-session | ~15 min | 4 tasks | 4 files |
| Phase 06-sync-rules | ~20 min | 4 tasks | 5 files |
| Phase 07-admin-deck | ~15 min | 4 tasks | 3 files |
| Phase 08-writing-trainer | ~20 min | 3 tasks | 3 files |
| Phase 10-tone-spike | ~45 min | 4 tasks | 6 files |
| Phase 11-tone-trainer-ui | ~35 min | 5 tasks | 7 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: ts-fsrs from day one behind Scheduler interface (no SM-2-then-migrate)
- [Roadmap]: Tone trainer isolated last (Phase 10 spike → Phase 11 UI) so risk never blocks core SRS
- [Roadmap]: OFFLINE-02 verified in Phase 9 after writing + audio exist (full-loop airplane test)
- [01-01]: SW lifecycle reaches React via pwa:need-refresh / pwa:offline-ready CustomEvents (Plan 02 consumes)
- [01-01]: OFFLINE-01/OFFLINE-03 stay open until 01-02 UX + 01-03 hosting verification land
- [01-02]: Single registration path in src/pwa/register.ts; UpdateBanner via useRegisterSW, OfflineReady via CustomEvent
- [01-02]: Plan verify regex for forced activation false-positives on Workbox on-demand SKIP_WAITING listener — refined check is source of truth
- [01-02]: OFFLINE-01/OFFLINE-03 boxes left unchecked (consistent with 01-01): client UX done, hosting + device verification pending 01-03
- [01-03]: Firebase Hosting header order: wildcard immutable first, SW/manifest/HTML no-cache after (last match wins per firebase-tools #8917)
- [01-03]: Vercel.json mirrors Firebase headers for dual-hosting preview strategy
- [01-03]: OfflineStatus uses native navigator.onLine + online/offline events (no custom heartbeat per RESEARCH Don't Hand-Roll)
- [01-03]: Lighthouse CI runs locally against served dist with pwa>=0.9, works-offline error, installable-manifest error assertions
- [01-03]: Real-device install matrix verified on iOS Safari + Android Chrome against Vercel preview; OFFLINE-01/OFFLINE-03 satisfied
- [02-01]: Zod schemas are single source of truth; CardSchema uses .strict() + ToneEnum z.enum(['1'-'5']); compound index [cardId+deviceId] on progress
- [02-02]: device-id uses crypto.randomUUID() stored in meta table; seed fetches JSON via fetch() (not Vite import) to avoid bundle bloat
- [02-03]: hsk1-starter.json has 150 HSK 2.0 cards; vite.config.ts uses CacheFirst for audio with maximumFileSizeToCacheInBytes: 50MB
- [02-04]: main.tsx bootstrap: assertV1Schema → getOrCreateDeviceId → seedStarterDeckIfNeeded → React mount; error shows fallback div
- [03]: useCardFlip picks random prompt side on init; REVEAL_SEQUENCES maps prompt→reveal order; isFullyRevealed gates next-card action
- [03]: CardSide uses AnimatePresence/motion.div for entrance animations; ToneText applies --tone-N CSS var color + hanzi-text class
- [04]: ts-fsrs integrated through IScheduler; Progress schema updated with state, learning_steps, and sideHistory. GradingButtons component displays preview intervals.
- [05]: ReviewSession updated to handle queue of cards. Failed cards (rated 'Again') are re-queued to retry in-session. SessionSummary added with dynamically calculated next due information.
- [06]: Firebase sync configured in `sync.ts` using background push/pull. Device ID (UUID) is used as bearer token since there is no login. `firestore.rules` implemented to deny public writes to admin collections while permitting device-specific reads/writes. `SyncStatusBadge` component built to display UI indicators.
- [07]: Hidden Admin gate implemented in `App.tsx` (7 rapid clicks on header title + code). `AdminDashboard` built to support complete CRUD for decks/cards, complete with versioned JSON export/import pipelines leveraging Zod for row-by-row validation.
- [08]: Integrated `hanzi-writer` to power the `WritingPad` component. Created local script to bundle offline data for all starter deck characters. Connected writing events directly into the `CardView` so users can seamlessly 'Practice Writing' with real-time feedback prior to completing a card.
- [10]: pitchy (MPM) chosen over YIN — bench: 0.08 vs 0.59 ms/frame, ni3 median error 1.1–2.0 vs 9.3–11.5 cents, zero octave errors (`scripts/tone-bench.mjs`, `npm run tone:bench`)
- [10]: `calculateToneScore` uses only difference metrics (span/delta/dip depth) on a semitone track → scale- and offset-invariant; calibrated base passed as 3rd optional arg
- [10]: `analyzeCapture` classifies frames voiced/noise/silence → `ok | noisy | silence | too-short` + median voiced base for calibration
- [10]: ToneSpike harness lives at hidden route `/tone-spike`; stops MediaStream tracks + AudioContext on every teardown (no stuck mic indicator)
- [10]: TONE-03 enforced by static test `tone-privacy.test.ts` (no fetch/XHR/beacon/WebSocket/localStorage in capture path) + manual DevTools network check
- [11]: Contours compared time-normalized (64 steps) with onset-offset alignment — shape only, never absolute Hz; worst third (start/mid/end) drives the divergence hint
- [11]: `useToneCapture` hook extracted from ToneSpike — single mic pipeline (getUserMedia → AnalyserNode → rAF → pitchy) shared by /tone-spike and /tone
- [11]: ToneContour canvas redraws from the mutable framesRef every rAF (no React re-render per frame); latency = 46ms window + ~16ms rAF + 0.08ms MPM ≈ 63ms < 100ms budget
- [11]: Target templates are semitone trajectories per tone (tone 3: 0 → −4 → +2), defined once in `targetTrajectory`

### Pending Todos

None.

### Blockers/Concerns

- Tone pitch-estimator choice RESOLVED (Phase 10): pitchy MPM wins bench; YIN kept as documented fallback if real-phone Tone 3 creak breaks MPM
- iOS/Android PWA mic matrix still pending manual run of `/tone-spike` and `/tone` (see device table in tone-spike-report.md) — TONE-01/02/03 signed off in code, device pass outstanding
- Phase 11 latency budget met by design (≈63ms pipeline, 60fps rAF draw) but 60fps on low-end phones unmeasured — verify during device pass
- HSK 3.0 tag mapping to validate against official lists during Phase 2/7 content work

## Session Continuity

Last session: 2026-09-29
Stopped at: Phase 11 complete — all v1 phases done
Resume file: none pending (v1 roadmap closed)
Next: manual device matrix for /tone + /tone-spike, then v2 requirements or release
