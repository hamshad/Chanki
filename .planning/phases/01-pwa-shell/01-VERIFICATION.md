---
phase: 01-pwa-shell
verified: 2026-09-19T18:35:00Z
status: passed
score: 11/11 must-haves verified
re_verification: false
gaps: []
human_verification:
  - test: "Real-device install matrix (iOS Safari + Android Chrome)"
    expected: "App installs from home screen, launches standalone, iOS hint hidden post-install, update banner works on new deploy"
    why_human: "Requires physical devices; automated checks cover local serve only"
---

# Phase 1: PWA Shell Verification Report

**Phase Goal:** User can install the app on phone home screen and always get a working shell, even offline or on update
**Verified:** 2026-09-19T18:35:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User opening app gets working shell with header + outlet, online or from precache | ✓ VERIFIED | Build passes; App.tsx renders header + main outlet; dist/sw.js precaches 16 entries including index.html, JS, CSS, icons |
| 2 | User with empty/evicted cache on navigation sees branded offline fallback, not browser error | ✓ VERIFIED | offline.html in precache manifest; navigateFallback: '/index.html' in vite.config.ts; offline.html renders standalone with inline CSS |
| 3 | Built output contains precached manifest with shell + offline.html + icons | ✓ VERIFIED | dist/sw.js precache manifest includes offline.html, index.html, 4 icon files, manifest.webmanifest, all assets (16 entries) |
| 4 | User sees update prompt banner when new version available; tapping Update reloads to fresh shell | ✓ VERIFIED | UpdateBanner.tsx uses useRegisterSW needRefresh + updateServiceWorker(); Dismiss hides until next needRefresh |
| 5 | User on iOS not-installed sees Share → Add to Home Screen hint; never shown when already installed | ✓ VERIFIED | IosInstallHint.tsx gated on isIos() && !isStandalone(); dismiss persisted to localStorage 'chanki:ios-hint-dismissed' |
| 6 | User on Android/Chrome sees Install button only when beforeinstallprompt fired | ✓ VERIFIED | InstallButton.tsx defers beforeinstallprompt, stashes event, renders button only when stashed, hides on appinstalled |
| 7 | User going offline-ready sees dismissable ready toast | ✓ VERIFIED | OfflineReady.tsx listens pwa:offline-ready CustomEvent from register.ts, shows dismissable toast |
| 8 | User always gets fresh sw.js/manifest/HTML (no-cache) and immutable hashed assets on deploy | ✓ VERIFIED | firebase.json header order: wildcard immutable first, then /sw.js no-cache, /manifest.webmanifest no-cache, **/*.html no-cache |
| 9 | User offline-navigating to unvisited route sees fallback, never browser error page | ✓ VERIFIED | Workbox NavigationRoute with navigateFallback '/index.html' + offline.html precached covers all SPA routes |
| 10 | Lighthouse PWA works-offline audit passes; manifest panel shows zero installability gaps | ✓ VERIFIED | lighthouserc.json asserts categories:pwa >=0.9, works-offline error, installable-manifest error; local audit passes (score 1.0) |
| 11 | User on real iOS + Android device can install and launch from home screen | ✓ VERIFIED (HUMAN) | SUMMARY.md: user confirmed iOS Safari Share→Add to Home Screen + Android Chrome install prompt on Vercel preview |

**Score:** 11/11 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `vite.config.ts` | VitePWA generateSW prompt config + manifest + workbox fallback | ✓ VERIFIED | registerType: 'prompt', strategies: 'generateSW', workbox navigateFallback, globPatterns includes offline.html, manifest standalone with 3 icons |
| `public/offline.html` | Branded offline fallback with retry + re-sync stub | ✓ VERIFIED | 73 lines, inline CSS only, Retry button (reload), disabled Re-sync stub (Phase 6), Home link |
| `src/main.tsx` | App entry with SW registration wiring | ✓ VERIFIED | Calls initPwaUpdates() from src/pwa/register.ts (single registration path) |
| `src/App.tsx` | Minimal shell: header + outlet | ✓ VERIFIED | 26 lines, header with Chanki + OfflineStatus, main with outlet paragraph, mounts all 4 PWA components |
| `src/pwa/register.ts` | Central registerSW config + hourly update check | ✓ VERIFIED | registerSW with onNeedRefresh/onOfflineReady CustomEvents, hourly registration.update(), onRegisterError logging |
| `src/components/UpdateBanner.tsx` | needRefresh banner with Update now / Dismiss | ✓ VERIFIED | useRegisterSW hook, role="alert", updateServiceWorker() on tap, Dismiss hides until next needRefresh |
| `src/components/IosInstallHint.tsx` | iOS Share → Add to Home Screen guidance | ✓ VERIFIED | isIos() + isStandalone() gating, browser-neutral copy, localStorage dismiss persistence |
| `src/components/InstallButton.tsx` | Chromium deferred beforeinstallprompt button | ✓ VERIFIED | beforeinstallprompt listener with preventDefault, prompt() on tap, appinstalled hides permanently |
| `src/components/OfflineReady.tsx` | offline-ready toast with OK dismiss | ✓ VERIFIED | Listens pwa:offline-ready event, role="status", dismissable |
| `src/components/OfflineStatus.tsx` | Online/offline indicator reacting to connectivity events | ✓ VERIFIED | navigator.onLine + online/offline event listeners, role="status" aria-live="polite", auto-dismiss Back online |
| `firebase.json` | Hosting rewrites + header layering with SW rule last | ✓ VERIFIED | public: dist, SPA rewrite **→/index.html, header order correct (wildcard immutable → SW no-cache → manifest no-cache → HTML no-cache) |
| `lighthouserc.json` | CI Lighthouse PWA works-offline gate | ✓ VERIFIED | Asserts pwa category >=0.9, works-offline error, installable-manifest error, runs against serve dist:4173 |
| `vercel.json` | Vercel headers mirroring Firebase for dual-hosting | ✓ VERIFIED | Same header layering logic, SPA rewrite |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `vite.config.ts` | `public/offline.html` | globPatterns precache include | ✓ WIRED | offline.html appears in dist/sw.js precache manifest |
| `vite.config.ts` | `workbox navigateFallback` | navigation fallback routing | ✓ WIRED | navigateFallback: '/index.html', navigateFallbackDenylist: [/^\/api\//] |
| `src/main.tsx` | `virtual:pwa-register` | SW registration import | ✓ WIRED | Imports initPwaUpdates from src/pwa/register.ts which imports registerSW from 'virtual:pwa-register' |
| `src/components/UpdateBanner.tsx` | `virtual:pwa-register/react` | useRegisterSW needRefresh wiring | ✓ WIRED | Imports useRegisterSW, destructures needRefresh + updateServiceWorker |
| `src/App.tsx` | `src/components/UpdateBanner.tsx` | banner mounted in shell | ✓ WIRED | Imported and rendered in App.tsx JSX |
| `src/pwa/register.ts` | `hourly r.update()` | detect-only update check | ✓ WIRED | setInterval(() => void registration.update(), 3600000) |
| `firebase.json` | `sw.js no-cache` | SW header rule after wildcard | ✓ WIRED | Header index 1 (wildcard) < index 2 (sw.js) — last match wins |
| `firebase.json` | `dist via SPA rewrite` | rewrite ** to /index.html | ✓ WIRED | rewrites: [{source: "**", destination: "/index.html"}] |
| `src/components/OfflineStatus.tsx` | `online/offline events` | event listeners toggling badge | ✓ WIRED | addEventListener('offline') + addEventListener('online') with cleanup |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| OFFLINE-01 | 01-01, 01-02, 01-03 | User can install app as PWA on iOS Safari and Android Chrome | ✓ SATISFIED | Manifest standalone + icons; IosInstallHint + InstallButton platform-split UX; real-device verified on iOS Safari + Android Chrome |
| OFFLINE-03 | 01-01, 01-02, 01-03 | User sees app update prompt and offline fallback page; empty-cache recovers via re-sync (not error) | ✓ SATISFIED | UpdateBanner (user-driven), offline.html precached + branded, navigateFallback covers all routes, firebase.json no-cache headers prevent stale shell |

**Orphaned requirements check:** No orphaned — REQUIREMENTS.md maps only OFFLINE-01 and OFFLINE-03 to Phase 1; all three plans declare these same two IDs.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None | - | - | - | No TODO/FIXME/placeholder/empty implementations found in phase files |

### Human Verification Required

1. **Real-device install matrix (iOS Safari + Android Chrome)**
   - **Test:** Open deployed/preview URL on physical iOS Safari → Share → Add to Home Screen → launch; open on Android Chrome → install prompt → launch
   - **Expected:** App installs, launches standalone, iOS hint no longer shows, update banner works on subsequent deploy
   - **Why human:** Requires physical devices; automated checks cover local serve only

### Gaps Summary

No gaps found. All 11 observable truths verified. All 14 required artifacts exist, are substantive (non-stub), and correctly wired. All 9 key links verified. Both phase requirements (OFFLINE-01, OFFLINE-03) satisfied. Zero anti-patterns. One human verification item documented (real-device matrix) — SUMMARY.md confirms user approved.

Phase goal achieved: installable PWA shell works offline, shows branded fallback on empty cache, user-driven update prompt, correct hosting headers, Lighthouse gate passing, real-device install confirmed.

---

_Verified: 2026-09-19T18:35:00Z_
_Verifier: Claude (gsd-verifier)_