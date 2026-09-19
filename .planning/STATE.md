# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-09-19)

**Core value:** Retention via 4-prompt recall works offline on a phone.
**Current focus:** Phase 1 PWA Shell (plan 2 of 3 done)

## Current Position

Phase: 1 of 11 (01-pwa-shell, 2/3 plans complete)
Plan: 2 of 3 in current phase
Status: 01-02 complete, ready for 01-03
Last activity: 2026-09-19 — 01-02 install UX + update flow complete (central register module + 4 components, 2 min)

Progress: [█░░░░░░░░░] 3%

## Performance Metrics

**Velocity:**
- Total plans completed: 1
- Average duration: 6 min
- Total execution time: 6 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-pwa-shell | 1 | 6 min | 6 min |

**Recent Trend:**
- Last 5 plans: 01-01 (6 min)
- Trend: on pace

*Updated after each plan completion*
| Phase 01-pwa-shell P01 | 6min | 2 tasks | 24 files |
| Phase 01-pwa-shell P02 | 2 min | 2 tasks | 7 files |

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

### Pending Todos

None yet.

### Blockers/Concerns

- Tone pitch-estimator choice unresolved until Phase 10 spike (YIN vs MPM vs pYIN on real phones)
- iOS PWA behaviors (quota/eviction, mic gesture, TTS quirks) need real-device matrix in Phases 1, 9, 10 — docs not trusted alone
- HSK 3.0 tag mapping to validate against official lists during Phase 2/7 content work

## Session Continuity

Last session: 2026-09-19
Stopped at: Completed 01-pwa-shell-02-PLAN.md
Resume file: None
