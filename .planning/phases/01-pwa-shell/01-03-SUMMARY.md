---
phase: 01-pwa-shell
plan: "03"
subsystem: pwa
tags: [firebase, lighthouse, workbox, offline, installability]

# Dependency graph
requires:
  - phase: 01-pwa-shell/01
    provides: VitePWA scaffold, manifest, offline fallback precache, SW lifecycle events
  - phase: 01-pwa-shell/02
    provides: Install UX (iOS hint + Chromium button), update banner, central SW registration
provides:
  - Firebase Hosting header layering with SW no-cache after wildcard immutable
  - Vercel headers equivalent for PWA on Vercel hosting
  - Lighthouse CI gate asserting PWA category >= 0.9, works-offline, installable-manifest
  - OfflineStatus component reacting to navigator.onLine events
  - Real-device install matrix verified (iOS + Android)
affects: [01-pwa-shell]

# Tech tracking
tech-stack:
  added: [lighthouse@11, serve]
  patterns: [header layering order (wildcard first, SW last), Lighthouse CI assertions in CI pipeline, offline indicator via native online/offline events]

key-files:
  created:
    - firebase.json
    - .firebaserc
    - lighthouserc.json
    - vercel.json
    - src/components/OfflineStatus.tsx
  modified:
    - src/App.tsx
    - package.json

key-decisions:
  - "Firebase Hosting header order: wildcard immutable first, then /sw.js no-cache, /manifest.webmanifest no-cache, **/*.html no-cache (last match wins per firebase-tools #8917)"
  - "Vercel.json mirrors Firebase headers for dual hosting strategy (Firebase preview + Vercel preview)"
  - "OfflineStatus uses native navigator.onLine + online/offline event listeners (no custom heartbeat per RESEARCH Don't Hand-Roll)"
  - "Lighthouse CI runs against served dist on port 4173 with assertions: pwa category >=0.9, works-offline error, installable-manifest error"
  - "User approved real-device install matrix on Vercel preview; firebase.json retained for potential Firebase preview-channel deploy"

patterns-established:
  - "Header layering order is load-bearing: SW/manifest/HTML no-cache MUST come after wildcard immutable rule"
  - "Lighthouse CI audit runs locally via npm script before any deploy"
  - "Offline indicator component is small, accessible (role=status, aria-live=polite), auto-dismissing 'Back online' toast"

requirements-completed:
  - OFFLINE-01
  - OFFLINE-03

# Metrics
duration: 23 min
completed: 2026-09-19
---

# Phase 01 Plan 03: PWA Hosting Headers + Lighthouse CI Gate + Real-Device Install Verification

**Firebase Hosting + Vercel header layering with correct SW no-cache ordering; Lighthouse CI gate passing works-offline + installable-manifest; OfflineStatus indicator; real-device iOS + Android install confirmed on Vercel preview**

## Performance

- **Duration:** 23 min
- **Started:** 2026-09-19T12:27:00Z (approx)
- **Completed:** 2026-09-19T12:50:24Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments

- Firebase Hosting config with correct header layering order (wildcard immutable first, SW/manifest/HTML no-cache after)
- Vercel.json headers mirroring Firebase config for dual-hosting preview strategy
- Lighthouse CI configuration with pwa category >=0.9, works-offline, and installable-manifest assertions
- OfflineStatus component with accessible badge toggling on native connectivity events
- Lighthouse PWA audit passing locally: score 1.0, all audits green (installable-manifest, splash-screen, maskable-icon, themed-omnibox, content-width)
- Real-device install verified on iOS Safari (Share → Add to Home Screen) and Android Chrome (install prompt) against Vercel preview deployment

## Task Commits

Each task was committed atomically:

1. **Task 1: Firebase Hosting config + offline status indicator** - `ce23040` (feat)
2. **Task 2: Lighthouse CI gate + local offline/precache checks** - `dd52dbc` (feat)
3. **Task 3: Real-device install matrix verification** - `4b24172` (feat) — vercel.json headers added per user feedback
4. **Plan metadata:** `TBD` (docs: complete plan)

## Files Created/Modified

- `firebase.json` - Firebase Hosting config: public dist, SPA rewrite, header layering with SW no-cache after wildcard immutable
- `.firebaserc` - Placeholder Firebase project (chanki-dev-placeholder)
- `lighthouserc.json` - Lighthouse CI config asserting PWA category, works-offline, installable-manifest
- `vercel.json` - Vercel headers + rewrite mirroring Firebase for Vercel preview deployments
- `src/components/OfflineStatus.tsx` - Online/offline badge using navigator.onLine + online/offline event listeners
- `src/App.tsx` - Added OfflineStatus to header
- `package.json` - Added pwa:audit script running Lighthouse against served dist

## Decisions Made

- Firebase Hosting header order follows firebase-tools #8917: last match wins, so SW/manifest/HTML no-cache rules placed after wildcard immutable rule
- Vercel.json added after user feedback to replace firebase.json for Vercel preview (dual-hosting strategy retained both)
- OfflineStatus uses native navigator.onLine + online/offline events (no custom ping/heartbeat per RESEARCH.md "Don't Hand-Roll")
- Lighthouse CI runs locally against `npx serve dist -l 4173` with assertions at error level for works-offline and installable-manifest
- Real-device verification completed on Vercel preview URL; user confirmed iOS + Android install from home screen works

## Deviations from Plan

### Auto-fixed Issues

None - plan executed exactly as written.

---

**Total deviations:** 0 auto-fixed
**Impact on plan:** Plan executed exactly as specified. The addition of vercel.json was a user-directed enhancement during the checkpoint, not a deviation.

## Issues Encountered

None — all automated verifications passed (header order assertion, TypeScript compilation, build, Lighthouse audit). Human verification checkpoint approved with device results.

## User Setup Required

None - no external service configuration required. Firebase project ID (chanki-dev-placeholder) is a placeholder; user will provide real project ID if deploying to Firebase.

## Next Phase Readiness

- PWA Shell phase complete: all 3 plans done (01-01 foundation, 01-02 install/update UX, 01-03 hosting/verification)
- Ready for Phase 2: Data Contract (Dexie store, card schema, device identity, starter deck)
- Requirements OFFLINE-01 and OFFLINE-03 fully satisfied: installable shell, offline fallback, update prompt, correct headers, Lighthouse gate, device matrix verified

---

*Phase: 01-pwa-shell*
*Completed: 2026-09-19*