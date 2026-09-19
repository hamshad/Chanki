# Architecture Research: Chanki — Offline-First PWA SRS

**Domain:** Offline-first PWA spaced-repetition system (flashcards + handwriting + TTS + tone trainer) with Firebase sync
**Researched:** 2026-09-19
**Confidence:** MEDIUM-HIGH (HIGH on PWA/data/scheduler/handwriting layers; LOW on pitch-estimator choice — flagged for phase research)

## Standard Architecture

Offline-first PWAs in 2026 converge on **three composable layers** (OpenReplay local-first survey, Jun 2026; APIScout offline-first guide, Mar 2026; youngju.dev PWA sync-engines deep dive, May 2026 — all agree):

1. **Service worker** — caches assets, serves offline shell.
2. **Local database** — primary copy; UI reads/writes here always.
3. **Sync engine** — reconciles local replica with server in background.

Key principle: **UI never calls network for reads. Writes go local-first with a `syncStatus` flag, then push when online.**

### System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│ SHELL LAYER (Service Worker + App Shell)                        │
│ ┌──────────────┐ ┌──────────────┐ ┌───────────────────────────┐  │
│ │ App shell    │ │ Audio/hanzi  │ │ /offline fallback +       │  │
│ │ precache     │ │ CacheFirst   │ │ update prompt             │  │
│ │ (Workbox)    │ │ (MP3, JSON)  │ │ (virtual:pwa-register)    │  │
│ └──────┬───────┘ └──────┬───────┘ └─────────────┬─────────────┘  │
│        │                │                       │                │
├────────┴────────────────┴───────────────────────┴────────────────┤
│ APP LAYER (UI + domain services, all read from local DB)        │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐ ┌───────────┐  │
│ │ Review   │ │ Writing  │ │ Tone     │ │ TTS    │ │ Hidden    │  │
│ │ session  │ │ canvas   │ │ trainer  │ │ svc    │ │ admin     │  │
│ │ machine  │ │ (hanzi-  │ │ pipeline │ │        │ │           │  │
│ │          │ │ writer)  │ │ (worklet)│ │        │ │           │  │
│ └────┬─────┘ └────┬─────┘ └────┬─────┘ └───┬────┘ └─────┬─────┘  │
│      │            │            │           │            │        │
│ ┌────┴────────────┴────────────┴───────────┴────────────┴─────┐  │
│ │ DOMAIN CORE: SRS scheduler (ts-fsrs pure fns) + schema     │  │
│ │ migrator + device identity                                 │  │
│ └────┬──────────────────────────────────────────────────────┘  │
│      │                                                          │
├──────┴──────────────────────────────────────────────────────────┤
│ DATA LAYER (local-first)                                        │
│ ┌─────────────────────┐   ┌─────────────────────────────────┐   │
│ │ Dexie/IndexedDB     │◄─►│ Sync engine (push→pull, LWW,    │   │
│ │ decks/cards/        │   │ backoff, status badges)         │   │
│ │ progress/reviewlogs │   │                                 │   │
│ └─────────────────────┘   └────────┬────────────────────────┘   │
│                                    │ (online only)              │
│                           ┌────────▼────────────────────────┐   │
│                           │ Firestore + Storage (cloud peer)│   │
│                           │ devices/{id}, decks, audio MP3  │   │
│                           └─────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| App shell / SW | Offline shell, asset caching, install UX, update prompt | `vite-pwa` (SvelteKit/Vite plugin), Workbox 8 strategies: precache shell, CacheFirst fonts/audio/hanzi JSON, NetworkFirst not needed (Firestore SDK handles own transport) |
| Local store | Source of truth for ALL reads; due-query indexes; pending flags | Dexie.js over IndexedDB: tables `decks, cards, progress, reviewLogs, audioMeta`; indexes on `nextReview, updatedAt, syncStatus` |
| Sync engine | Push unsynced → pull remote; conflict rule; retry/backoff; `fromCache` badge | Hand-rolled (~100 lines): `pushToCloud` (batch by `syncStatus=pending`) then `pullFromCloud` (merge by `updatedAt`); exponential backoff + jitter; `navigator.onLine` + Firestore `fromCache` metadata for stale indicator |
| Device identity | Anon UUID, no PII, stable across sessions | `crypto.randomUUID()` persisted in IndexedDB (fallback localStorage); `devices/{deviceId}` doc in Firestore holds progress |
| SRS scheduler | Pure scheduling math, no I/O | `ts-fsrs` (793★, FSRS v6, MIT): `repeat()` to preview 4 outcomes, `next(card, date, Rating)` to apply grade; store S/D/R per card-progress row |
| Review session machine | Prompt → flip → grade → retry → summary | Framework store (Svelte store / signals): states `idle→prompt(random side)→revealing→grading→retryQueue→summary`; session queue capped at 20, failed-side card IDs re-queued in-session |
| Writing canvas | Stroke-order animation + quiz + mistake callbacks | `hanzi-writer` v3.7 (zero-dep, SVG): `Writer.create`, `.quiz({onMistake, onCorrectStroke, onComplete})`, `showHintAfterMisses: 3`; stroke JSON from Make Me a Hanzi CDN, cached CacheFirst |
| TTS service | Tiered audio: cached MP3 → pre-generated fetch → on-device synthesis | Priority chain: (1) Cache API MP3 by `audioUrl`/hash, (2) fetch Storage MP3 + cache, (3) `speechSynthesis` with `zh-CN` voice preferring `localService=true`, `voiceschanged` listener, never hard-code voice names |
| Tone pipeline | Mic → pitch frames → contour → compare vs target → 60fps graph | `getUserMedia` → `AudioWorklet` capture → pitch estimator → ring buffer → normalize (speaker-relative) → DTW/correlation vs tone template (e.g. ni3 dip-rise) → canvas render; 100% on-device, no upload |
| Hidden admin | Easter-egg entry + code gate; deck/card CRUD; JSON import/export | Hidden route + multi-tap trigger; code checked client-side for UI + **server-enforced via Firestore rules** (admin secret hash / custom claim, never open writes); additive schema migrator on import |
| Schema versioning | Forward-compatible deck JSON | `schemaVersion` on every card/deck; migrator functions `migrate(vN→vN+1)`; rule: additive changes only, defer deletions |

## Recommended Project Structure

```
src/
├── app/                  # Shell: routes, PWA registration, update prompt, /offline
│   ├── routes/           # review/, practice/, tone/, admin(hidden)/
│   └── pwa.ts            # virtual:pwa-register wiring, install prompt
├── domain/               # Pure logic, zero I/O (unit-testable)
│   ├── srs.ts            # ts-fsrs wrapper: repeat/next, due filter, urgency sort
│   ├── session.ts        # Review state machine (prompt/flip/grade/retry/summary)
│   ├── tones.ts          # Target tone templates (t1–t4 + neutral contours)
│   ├── schema.ts         # Card/deck zod schemas + migrate() chain
│   └── device.ts         # UUID get-or-create
├── data/                 # Local-first data layer
│   ├── db.ts             # Dexie schema: decks/cards/progress/reviewLogs/audioMeta
│   ├── sync.ts           # push→pull engine, backoff, status
│   └── firebase.ts       # init app + initializeFirestore(persistentLocalCache)
├── audio/                # All sound in one boundary
│   ├── tts.ts            # Tiered TTS chain (cache → Storage → speechSynthesis)
│   ├── worklet/          # AudioWorklet capture processor
│   ├── pitch.ts          # Pitch estimator (YIN/autocorr — phase research)
│   └── contour.ts        # Normalize + compare vs template, score
├── writing/              # Handwriting boundary
│   ├── writer.ts         # hanzi-writer wrapper component
│   └── strokes.ts        # Stroke-data fetch + cache (Make Me a Hanzi CDN)
├── admin/                # Hidden admin boundary
│   ├── gate.ts           # Easter-egg trigger + code check
│   ├── decks.ts          # CRUD via data layer (same sync path)
│   └── io.ts             # Versioned JSON export/import + validation
└── rules/                # Deployed alongside app, tested in emulator
    ├── firestore.rules   # Public read decks; device-scoped progress; locked writes
    └── storage.rules     # Public read audio; admin-only write
```

### Structure Rationale

- **`domain/` pure:** SRS math, session machine, tone templates have no imports from `data/` or `audio/` — testable without browser/Firebase. Scheduler bugs are silent-retention killers; isolate them.
- **`data/` owns all persistence:** UI components never touch Firestore directly; they subscribe to Dexie live queries. Single seam to swap sync strategy later.
- **`audio/` single boundary:** Mic, worklet, pitch, TTS share lifecycle (permissions, sample rate, cleanup). Keeps autoplay-policy and iOS quirks in one place.
- **`admin/` isolated:** Hidden route + gate import nothing from review flow; shares only `data/` write path so rules stay the single enforcement point.
- **`rules/` in repo:** Security rules versioned + emulator-tested; prevents "open writes" regression when admin ships.

## Architectural Patterns

### Pattern 1: Local-Replica + Push-then-Pull Sync

**What:** Dexie is the read source of truth. Every mutation writes locally with `syncStatus:'pending'`. Sync = push pending batch first, then pull remote and field-level-LWW merge by `updatedAt`. UI shows pending/synced badge from the flag.
**When to use:** Single-learner-per-device apps (this project). No real-time collaboration → queue-based sync is the correct default (APIScout 2026); CRDTs (Yjs/Automerge) are overkill without concurrent editors.
**Trade-offs:** Simple, debuggable, survives reload (queue in IndexedDB, never memory). Does not handle two devices editing the same card field simultaneously — acceptable here; last-write-wins at field level.

**Example:**
```typescript
// data/sync.ts — push first, then pull (recipe-box pattern, verified 2025)
async function sync(dbCloud: Firestore) {
  await pushToCloud(dbCloud);  // batch.set pending docs, then mark synced
  await pullFromCloud(dbCloud); // orderBy updatedAt desc, field-merge into Dexie
}
// Writes always local-first:
await db.cards.put({ ...card, updatedAt: Date.now(), syncStatus: 'pending' });
```

### Pattern 2: Pure Scheduler + Stateful Session Machine

**What:** `ts-fsrs` functions (`repeat`/`next`) stay pure; a separate session store owns the review flow: pick 20 due cards (`filterDue` + urgency sort) → random prompt side → flip-through-4 → grade (Again/Hard/Good/Easy) → `scheduler.next()` → failed sides re-queue in-session → summary (count/accuracy/next-due).
**When to use:** Always for SRS apps — keeps retention math swappable (SM-2→FSRS) without touching UI.
**Trade-offs:** Slight boilerplate mapping FSRS card state ↔ app progress rows. Pays off: wrong scheduling silently destroys retention; isolation makes it testable.

**Example:**
```typescript
// domain/session.ts
type Phase = 'prompt' | 'revealing' | 'grading' | 'summary';
interface SessionState { queue: string[]; retry: string[]; phase: Phase; promptSide: Side; }
// grade path:
const preview = scheduler.repeat(fsrsCard, new Date()); // show intervals on buttons
const result = scheduler.next(fsrsCard, new Date(), rating); // apply after grade
await db.progress.put({ cardId, stability: result.card.stability, nextReview: +result.card.due, syncStatus: 'pending' });
```

### Pattern 3: Tiered Audio with Offline-First Cache

**What:** TTS is a 3-tier chain: (1) Cache API hit by content hash → play instantly; (2) miss → fetch pre-generated Storage MP3, cache, play; (3) offline + no MP3 → `speechSynthesis` local voice. Service worker uses CacheFirst for audio/hanzi JSON (immutable), precache for shell.
**When to use:** Any PWA where audio latency matters (review flip → audio must start <500ms cached).
**Trade-offs:** Storage MP3s cost generation + hosting but give consistent voice cross-device; `speechSynthesis` is free but voice availability varies per device and some voices need network (`localService=false`) — hence lowest tier, not primary. iOS SpeechSynthesis has known version-specific bugs (SO, iOS 26) — sanitize text, wrap in try/catch, always have MP3 tier above it.

### Pattern 4: Isolated Real-Time Audio Pipeline (Worklet + On-Device Pitch)

**What:** Mic capture runs in an `AudioWorklet` (never main thread), posts frames to a pitch estimator, which feeds a contour buffer rendered on canvas at rAF. Normalization is speaker-relative (subtract mean / divide range) before comparing to the target tone template, so absolute pitch doesn't matter — only shape (e.g. T3 dip-rise).
**When to use:** Tone trainer. On-device = <100ms latency + privacy (no upload, per PROJECT.md constraint).
**Trade-offs:** Worklet setup + permission handling is the most platform-fragile part (iOS PWA mic quirks). Estimator algorithm (YIN vs autocorrelation vs ML) is LOW-confidence — needs phase-specific research with on-device measurement. Keep `pitch.ts` behind a narrow `estimatePitch(frame): Hz | null` interface so the algorithm swaps without touching pipeline/render.

**Example:**
```typescript
// audio/pitch.ts — narrow seam, algorithm swappable
export interface PitchEstimator { estimate(frame: Float32Array, sampleRate: number): number | null; }
// audio/contour.ts — speaker-relative normalize, then shape-compare
export function scoreContour(user: number[], target: ToneId): number {
  const n = normalize(user); // mean-center + range-scale
  return shapeSimilarity(n, TEMPLATES[target]); // correlation/DTW
}
```

### Pattern 5: Rules-as-the-Real-Admin-Gate

**What:** Easter-egg + code gate only hides UI. Real enforcement is Firestore/Storage security rules: public read for decks/audio; progress writes scoped to `devices/{deviceId}` matching the client's anon ID; deck writes require admin credential (custom claim or secret-hash field validated in rules). Emulator-tested.
**When to use:** Any no-login app with a privileged writer role.
**Trade-offs:** Client-side code check is bypassable by design — must never be the only gate. Rules evaluation must stay simple (no cross-doc reads in hot paths) to avoid latency/cost.

## Data Flow

### Request Flow

```
[User taps card side]
    ↓
[Review session store] → [ flips state ] → [Dexie read: card sides]
    ↓
[Grade tap] → [ts-fsrs next()] → [Dexie write progress + reviewLog, pending]
    ↓ (background, when online)
[Sync engine push] → [Firestore devices/{id}/progress] → [mark synced]
    ↓
[Pull remote decks] → [field-merge by updatedAt] → [live query re-renders UI]
```

### State Management

```
[Dexie liveQuery]
    ↓ (subscribe)
[Route components] ←→ [session/audio/admin stores] → [Dexie writes] → [sync engine]
```

### Key Data Flows

1. **First-sync / offline seed:** Online → pull decks + cards + audio MP3s into Dexie/Cache API → airplane mode works. Firestore persistence caches only *read* docs — so explicitly read all due decks at init (documented Firestore behavior).
2. **Review grading:** grade → `scheduler.next()` → progress row (`stability, difficulty, nextReview, syncStatus:pending`) + `reviewLogs` append (feeds future FSRS weight optimization) → sync pushes when online.
3. **Writing practice:** stroke-data fetch (cached) → hanzi-writer quiz → `onMistake/onComplete` summary → mistake count stored on session, optionally biases grade suggestion (never auto-grades).
4. **Tone practice:** mic frames → worklet → pitch → contour → score vs template → score stored like a review signal; raw audio never leaves device.
5. **Admin publish:** hidden UI → Dexie write (`schemaVersion` stamped) → sync push under admin credential → rules validate → other devices pull on next sync; export path serializes same rows to versioned JSON.
6. **Schema upgrade:** import/app-start reads `schemaVersion` → `migrate()` chain → write back migrated rows (marked pending so cloud converges).

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0-1k users (v1) | Monolith PWA + Firestore as-is. No change needed; per-device docs, no shared hot spots. |
| 1k-100k users | First bottleneck: Firestore read fan-out on shared deck pulls. Fix: bundle read-only decks as versioned JSON in Hosting/Storage + CacheFirst (serve-bundles pattern) instead of per-doc reads; keep Firestore for progress only. |
| 100k+ users | Split read path (CDN bundles) from write path (Firestore progress). Consider per-region Firestore + aggregation for global stats (not v1 scope). |

### Scaling Priorities

1. **First bottleneck:** Deck-content reads (same docs read by every device). Mitigate from the start by treating decks as immutable versioned bundles cached aggressively — progress (per-device, low volume) stays in Firestore.
2. **Second bottleneck:** Storage egress for audio. Mitigate with content-hash caching + `speechSynthesis` fallback tier reducing MP3 fetches.

## Anti-Patterns

### Anti-Pattern 1: Firestore-as-direct-UI-source

**What people do:** Components subscribe to Firestore snapshots directly, no local DB.
**Why it's wrong:** Review breaks the moment connectivity drops; no pending badges; due-queries scan server-side on every flip; violates the <100ms flip constraint.
**Do this instead:** Dexie owns reads; Firestore is a sync peer behind the sync engine.

### Anti-Pattern 2: In-memory sync queue

**What people do:** Pending mutations kept in a JS array, flushed on reconnect.
**Why it's wrong:** Closing the tab before sync loses reviews — silent retention-data loss, invisible in logs.
**Do this instead:** Queue = `syncStatus:'pending'` rows in IndexedDB; survives reload by construction.

### Anti-Pattern 3: Client-side admin check as the only gate

**What people do:** `if (code === '1234') allowWrite()` with open Firestore rules.
**Why it's wrong:** Anyone with devtools writes arbitrary decks; public site becomes spam vector.
**Do this instead:** Rules enforce; code only unlocks UI. Test with emulator (write attempt without credential must fail).

### Anti-Pattern 4: Absolute-pitch tone comparison

**What people do:** Compare raw Hz against a fixed template.
**Why it's wrong:** Every speaker's baseline differs (esp. across genders/ages) — absolute match fails for most users.
**Do this instead:** Speaker-relative normalization (contour shape only), then shape similarity.

### Anti-Pattern 5: Scheduler state inside UI components

**What people do:** FSRS stability/difficulty computed inline in the review component.
**Why it's wrong:** Algorithm becomes untestable and unswappable; a scheduling bug silently corrupts every card's interval.
**Do this instead:** `domain/srs.ts` pure module with unit tests (round-trip: grade sequence → expected intervals).

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Firestore | Modular SDK + `initializeFirestore(persistentLocalCache({tabManager: persistentMultipleTabManager()}))` before any read/write; manual push→pull engine on top | Persistence must init first (API-enforced); cache ~40MB default, raise if decks large; `fromCache` metadata drives stale badge; LWW default — field-level merge in our code |
| Firebase Storage | Pre-generated zh MP3s per card (`audio/{hash}.mp3`); public read, admin write | Generate at deck-publish time (admin action); content-hash naming = immutable = CacheFirst safe |
| Firebase Hosting | Serve PWA shell + versioned deck bundles | Deck bundles as static JSON enables CDN-scale reads without Firestore fan-out |
| Make Me a Hanzi CDN (stroke data) | Fetch-once JSON per character, CacheFirst in SW | Data derived from Make Me a Hanzi project (hanzi-writer's source); pin version; fallback: skip writing step if fetch fails offline |
| Web Speech API | `speechSynthesis` lowest-tier fallback only | `voiceschanged` listener; prefer `lang:'zh-CN'` + `localService`; sanitize `< symb`/`>` (iOS 26 crash bug); never hard-code voice names |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| UI ↔ local store | Dexie liveQuery subscriptions (reactive) | Only boundary components touch; no Firestore imports in components |
| Review ↔ scheduler | Pure function calls (`repeat`/`next`), plain data in/out | Scheduler has no DB/network imports — hard rule |
| Session ↔ writing/tone | Event callbacks (`onComplete`, score) → session store fields | Practice modules never mutate progress directly; session decides grade |
| Worklet ↔ pitch ↔ render | `postMessage` frames → Hz values → ring buffer → rAF canvas | Backpressure: drop frames if estimator slower than capture (never block audio thread) |
| App ↔ admin | Shared `data/` write path only | Admin cannot bypass sync engine or schema validation |
| App ↔ sync engine | `syncStatus` flags + `online`/`fromCache` signals | UI shows pending count + stale indicator; engine owns retry/backoff |

## Suggested Build Order (Dependency-Driven)

```
1. Shell + identity + local store
   (vite-pwa precache, Dexie schema, device UUID)
        ↓  everything reads from store
2. Scheduler + review session machine
   (ts-fsrs wrapper, 20-card flow, flip-then-grade, summary)
        ↓  review works fully offline — core value proven
3. Sync engine + Firestore + rules
   (push→pull, devices/{id} scoping, locked writes, emulator tests)
        ↓  progress survives reinstall; decks updatable remotely
4. Hidden admin + JSON versioning
   (gate, CRUD, export/import, migrate chain)
        ↓  content pipeline exists
5. Writing canvas
   (hanzi-writer wrapper, stroke-data cache, mistake callbacks)
        ↓
6. TTS service
   (Storage MP3 tier → Cache API → speechSynthesis fallback)
        ↓  tone side has audio offline
7. Tone trainer pipeline LAST
   (worklet → pitch → contour → graph; LOW-confidence estimator → needs phase research spike first)
```

**Ordering rationale:** Each layer is demoable offline before the next is added; the highest-risk/uncertain piece (pitch estimation on mobile) is deliberately last so it can't block core SRS value. Sync comes after review (not before) because review must be proven airplane-mode solid against the local store alone — sync then only mirrors rows.

## Sources

- OpenReplay blog, "Local-First Architecture for Progressive Web Apps" (2026-06-07) — 3-layer model (SW / local DB / sync engine); IndexedDB floor vs OPFS-SQLite ceiling — MEDIUM (single source, concept corroborated by 2 others)
- APIScout, "Building Offline-First Apps with API Sync 2026" (2026-03-08) — UI-reads-local / queue-in-IndexedDB-not-memory / backoff+jitter / field-level LWW guidance — MEDIUM
- youngju.dev, "PWA & Offline-First Sync Engines 2026 Deep Dive" (2026-05-16) — Workbox 8 strategies; Dexie (complex domain) vs idb (light tasks); decision tree (basic PWA caching → Workbox+Dexie; single-user data → simple sync, not CRDT); schema version gates — MEDIUM
- Firebase official docs, firestore/manage-data/enable-offline + security/rules-structure (fetched 2026-09-19) — `persistentLocalCache` + `persistentMultipleTabManager` init; cache-only-reads caveat; rules structure — HIGH
- Nuxt recipe-box offline PWA walkthrough (Dec 2025) — concrete push-unsynced-then-pull-merge Dexie↔Firestore implementation with `synced` flag + badges — MEDIUM (pattern corroborates APIScout; framework differs but data layer is framework-agnostic)
- open-spaced-repetition/ts-fsrs GitHub (fetched 2026-09-19, 793★) — `repeat()` preview + `next(card, date, Rating)` apply; FSRS v6; Node ≥20 — HIGH
- hanziwriter.org official docs (fetched 2026-09-19) — `quiz({onMistake, onCorrectStroke, onComplete})`, `showHintAfterMisses`, `leniency`, stroke-data model — HIGH
- npm registry hanzi-writer — v3.7.3 (Sep 2025), zero-dep — HIGH
- Cartesia "JavaScript text to speech with SpeechSynthesis" (2026-09-15) — `voiceschanged` handling; `localService` offline check; no hard-coded voices; hosted-API-vs-browser tradeoff — MEDIUM
- Stack Overflow iOS 26 SpeechSynthesis thread — version-specific Apple voice bugs; sanitize input — LOW (single thread, flagged for validation on real devices)
- Pitch-estimator choice (YIN/autocorrelation/worklet sizing): training knowledge only, no verified current source — LOW, **flagged for phase-specific research spike with on-device measurement**

---
*Architecture research for: Chanki Chinese 4-sided Anki PWA*
*Researched: 2026-09-19*
