---
phase: 01-pwa-shell
plan: "02"
subsystem: pwa
tags: [vite-plugin-pwa, workbox, service-worker, beforeinstallprompt, ios, install-ux]

# Dependency graph
requires:
  - phase: 01-pwa-shell plan 01
    provides: [generateSW shell + manifest + offline fallback, inline registerSW CustomEvent bridge in main.tsx]
provides:
  - Central initPwaUpdates() registration module with hourly detect-only update check
  - UpdateBanner (needRefresh prompt) + OfflineReady toast wired into App shell
  - Platform-split install UX: iOS Share hint + Chromium deferred install button
affects: [01-pwa-shell plan 03 hosting verification, install UX iteration, review UI]

# Tech tracking
tech-stack:
  added: []
  patterns: [single registration module re-exported from main entry, useRegisterSW hook for update state + CustomEvent bridge for offline-ready, platform-split install UX with standalone suppression]

key-files:
  created: [src/pwa/register.ts, src/components/UpdateBanner.tsx, src/components/OfflineReady.tsx, src/components/IosInstallHint.tsx, src/components/InstallButton.tsx]
  modified: [src/main.tsx, src/App.tsx]

key-decisions:
  - "Refactored Plan 01 inline registerSW into src/pwa/register.ts single path instead of keeping two"
  - "Corrected plan verify regex: Workbox on-demand SKIP_WAITING listener is required, not forced activation"

patterns-established:
  - "All SW lifecycle wiring lives in src/pwa/register.ts; React consumes via useRegisterSW (update state) or pwa:* CustomEvents (offline-ready)"
  - "Install UI renders nothing by default; each platform path opts in only on its signal"

requirements-completed: [OFFLINE-01, OFFLINE-03]

# Metrics
duration: 2min
completed: 2026-09-19
---

# Phase 01 Plan 02: Install UX + Update Flow Summary

**User-driven update banner + offline-ready toast on central registration module, with iOS Share hint and deferred Chromium install button**

## Performance

- **Duration:** 2 min
- **Started:** 2026-09-19T07:30:12Z
- **Completed:** 2026-09-19T07:31:40Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- `initPwaUpdates()` central module: needRefresh/offline-ready CustomEvents, hourly detect-only `r.update()`, register error logging
- UpdateBanner renders role="alert" prompt with Update now (applies waiting SW) and Dismiss (hides until next refresh signal)
- OfflineReady toast appears on `pwa:offline-ready` with OK dismiss
- IosInstallHint shows browser-neutral Share → Add to Home Screen → Add copy only on iOS non-standalone, dismiss persisted to localStorage
- InstallButton defers beforeinstallprompt, prompts on tap, clears stash on any outcome, hides permanently on appinstalled
- Prod build clean (26 modules, 16 precache entries); tsc passes; sw.js free of forced activation

## Task Commits

Each task was committed atomically:

1. **Task 1: Central registration module + update/offline-ready UI** - `bff1b37` (feat)
2. **Task 2: Platform-split install UX (iOS hint + Chromium button)** - `720832d` (feat)

**Plan metadata:** _pending final docs commit_

## Files Created/Modified

- `src/pwa/register.ts` - initPwaUpdates(): event bridge + hourly detect-only update check (created)
- `src/components/UpdateBanner.tsx` - needRefresh banner with Update now / Dismiss (created)
- `src/components/OfflineReady.tsx` - offline-ready toast with OK dismiss (created)
- `src/components/IosInstallHint.tsx` - iOS-only install guidance with persisted dismiss (created)
- `src/components/InstallButton.tsx` - deferred beforeinstallprompt button (created)
- `src/main.tsx` - Single registration path via initPwaUpdates() (modified)
- `src/App.tsx` - Mounts all four PWA components in shell (modified)

## Decisions Made

- Moved Plan 01's inline registerSW block into `src/pwa/register.ts` rather than keeping both: plan allowed either, single module avoids duplicate registration paths. Behavior identical (same events, same hourly check).
- UpdateBanner consumes update state via `useRegisterSW` hook while OfflineReady consumes the CustomEvent bridge: hook gives reactive needRefresh + updateServiceWorker() directly; event bridge covers the fire-once offline toast without a second hook instance.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Plan verify regex false-positived on Workbox standard listener**
- **Found during:** Task 1 (verification step)
- **Issue:** Plan's check `/skipWaiting|clientsClaim/` against dist/sw.js fails on stock Workbox generateSW output: `self.addEventListener("message",e=>{e.data&&"SKIP_WAITING"===e.data.type&&self.skipWaiting()})`. That listener only activates on explicit client message (what updateServiceWorker() sends) — it is the mechanism user-driven update depends on, not forced activation. No `clientsClaim` anywhere; the single `skipWaiting` occurrence sits inside the gated listener.
- **Fix:** Verified with refined check: zero `clientsClaim`, and `skipWaiting` present only inside the on-demand SKIP_WAITING message listener. Also confirmed `updateServiceWorker(true)` never called and hourly check calls only `r.update()`.
- **Files modified:** None (verification-only; no source change needed)
- **Verification:** Refined node check prints "no forced activation OK"; build + tsc pass
- **Committed in:** N/A (no code change; Task 1 commit `bff1b37`)

---

**Total deviations:** 1 auto-fixed (1 blocking verification correction)
**Impact on plan:** No scope change. Source matches plan exactly; only the pass/fail interpretation of generated SW output was corrected.

## Issues Encountered

- Mid-edit import slip in App.tsx (replaced OfflineReady import instead of adding alongside) — caught immediately on file read, corrected in same task before build. No commit impact.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Ready for 01-03 (hosting header rules + install/update verification on deploy).
- OFFLINE-01/OFFLINE-03 remain open per 01-01 status until 01-03 hosting verification lands; client-side UX for both is now complete.
- Note: `requirements mark-complete` was run per workflow but reverted — checking the boxes now would contradict 01-01's standing decision (hosting + device verification pending). 01-03 marks them when deploy verification passes.
- Real-device matrix still needed: iOS hint copy, beforeinstallprompt timing, and update banner flow should be checked on physical iOS Safari + Android Chrome per STATE.md concerns.

---
*Phase: 01-pwa-shell*
*Completed: 2026-09-19*

## Self-Check: PASSED

- All 5 created files + SUMMARY.md exist on disk; task commits `bff1b37` and `720832d` verified in git log.
