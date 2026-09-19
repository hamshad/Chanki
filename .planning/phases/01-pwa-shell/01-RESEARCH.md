# Phase 1: PWA Shell - Research

**Researched:** 2026-09-19
**Domain:** Offline-first PWA shell (Vite + Workbox service worker, installability, update flow, offline fallback)
**Confidence:** HIGH (stack/patterns verified against official docs + npm; MEDIUM on iOS eviction numbers)

## Summary

Phase 1 builds the installable, offline-capable app shell on an empty greenfield repo: Vite + React + TS scaffold, `vite-plugin-pwa` generating manifest + Workbox service worker, an explicit user-visible update prompt, and a precached offline fallback page with empty-cache re-sync recovery. No Dexie, no Firebase, no review UI — those are later phases. The shell must satisfy OFFLINE-01 (installable iOS Safari + Android Chrome) and OFFLINE-03 (update prompt + offline fallback, never blank error).

The evidence converges on one approach: `vite-plugin-pwa` 1.3.0 with `strategies: 'generateSW'`, `registerType: 'prompt'` (NOT `autoUpdate` — silent reload mid-review destroys session state and is flagged dangerous for apps users keep open), precached app shell + dedicated `/offline.html` fallback, navigation fallback routing, and Firebase Hosting header rules (`no-cache` on SW + manifest + HTML, immutable on hashed assets). iOS is the binding constraint: no `beforeinstallprompt`, manual Share → Add to Home Screen only, no Background Sync, ~50 MB / 7-day cache eviction — so empty-cache must be treated as a normal state with a re-sync recovery path, not an error.

**Primary recommendation:** Scaffold Vite 8 + React 19 + TS 5.9 with `vite-plugin-pwa` 1.3.0 (`generateSW`, `registerType: 'prompt'`), precache shell + `/offline.html`, ship update-banner + iOS install-hint components, deploy to Firebase Hosting with correct cache headers, and verify with Lighthouse PWA `works-offline` audit + real-device install matrix.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| OFFLINE-01 | User can install app as PWA on iOS Safari and Android Chrome | Manifest field set + icon sizes, `apple-touch-icon`/meta fallbacks, `beforeinstallprompt` deferral (Android) + iOS Share-hint banner, HTTPS via Firebase Hosting, DevTools Manifest panel + real-device checks |
| OFFLINE-03 | User sees app update prompt and offline fallback page; empty-cache recovers via re-sync (not error) | `registerType: 'prompt'` + `useRegisterSW` banner pattern, Workbox precache + `navigateFallback`/`PrecacheFallbackPlugin` offline page, empty-cache-as-normal recovery UI design, SW/manifest `no-cache` headers so updates propagate |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vite | 8.3.0 (per project SUMMARY) | Build tool + dev server | Project-mandated; plugin 1.3.0 peer-supports `^3.1.0 \|\| ... \|\| ^8.0.0` |
| react | 19.3.0 (per project SUMMARY) | UI for shell, update banner, offline page | Project-mandated; `virtual:pwa-register/react` ships `useRegisterSW` hook |
| typescript | 5.9 pinned | Type safety | Project-mandated; TS 7 Go port compat unverified — do not adopt |
| vite-plugin-pwa | 1.3.0 (latest, 2026-05-05) | Manifest generation + Workbox SW build + register | Actively maintained standard for Vite PWAs; 4.3M weekly downloads; bundles workbox-build/window 7.4.1 |
| workbox (via plugin) | 7.4.1 | Precaching, routing strategies, fallback plugins | Google-maintained; plugin's supported path — never hand-roll SW caching |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| workbox-window (via `virtual:pwa-register`) | 7.4.1 (bundled) | SW registration + `updateServiceWorker()` from UI | Update banner + offline-ready toast (React: `useRegisterSW` from `virtual:pwa-register/react`) |
| @vite-pwa/assets-generator | 1.0.x | Generate icon set (192/512/maskable) + apple-touch-icon from source SVG | Phase 1 icon pipeline — avoids hand-sizing errors |
| firebase-hosting (CLI config only) | current | HTTPS hosting + `Cache-Control` header rules | Deploy target; header config is load-bearing for SW updates |
| lighthouse (CI audit) | current | PWA `works-offline` + installability assertions | Phase exit gate: drives real offline navigation, fails if any route falls to browser error page |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `generateSW` | `injectManifest` (custom SW) | Custom SW needed only for advanced routing/plugins; Phase 1 shell needs precache + navigateFallback only — `generateSW` covers it with far less code to maintain. Revisit if Phase 9 audio runtime-caching outgrows config surface |
| `registerType: 'prompt'` | `registerType: 'autoUpdate'` | `autoUpdate` forces `skipWaiting`+`clientsClaim`, reloads silently — dangerous mid-review and flagged by 2026 field guides; `prompt` lets user finish session first. Requirement explicitly wants a *prompt*, so `prompt` is mandatory |
| vite-plugin-pwa | hand-written sw.js | Viable only for trivial fixed shells; Workbox handles precache-manifest generation, revision hashing, range/opaque edge cases — hand-rolling forfeits all of that |
| Firebase Hosting | any static HTTPS host | Firebase mandated by project; any HTTPS host works technically, but header rules below are written for `firebase.json` |

**Installation:**
```bash
npm create vite@latest chanki -- --template react-ts
npm i -D vite-plugin-pwa@1.3.0 @vite-pwa/assets-generator
```

## Architecture Patterns

### Recommended Project Structure
```
/
├── index.html               # entry; plugin injects manifest link + SW register
├── public/
│   ├── icons/               # generated: icon-192/512, maskable-512, apple-touch-180
│   └── offline.html         # dedicated offline fallback (precached)
├── src/
│   ├── main.tsx             # registerSW wiring (or src/pwa.ts module)
│   ├── App.tsx              # minimal shell: header + placeholder route outlet
│   ├── components/
│   │   ├── UpdateBanner.tsx # needRefresh → Update now / Dismiss
│   │   ├── OfflineReady.tsx # offline-ready toast (OK to dismiss)
│   │   └── IosInstallHint.tsx # Share → Add to Home Screen guide (iOS only)
│   └── pwa/
│       └── register.ts      # registerSW config + hourly update check (optional)
├── vite.config.ts           # VitePWA({...}) — manifest, workbox, devOptions
├── firebase.json            # hosting: public=dist, SPA rewrite, header rules
└── .planning/phases/01-pwa-shell/
```

### Pattern 1: Prompt-type registration with user-driven update
**What:** `registerType: 'prompt'`, no `skipWaiting`/`clientsClaim` forcing; UI banner calls `updateServiceWorker()` on user tap.
**When to use:** Always in this project — reviews are long-lived sessions; silent reload loses state.
**Example:**
```typescript
// Source: https://vite-pwa-org.netlify.app/guide/prompt-for-update.html + McCarthy 2026 field guide
// vite.config.ts
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'prompt', // default; explicit for clarity
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
      },
      manifest: {
        name: 'Chanki',
        short_name: 'Chanki',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#1a1a2e',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
```
```tsx
// Source: McCarthy 2026 PWA best-practices (adapted); official API: virtual:pwa-register/react
// src/components/UpdateBanner.tsx
import { useRegisterSW } from 'virtual:pwa-register/react'

export function UpdateBanner() {
  const { needRefresh, updateServiceWorker } = useRegisterSW({
    onRegistered(r: ServiceWorkerRegistration | undefined) {
      // Hourly update check while app open (works with prompt strategy)
      if (r) setInterval(() => r.update(), 60 * 60 * 1000)
    },
  })
  if (!needRefresh) return null
  return (
    <div role="alert">
      <p>A new version is available</p>
      <button onClick={() => updateServiceWorker()}>Update now</button>
    </div>
  )
}
```

### Pattern 2: Precached app shell + offline fallback for navigations
**What:** Build precaches shell assets; navigation requests serve fallback (`/index.html` for SPA routing continuity, `/offline.html` as branded fallback when cache empty/network dead).
**When to use:** Phase 1 core — guarantees success criterion 3 (no blank browser error).
**Example:**
```typescript
// Source: https://developer.chrome.com/docs/workbox/precaching-dos-and-donts (PrecacheFallbackPlugin)
// Achievable declaratively in generateSW via navigateFallback; custom-fallback equivalent:
workbox: {
  globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}', 'offline.html'],
  navigateFallback: '/index.html',
  navigateFallbackDenylist: [/^\/api\//, /sitemap\.xml$/, /robots\.txt$/],
}
```
Notes: include `offline.html` in precache manifest; keep precache to critical shell (~20–30 files); exclude `/api/*`, sitemap/robots from fallback.

### Pattern 3: Platform-split install UX (Chromium prompt vs iOS hint)
**What:** Android/desktop: capture + defer `beforeinstallprompt`, surface custom Install button on user gesture. iOS: detect iOS + non-standalone, show dismissable Share → Add to Home Screen hint. Never show install UI when already installed.
**When to use:** OFFLINE-01 success criterion 1 spans both platforms — one code path cannot cover both.
**Example:**
```typescript
// Source: OpenPWA iOS guide + magicbell 2026 workaround (verified across 3+ sources)
const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent)
const isStandalone =
  window.matchMedia('(display-mode: standalone)').matches ||
  (window.navigator as Navigator & { standalone?: boolean }).standalone === true

if (isIos && !isStandalone) showIosInstallHint() // "Tap Share → Add to Home Screen → Add"
// Chromium: listen for beforeinstallprompt, preventDefault, stash event, prompt() later from button tap
// Track installs via `appinstalled` event; iOS has neither event — hint dismissal is the only signal
```

### Pattern 4: Hosting header layering (fresh shell, immutable assets)
**What:** `firebase.json` headers: `no-cache` on SW + manifest + HTML entry; `immutable` year-long cache on content-hashed assets. SW rule placed AFTER wildcard asset rule (Hosting applies last match — verified via firebase-tools #8917 + official docs).
**When to use:** Every deploy — wrong headers = stale shell served forever (violates OFFLINE-03 criterion 2).
**Example:**
```json
// Source: https://firebase.google.com/docs/hosting/full-config + firebase-tools#8917 resolution
{
  "hosting": {
    "public": "dist",
    "rewrites": [{ "source": "**", "destination": "/index.html" }],
    "headers": [
      { "source": "**/*.@(js|css|woff2|png|jpg|svg)", "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }] },
      { "source": "/sw.js", "headers": [{ "key": "Cache-Control", "value": "no-cache" }] },
      { "source": "/manifest.webmanifest", "headers": [{ "key": "Cache-Control", "value": "no-cache" }] },
      { "source": "**/*.html", "headers": [{ "key": "Cache-Control", "value": "no-cache" }] }
    ]
  }
}
```

### Anti-Patterns to Avoid
- **`autoUpdate` + `skipWaiting:true` on a session app:** silent reload mid-review loses session state; requirement demands a prompt — use `prompt`.
- **CacheFirst for HTML/navigations:** locks users to old shell; navigations must be NetworkFirst-with-fallback or precache + `navigateFallback`.
- **One global caching strategy:** per-class routing (precache shell / NetworkFirst navigations / CacheFirst hashed assets) — never a single handler for everything.
- **Caching POST/authenticated responses:** never cache mutations; Phase 1 has no API yet, but establish the denylist habit now.
- **Programmatic install button on iOS:** no API exists; iOS path is guidance UI only.
- **Unbounded precache:** full-asset precache blows the iOS ~50 MB budget — precache shell only; audio/deck data get runtime caches with caps in later phases.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SW precache manifest + revision hashing | Custom `install`/`activate`/`fetch` sw.js | `vite-plugin-pwa` generateSW (Workbox 7.4.1) | Content-hash manifest generation, atomic install, outdated-cache cleanup, range/opaque edge cases |
| SW registration + update lifecycle from UI | Manual `navigator.serviceWorker.register` + message plumbing | `virtual:pwa-register` / `useRegisterSW` | `onNeedRefresh`/`onOfflineReady` wiring, `update()` plumbing already correct |
| Icon set generation | Hand-exported PNGs per size | `@vite-pwa/assets-generator` from one SVG source | `any` + `maskable` + apple-touch sizes with safe-zone correctness |
| Offline detection primitives | Custom heartbeat/ping | `navigator.onLine` + `online`/`offline` events + SW fallback serving | Recovery UI reacts to events; SW serves fallback even when page JS never runs |

**Key insight:** SW correctness lives in edge cases (atomic install, version swaps, opaque responses, header interplay). Maintained Workbox absorbs them; custom code re-learns them in production.

## Common Pitfalls

### Pitfall 1: Stale shell served forever (SW/manifest cached)
**What goes wrong:** Users never see updates; update prompt never fires because browser never fetches new SW.
**Why it happens:** Hashed-asset `immutable` rule accidentally covers `sw.js`/`manifest.webmanifest`/HTML; or missing `no-cache` headers.
**How to avoid:** Header layering per Pattern 4 with SW rule LAST; verify response headers in DevTools Network tab after every deploy; preview-channel check before prod.
**Warning signs:** Update banner never appears after deploy; `sw.js` response shows `max-age=31536000`.

### Pitfall 2: iOS cache eviction treated as crash
**What goes wrong:** After ~7 days backgrounded or under storage pressure (~50 MB cap), iOS evicts caches; app shows blank error or dead shell.
**Why it happens:** Designing for persistent cache; no empty-cache path. (Numbers MEDIUM confidence — converging community sources, validate on device.)
**How to avoid:** Treat empty cache as normal: offline fallback page with status copy ("fresh or evicted"), retry-connectivity affordance, re-sync entry point (stub the hook now — real sync lands Phase 6); keep precache minimal; plan `storage.estimate()` guard (Phase 2+ data work).
**Warning signs:** Only tested with warm cache; never tested first-launch-offline or post-eviction launch.

### Pitfall 3: `beforeinstallprompt` assumed universal
**What goes wrong:** Install button wired to an event that never fires on iOS/Firefox; iOS users get no guidance.
**Why it happens:** Chromium-only API (`beforeinstallprompt`/`appinstalled`); Safari never fires them.
**How to avoid:** Platform-split UX (Pattern 3); design baseline = "no prompt event"; Chromium button is enhancement, iOS hint is the path.
**Warning signs:** Install tested only in desktop Chrome.

### Pitfall 4: Forced activation breaks live session
**What goes wrong:** `skipWaiting`+`clientsClaim` swaps SW under open tabs; in-flight state or split asset versions glitch.
**Why it happens:** Copy-pasted `autoUpdate` tutorials.
**How to avoid:** `registerType: 'prompt'`, no forced flags; user taps Update when ready; hourly `r.update()` check only *detects*, never applies.
**Warning signs:** Config contains `skipWaiting: true` with `prompt`, or `autoUpdate` anywhere.

### Pitfall 5: Fallback page itself not precached / route not matched
**What goes wrong:** Offline navigation falls through to browser dinosaur page — the exact failure OFFLINE-03 forbids.
**Why it happens:** `offline.html` missing from precache manifest; fetch handler matching on extension instead of `request.mode === 'navigate'`; scope too narrow.
**How to avoid:** Assert `offline.html` in build manifest; SW scope `/`; Lighthouse `works-offline` audit in CI; manual DevTools offline-navigate test to unvisited route.
**Warning signs:** Offline works for visited routes but not fresh ones.

### Pitfall 6: Icon/manifest gaps fail installability silently
**What goes wrong:** Install prompt never appears; browser gives no reason.
**Why it happens:** Missing 192+512 icons, `display: browser`, no maskable, HTTP origin, manifest not linked.
**How to avoid:** Generator pipeline for icons; DevTools Application → Manifest panel check (lists exactly what's missing); HTTPS-only deploy; `display: standalone`.
**Warning signs:** `beforeinstallprompt` never fires on Android despite SW working.

## Code Examples

### Minimal plugin setup (prompt + precache + fallback)
```typescript
// Source: https://vite-pwa-org.netlify.app/guide/ (Getting Started + Prompt for Update)
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'prompt',
      devOptions: { enabled: false }, // enable:true only to debug SW locally
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
      },
      manifest: {
        name: 'Chanki',
        short_name: 'Chanki',
        start_url: '/',
        scope: '/',
        id: '/',
        display: 'standalone',
        orientation: 'portrait-primary',
        background_color: '#ffffff',
        theme_color: '#1a1a2e',
        categories: ['education'],
      },
    }),
  ],
})
```

### Offline-ready toast wiring
```typescript
// Source: https://vite-pwa-org.netlify.app/frameworks/ (RegisterSWOptions)
import { registerSW } from 'virtual:pwa-register'

const updateSW = registerSW({
  onNeedRefresh() {
    /* show UpdateBanner */
  },
  onOfflineReady() {
    /* show "Ready to work offline" toast with OK to dismiss */
  },
  onRegisterError(e) {
    console.error('SW registration failed', e)
  },
})
// User confirms update → updateSW() → reload serves fresh content
```

### iOS meta fallbacks (alongside manifest)
```html
<!-- Source: OpenPWA iOS Add-to-Home-Screen guide -->
<link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png" />
<meta name="mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="default" />
<meta name="theme-color" content="#1a1a2e" />
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `autoUpdate` recommended by default in tutorials | `prompt` recommended for apps users keep open | 2025–2026 field consensus | Phase 1 must use `prompt`; silent reload is now documented-dangerous |
| SW required as hard gate for `beforeinstallprompt` | Chrome no longer hard-gates install prompt on SW (audits still require it) | Current Chrome releases | SW still mandatory for offline quality, but install debugging splits manifest vs SW causes |
| iOS Safari-only PWA install | Any iOS 16.4+ browser can Share → Add to Home Screen | iOS 16.4 (Mar 2023) | Install hint must not assume Safari; tailor icon-location copy per browser |
| vite-plugin-pwa peers capped at Vite 7 | 1.3.0 supports Vite 8 (`^3.1.0 \|\| … \|\| ^8.0.0`), Workbox 7.4.1 | 2026-05-05 | Matches project Vite 8 baseline; no override hacks needed |

**Deprecated/outdated:**
- `onRegistered` callback: deprecated in favor of `onRegisteredSW` (v0.12.8+) — use `onRegisteredSW` in new code.
- `apple-mobile-web-app-*` as primary install path: now belt-and-suspenders fallback; manifest is primary, meta tags cover older iOS.
- Workbox ≤7.4.0 with vite-plugin-pwa: `serialize-javascript` RCE vuln fixed via Workbox 7.4.1 — ensure 7.4.1 resolved.

## Open Questions

1. **Exact iOS quota/eviction on target devices**
   - What we know: ~50 MB cap + 7-day eviction widely reported (MEDIUM — converging community sources incl. magicbell/firt.dev 2026 guides).
   - What's unclear: exact numbers vary by iOS version and installed-vs-tab context.
   - Recommendation: Phase 1 keeps precache tiny (shell only) so budget headroom is large; add real-device `storage.estimate()` + eviction-recovery acceptance test as plan verification step; full budget math lands in Phase 9 when audio exists.

2. **Starter visual identity for icons/splash**
   - What we know: No CONTEXT.md; no brand decisions exist (greenfield Phase 1).
   - What's unclear: app colors, logo mark for icon source SVG.
   - Recommendation: Planner picks neutral placeholder (theme `#1a1a2e` used in examples) generated via assets pipeline; brand pass is a later-phase concern, pipeline makes swap trivial.

3. **EU-region PWA behavior variance**
   - What we know: iOS 17.4+ EU installs may degrade to browser-tab experience (regulatory variation, LOW-MEDIUM).
   - What's unclear: current 2026 status for target users.
   - Recommendation: Out of Phase 1 scope; note as deployment caveat, verify only if EU users are in scope later.

## Sources

### Primary (HIGH confidence)
- https://vite-pwa-org.netlify.app/guide/ (Getting Started — plugin capabilities, minimal config, devOptions)
- https://vite-pwa-org.netlify.app/guide/prompt-for-update.html (prompt flow: onNeedRefresh/onOfflineReady/updateSW contract)
- https://vite-pwa-org.netlify.app/guide/auto-update.html (autoUpdate forces clientsClaim+skipWaiting; forms warning)
- https://vite-pwa-org.netlify.app/frameworks/ (RegisterSWOptions API incl. onRegistered deprecation)
- npm registry vite-plugin-pwa 1.3.0 (2026-05-05; peers include Vite 8; workbox 7.4.1) + GitHub issue #923 (Vite 8 support thread)
- https://developer.chrome.com/docs/workbox/{app-shell-model, managing-fallback-responses, precaching-dos-and-donts, modules/workbox-precaching} (shell model, navigateFallback, PrecacheFallbackPlugin)
- https://firebase.google.com/docs/hosting/full-config + /manage-cache (header config) + firebase-tools#8917 (last-match-wins resolution)
- https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable (MDN installability criteria, 2026-09-07)

### Secondary (MEDIUM confidence)
- OpenPWA installability criteria + iOS Add-to-Home-Screen guides (Chromium vs iOS matrices, `navigator.standalone` detection)
- McCarthy 2026 PWA best-practices field guide (`prompt` + update banner + hourly check; iOS no-Background-Sync; precache 20–30 files)
- magicbell 2026 iOS limitations guide (7-day cache limit table, manual-install workaround)
- codercops 2026 PWA guide (manifest + minimal SW + header strategy convergence)
- error-recovery.com 2026 app-shell precache guide (atomic install/activate swap, `request.mode === 'navigate'` routing)

### Tertiary (LOW confidence)
- iOS EU-region PWA degradation post-17.4 — regulatory, evolving; flagged, not planned against
- Exact iOS version-specific TTS/mic behaviors — explicitly deferred to Phase 9/10 device matrices per STATE.md

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - plugin version + peers verified via npm registry; Vite/React/TS versions per project SUMMARY (not re-verified — empty repo, scaffold step will resolve)
- Architecture: HIGH - prompt/precache/fallback/header patterns corroborated across official docs + 3+ field guides
- Pitfalls: HIGH on SW/header/install mechanics (official docs); MEDIUM on iOS quota numbers (community convergence, needs device validation)

**Research date:** 2026-09-19
**Valid until:** ~30 days (stable domain; re-check vite-plugin-pwa releases + iOS behavior if planning slips past Oct 2026)
