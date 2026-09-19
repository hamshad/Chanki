# Stack Research

**Domain:** Chinese 4-sided Anki PWA (offline review + handwriting + TTS + tone graph)
**Researched:** 2026-09-19
**Confidence:** HIGH (versions) / MEDIUM (iOS PWA behavior)

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Vite | 8.3.0 | Build / dev server | Current major; Rolldown-based bundler, native ESM. Standard 2026 PWA scaffold. Verified via npm registry. |
| React | 19.3.0 | UI framework | Largest ecosystem for hanzi-writer React wrappers, dexie-react-hooks, Workbox window helpers. Component model fits 4-side card flip + session flow. Verified via npm registry. |
| TypeScript | 5.9.x (pin; 7.0.2 exists) | Type safety | Card schema `{id, hanzi, pinyin, meaning, tone, audioUrl, tags, difficulty, createdAt, updatedAt, schemaVersion}` + FSRS state benefit most from strict types. Pin 5.9 because plugin/type tooling proven; TS 7.0.2 (Go port) is latest per registry but ecosystem catch-up unverified — flag for validation. |
| vite-plugin-pwa | 1.3.0 (Workbox 7.4.1) | PWA shell: manifest, service worker, precache, runtime caching | Zero-config PWA for Vite, peer-supports Vite ^8. Bundles workbox-build/window 7.4.1. Handles app-shell precache + MP3 runtime cache + `registerType: 'prompt'` update flow. Verified via npm registry. |
| Firebase JS SDK (modular) | 12.18.0 | Firestore + Storage + Hosting (+ App Hosting optional) | User-mandated backend. v12 modular tree-shakable imports (`firebase/app`, `firebase/firestore`, `firebase/storage`). v11 line ended June 2025; v12 current since July 2025, latest release Aug 19 2026 per official release notes. Verified via firebase.google.com release notes + npm registry. |
| Dexie.js | 4.4.5 | Offline IndexedDB wrapper (cards, progress, FSRS state, audio blobs) | Standard IndexedDB wrapper (WhatsApp Web, ChatGPT use it per dexie.org). 4.4.x current (release Mar 2026, npm latest 4.4.5). Promise API + `dexie-react-hooks` live queries + `dexie-export-import` for deck backup. Raw IndexedDB too verbose for SRS schema. Verified via npm registry + GitHub releases. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| ts-fsrs | 5.4.2 | FSRS scheduler (Again/Hard/Good/Easy, due dates, memory state) | Always for SRS core. Implements Free Spaced Repetition Scheduler; same algorithm family Anki adopted. Returns next interval + updated stability/difficulty per grade. Persist `stability, difficulty, reps, lapses, due` per card in Dexie. Verified via npm registry. |
| hanzi-writer | 3.7.3 | Stroke animation + quiz mode (stroke-order detection/correction) | Always for handwriting practice. Built-in `quiz()` gives wrong-stroke feedback; data via `hanzi-writer-data`. Zero deps, SVG/Canvas render. Verified via npm registry. |
| hanzi-writer-data | 2.0.x | Stroke-order JSON per character | Always alongside hanzi-writer (`HanziWriter.loadCharacterData`). Lazy-load per character, cache in Dexie/IDB to work offline. |
| pitchy | 4.1.0 | Real-time monophonic pitch detection (McLeod Pitch Method) | Always for tone contour. Pure ESM, no deps beyond fft.js, `findPitch(Float32Array, sampleRate)` returns `[freq, clarity]`. Clarity 0–1 gates unvoiced frames. Use clarity < ~0.5 → drop frame (silence/fricative). Verified via npm registry + GitHub README. |
| Canvas 2D (custom) | built-in | Tone contour graph (~60fps target curve vs mic pitch) | Always for graph. Target tone shape is 1 static polyline + live pitch polyline + progress cursor. Custom canvas avoids chart-lib overhead and gives frame-level control for <100ms pitch latency. |
| dexie-react-hooks | 4.4.x | Live queries (`useLiveQuery`) for due-count, session queue | With React + Dexie. Auto re-render on review writes. |
| workbox-window | 7.4.1 (via plugin) | SW update prompt + message passing | With vite-plugin-pwa. `registerType: 'prompt'` → "New version" toast. |
| firebase/firestore `enableIndexedDbPersistence` alternative: Dexie as source of truth | — | Sync strategy | Firestore offline persistence exists, but Dexie stays source of truth because SRS writes must be instant (<100ms flip) and conflict-free; Firestore syncs opportunistically (`devices/{deviceId}` doc + card progress collection). Avoids dual-cache divergence bugs. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| firebase-tools (CLI) | Hosting deploy, Firestore rules, Storage rules, emulators | `firebase emulators:start --only firestore,storage,hosting` for admin-gate + rules testing before shipping. |
| @vite-pwa/assets-generator (optional) | Icon/splash generation | Optional peer dep of plugin; generates maskable icons + iOS apple-touch-icon. |
| Vitest | Unit tests for scheduler mapping, deck import/export versioning, tone-curve scoring | ts-fsrs itself tests with Vitest; same runner keeps stack coherent. |

## Installation

```bash
# Core
npm install react react-dom firebase@12.18.0 dexie ts-fsrs@5.4.2 hanzi-writer pitchy

# PWA + data + live queries
npm install vite-plugin-pwa workbox-window hanzi-writer-data dexie-react-hooks dexie-export-import

# Dev dependencies
npm install -D vite@8.3.0 typescript@5.9 vite @vitejs/plugin-react firebase-tools vitest
```

Firebase Hosting config: `firebase init hosting` with `dist` as public dir + standard SPA rewrite. Firestore rules lock writes to anon-device docs (see PITFALLS/architecture researcher notes).

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| ts-fsrs 5.4.2 | Hand-rolled SM-2 (~30 lines) | Only as fallback if FSRS parameter tuning proves too opaque. SM-2 simpler to explain, but retention worse and Anki ecosystem moved to FSRS; hand-roll also risks interval bugs roadmap can't afford. Prefer ts-fsrs; wrap behind `Scheduler` interface so SM-2 swap is one file. |
| pitchy (McLeod MPM) | Meyda 5.6.3 | Meyda is feature-extraction suite (MFCC, chroma, spectral), not pitch estimator — no direct F0 output; overkill and noisier for tone contour. Use Meyda only if later adding timbre/quality scoring beyond F0. |
| pitchy (McLeod MPM) | Raw autocorrelation / Chris-Wilson / milcktoast PitchDetect snippet | Raw autocorrelation works but octave errors common without heuristics (audiojs comparison table: autocorrelation ★★★, octave errors common). Pitchy MPM rates ★★★★ with rare octave errors. Hand-roll YIN only if measured latency/accuracy fails on target phones. |
| pitchy (McLeod MPM) | audiojs/pitch-detection (YIN/pYIN/SWIPE) | Worth evaluating in tone-trainer phase if Mandarin Tone 3 creak / noisy mic breaks MPM. pYIN/SWIPE more robust but heavier; YIN O(N²/4) costlier per frame. Default pitchy, spike-test against recorded ni3/ma1 samples before switching. |
| Custom Canvas 2D graph | uPlot 1.6.32 | uPlot is fastest time-series chart lib, but built for scrolling telemetry with axes/legends — unnecessary weight and API surface for 2-line tone overlay. Use uPlot only if graph grows into analytics dashboard (progress history). |
| Pre-generated MP3 in Firebase Storage (primary) | Web Speech API `speechSynthesis` (fallback) | Hybrid, not either/or (see below). MP3 primary because offline-after-first-sync, consistent Mandarin voice, no iOS speech bugs. Speech API fallback for uncached/admin-preview cards only. |
| Dexie source of truth + Firestore sync | Firestore offline persistence alone | Firestore persistence alone couples review latency to SDK cache and complicates 20-card session queue + FSRS state versioning. Dexie owns review path; Firestore owns backup/sync. |
| React 19 | Vue/Svelte/Solid (plugin supports all) | Only if team prefers; plugin has first-class entries for each. React chosen for library ecosystem (hanzi-writer React examples, dexie-react-hooks). |
| Firebase Hosting | Vercel/Netlify/Cloudflare Pages | Only if leaving Firebase hosting; but Storage + Firestore colocation + single `firebase deploy` keeps ops single-vendor as mandated. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Firebase compat (`firebase/compat/*`) / v8 namespaced SDK | Deprecated path; doubles bundle, no tree-shaking | Modular v12: `import { initializeApp } from 'firebase/app'` |
| Raw IndexedDB without wrapper | Verbose, transaction-scope footguns, schema-migration pain | Dexie 4.4.x |
| Meyda as pitch detector | No F0 estimator; spectral-feature toolkit mismatched to tone-contour need | pitchy 4.1.0 |
| Heavy chart lib (Chart.js/Recharts/ECharts) for tone graph | 60fps live overlay needs per-frame canvas writes; chart libs add layout/axis cost and GC churn on mobile | Custom Canvas 2D |
| `speechSynthesis` as sole TTS | iOS bugs documented 2026: speech hangs on certain text (SO iOS 26 Tingting `<...>` hang requiring Safari restart), historical iOS 17 CJK-quote failures; voices vary per device; no offline guarantee; audio-session demotion in play-and-record mode routes speech to earpiece | Pre-generated MP3 cached by SW; speechSynthesis only as fallback with sanitized text |
| Continuous open mic stream across TTS+listen | iOS Safari infers `play-and-record` session, demotes speaker/TTS to earpiece, suspends AudioContext between gestures | Half-duplex: open mic only during answer window (`pointerdown` → getUserMedia synchronously in gesture), release tracks on stop; `AudioContext.resume()` before each playback |
| MediaRecorder for pitch path | Codec fragmentation (iOS mp4/AAC vs Android webm/opus) + blob latency unsuitable for real-time contour | Web Audio `AnalyserNode.getFloatTimeDomainData` → pitchy per frame; MediaRecorder only if later adding uploadable recordings |
| Storing phone numbers / PII as device identity | Explicitly rejected in PROJECT.md; consent + privacy risk | Anon UUID in IndexedDB + `devices/{deviceId}` Firestore doc, no PII |
| TS `latest` (7.0.2) blindly | Go-port major; plugin/hook type compat unverified at research time | Pin `typescript@5.9`, upgrade to 7 after build passes in Phase 0 spike |

## Stack Patterns by Variant

**If card audio must work airplane-mode after first sync:**
- Pre-generate MP3 per card (admin creation → TTS service → Storage `audio/{cardId}.mp3` → `audioUrl`), SW runtime-cache + Dexie blob mirror.
- Because on-device `speechSynthesis` zh voice availability offline is device-dependent and iOS behavior buggy.

**If tone trainer must hit ~60fps with <100ms pitch latency:**
- `getUserMedia` → `AudioContext` → `AnalyserNode` (2048 buffer) → pitchy `findPitch` in `requestAnimationFrame` loop → custom canvas draw. Clamp search to voice F0 band (~80–500 Hz) to cut octave errors. Gate clarity <0.5.
- Because FFT-based or server-roundtrip pitch can't meet latency budget; time-domain MPM on-device can.

**If iOS PWA mic permission flow:**
- Request `getUserMedia({audio:true})` synchronously inside tap/`pointerdown` handler (same task tick — iOS requirement per 2026 field reports).
- Prime-and-release at session open (permission grant, flip back to `playback` mode), then open-per-answer.
- `NotAllowedError` → recovery card: iOS path "Settings → Safari → Microphone → Allow" + "Try again" button; persist denial flag, don't re-prompt silently.
- Because iOS PWA getUserMedia works only in secure context + user gesture; silent/autoplay mic fails.

**If TTS voice consistency matters (tones are the product):**
- Single recorded-or-synthesized voice for all deck MP3s; never mix device voices per card.
- Because learners memorize tone contours partly by timbre; voice-switching hurts recall.

**If admin writes must stay closed:**
- Easter-egg gate is UX only; enforcement is Firestore rules (`allow write: if request.auth == null → false` except via Admin SDK / custom claim). Anonymous device IDs get create/update only under `devices/{deviceId}` subtree.
- Because client-side gates are bypassable; rules are the real lock.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| vite-plugin-pwa@1.3.0 | vite@8.3.0 | Peer range includes `^8.0.0`; verified in registry metadata. |
| workbox-build/window@7.4.1 | vite-plugin-pwa@1.3.0 | Pinned peer dep; don't bump Workbox independently. |
| firebase@12.18.0 | Node >=20.19 (SDK dev) / any modern browser | Repo tests on Node 20.19.0; app needs Node 20+ for firebase-tools. |
| dexie@4.4.5 + dexie-react-hooks@4.4.x | react@19.3.0 | 4.4 line current; hooks package tracks core minor. |
| ts-fsrs@5.4.2 | Node >=20 | Pure TS, ESM/CJS/UMD builds; no native deps. |
| hanzi-writer@3.7.3 | any (zero deps) | ESM + CJS builds; pairs with hanzi-writer-data@2.x. |
| pitchy@4.1.0 | ESM-only (v4 note) | Pure ESM dist; ensure Vite `optimizeDeps` handles it (it does natively). Don't use with CJS `require`. |
| typescript@5.9 (pinned) | Vite 8, all libs above | TS 7.0.2 latest per registry but unverified with plugin/hook types; validate before adopting. |

## Sources

- npm registry `vite/latest` → 8.3.0 — version verified (HIGH)
- npm registry `vite-plugin-pwa/latest` → 1.3.0, workbox 7.4.1 peers, vite ^8 support — verified (HIGH)
- npm registry `react/latest` → 19.3.0 — verified (HIGH)
- npm registry `typescript/latest` → 7.0.2 (pin 5.9 recommendation is judgment call) — verified latest, rationale MEDIUM
- npm registry `firebase` → 12.18.0; firebase.google.com/support/release-notes/js → 12.18.0 Aug 19 2026, v12.0.0 July 17 2025 — verified (HIGH)
- npm registry `dexie` → 4.4.5; github.com/dexie/Dexie.js releases → 4.4.x line 2026 — verified (HIGH)
- npm registry `ts-fsrs/latest` → 5.4.2 — verified (HIGH)
- npm registry `hanzi-writer/latest` → 3.7.3 — verified (HIGH)
- npm registry `pitchy/latest` → 4.1.0 (McLeod MPM, ESM-only v4) — verified (HIGH)
- npm registry `meyda/latest` → 5.6.3 — verified (HIGH)
- npm registry `uplot/latest` → 1.6.32 — verified (HIGH)
- github.com/notewize/pitchy README — MPM algorithm, clarity metric — (HIGH)
- github.com/audiojs/pitch-detection — YIN vs autocorrelation accuracy/octave-error table — (MEDIUM)
- dev.to PitchTester YIN article (2026-08-25) — YIN beats FFT for monophonic, voice-range clamping, parabolic interpolation — (MEDIUM)
- samueleddy.com iOS Safari audio sessions (2026-05-17) — AudioContext-over-SpeechSynthesis, prime-and-release mic, resume() per TTS, audioSession API iOS 17+ — (MEDIUM, single field source, behavior undocumented by Apple)
- StackOverflow iOS 26 SpeechSynthesis Tingting `<...>` hang + iOS 17 CJK-quote failure threads — speechSynthesis-as-sole-TTS risk — (MEDIUM)
- github.com/amd/gaia issue #896 (2026-04-26) — mic codec matrix, getUserMedia-in-gesture requirement, permission recovery UX — (MEDIUM)

---
*Stack research for: Chanki Chinese 4-sided Anki PWA*
*Researched: 2026-09-19*
