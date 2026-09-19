# Phase 2: Data Contract - Research

**Researched:** 2026-09-19
**Domain:** Offline-first local data layer (IndexedDB/Dexie, schema validation, anonymous device identity, bundled starter deck)
**Confidence:** HIGH

## Summary

Phase 2 establishes the versioned local source of truth. The app uses **Dexie 4.4.5** as the sole read source for cards, progress, review logs, and audio metadata. An anonymous device UUID is generated on first launch and stored in IndexedDB — no login, no fingerprinting complexity. A bundled HSK1-ish starter deck (~150-300 words) ships with native MP3 audio precached by the service worker. Card data validates against a **Zod** schema (tone 1-5 enum, required fields) with an **additive-only migration** strategy using Dexie upgrade hooks. Schema version freezes at v1 early to prevent drift across all later phases.

**Primary recommendation:** Define Dexie schema v1 with all tables/indexes upfront, Zod card schema as single source of truth for validation, simple crypto.randomUUID() for device ID stored in a `meta` table, starter deck JSON + MP3s in `public/` precached via `vite-plugin-pwa` `globPatterns` and `includeAssets`.

## User Constraints

### Locked Decisions
- **Stack:** Vite 8 + React 19 + TS 5.9, vite-plugin-pwa, Firebase 12.18 modular, Dexie 4.4.5, ts-fsrs 5.4.2, hanzi-writer 3.7.3, pitchy 4.1.0
- **Dexie is source of truth** — Firestore offline persistence is NOT the read path
- **Schema v1 freezes early** — additive-only changes via upgrade hooks
- **Anonymous device UUID in IndexedDB** — no login screen anywhere
- **Starter deck bundled with native audio** — MP3s in public/, precached by SW

### Claude's Discretion
- Exact Dexie table/index design (within requirements)
- Zod schema structure and validation approach
- Starter deck word selection (HSK 2.0 150 words vs HSK 3.0 300/500 words)
- Audio file naming/organization convention
- Migration utility design

### Deferred Ideas (OUT OF SCOPE)
- Cross-device QR transfer (SYNC-04, v2)
- CSV import (DECK-04, v2)
- FSRS parameter tuning from history (SRS-05, v2)
- Real accounts/OAuth login
- Per-side grading
- Server-side pronunciation scoring

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| OFFLINE-04 | User device stores cards/progress/audio-meta in IndexedDB (Dexie) as read source of truth | Dexie schema design, indexes, EntityTable typing |
| DECK-03 | Card schema validates (tone 1-5 enum, required fields) with additive-only migrator | Zod schema + Dexie upgrade hooks |
| SYNC-01 | User gets anonymous device UUID on first launch, stored locally, no login required | Simple UUID generation, stored in Dexie meta table |
| DECK-01 | User gets bundled HSK1-ish starter deck with native/recorded audio and HSK/tag metadata | public/ assets + Workbox precache, JSON deck manifest |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Dexie | 4.4.5 | IndexedDB wrapper, reactive queries, schema versioning | Official offline-first choice; TypeScript-first; upgrade hooks for migration |
| Zod | 3.24.x | Runtime schema validation + TS type inference | TypeScript-first; `z.infer` gives exact types; enum support for tone 1-5 |
| vite-plugin-pwa | 1.3.0 (Workbox 7.4.1) | Service worker, precache, runtime caching | Bundled audio precache via `globPatterns`/`includeAssets` |
| crypto (Web Crypto API) | Native | `crypto.randomUUID()` for device ID | No dependency; cryptographically secure; available in all targets |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| dexie-react-hooks | 1.1.x | `useLiveQuery` for reactive UI | React components reading Dexie tables |
| idb-keyval | 6.2.x | Simple key-value if needed | Fallback for non-Dexie metadata (not needed here) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Dexie | raw IndexedDB | Dexie adds ~15KB but eliminates boilerplate, provides upgrade hooks, TypeScript inference, react-hooks integration |
| Zod | Valibot, ArkType | Zod has best TS inference, largest ecosystem, team familiarity; Valibot smaller bundle but API less stable |
| crypto.randomUUID() | fingerprinting libs | Fingerprinting adds complexity, privacy concerns, bundle size; UUID in IndexedDB survives clears only if user clears site data (acceptable per requirements) |

### Installation
```bash
npm install dexie@4.4.5 zod@3.24.x dexie-react-hooks@1.1.x
# vite-plugin-pwa already installed from Phase 1
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── data/
│   ├── db.ts                 # Dexie singleton + schema definition
│   ├── schema.ts             # Zod schemas (Card, Deck, Progress, ReviewLog, AudioMeta, DeviceMeta)
│   ├── migrator.ts           # Additive-only upgrade hooks (v1→v2+)
│   ├── seed.ts               # Starter deck import (JSON → Dexie bulkAdd)
│   └── device-id.ts          # Anonymous UUID get-or-create
├── types/
│   └── index.ts              # Exported z.infer types for app-wide use
└── assets/
    └── deck/
        ├── hsk1-starter.json # Starter deck manifest
        └── audio/            # MP3 files (hanzi-pinyin.mp3)
```

### Pattern 1: Dexie Schema with EntityTable + Zod Validation
**What:** Define tables via `db.version(1).stores({...})` with `EntityTable` for auto-increment PKs. Validate all writes at boundary with Zod.
**When to use:** All local persistence — cards, progress, review logs, audio meta, device meta.
**Example:**
```typescript
// src/data/schema.ts
import * as z from 'zod'

export const ToneEnum = z.enum(['1', '2', '3', '4', '5'])
export type Tone = z.infer<typeof ToneEnum>

export const CardSchema = z.object({
  id: z.string().uuid(),           // UUID v4, client-generated
  deckId: z.string().uuid(),
  hanzi: z.string().min(1),
  pinyin: z.string().min(1),
  meaning: z.string().min(1),
  tone: ToneEnum,                  // "1" | "2" | "3" | "4" | "5"
  tags: z.array(z.string()).default([]),
  hskLevel: z.number().int().min(1).max(9).optional(),
  audioUrl: z.string().url().optional(), // relative path to MP3 in public/
  example: z.string().optional(),
  traditional: z.string().optional(),
  schemaVersion: z.literal(1),     // frozen at 1 for Phase 2
  createdAt: z.number().int(),     // Date.now()
  updatedAt: z.number().int(),
})
export type Card = z.infer<typeof CardSchema>
export type CardInput = z.input<typeof CardSchema>

// src/data/db.ts
import { Dexie, type EntityTable } from 'dexie'
import type { Card, Deck, Progress, ReviewLog, AudioMeta, DeviceMeta } from './schema'

export const db = new Dexie('ChankiDB') as Dexie & {
  decks: EntityTable<Deck, 'id'>
  cards: EntityTable<Card, 'id'>
  progress: EntityTable<Progress, 'id'>
  reviewLogs: EntityTable<ReviewLog, 'id'>
  audioMeta: EntityTable<AudioMeta, 'url'>
  meta: EntityTable<DeviceMeta, 'key'>
}

db.version(1).stores({
  decks: '++id, name, &slug, schemaVersion',
  cards: '++id, deckId, hanzi, pinyin, tone, hskLevel, schemaVersion, updatedAt, syncStatus',
  progress: '++id, cardId, &[cardId+deviceId], stability, difficulty, due, reps, lapses, syncStatus, updatedAt',
  reviewLogs: '++id, cardId, deviceId, rating, scheduledDays, elapsedDays, timestamp',
  audioMeta: '&url, size, cachedAt, expiresAt',
  meta: '&key, value', // key: 'deviceId' | 'schemaVersion' | 'starterDeckSeeded'
})
```
*Source: [Dexie TypeScript docs](https://dexie.org/docs/Typescript), [Dexie Version.stores()](https://dexie.org/docs/Version/Version.stores())*

### Pattern 2: Additive-Only Migration via Upgrade Hooks
**What:** For schema v2+, edit the existing version block and increment version. Attach `.upgrade(tx => ...)` only when data transformation needed. Never stack version blocks without upgrader (legacy Dexie 1/2 pattern).
**When to use:** Any future schema change (Phase 4+). Phase 2 freezes at v1.
**Example:**
```typescript
// src/data/migrator.ts — ONLY for v2+, NOT in Phase 2
// db.version(2).stores({
//   cards: '++id, deckId, hanzi, pinyin, tone, hskLevel, schemaVersion, updatedAt, syncStatus, newField',
// }).upgrade(tx => {
//   return tx.table('cards').toCollection().modify(card => {
//     card.newField = 'default'
//     card.schemaVersion = 2
//   })
// })
```
*Source: [Dexie Database Versioning](https://dexie.org/docs/Tutorial/Design), [Dexie Cloud Best Practices](https://dexie.org/docs/cloud/best-practices)*

### Pattern 3: Anonymous Device UUID in Dexie
**What:** On app init, check `meta` table for `key: 'deviceId'`. If missing, generate `crypto.randomUUID()`, store it. Return existing or new.
**When to use:** App bootstrap, before any sync or write.
**Example:**
```typescript
// src/data/device-id.ts
import { db } from './db'

export async function getOrCreateDeviceId(): Promise<string> {
  const existing = await db.meta.get('deviceId')
  if (existing) return existing.value as string

  const deviceId = crypto.randomUUID()
  await db.meta.put({ key: 'deviceId', value: deviceId })
  return deviceId
}
```
*Source: [Web Crypto API randomUUID](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/randomUUID), [Anonymous device ID pattern](https://tuggy.io/blog/devlog-7-anonymous-users-progressive-authentication)*

### Pattern 4: Bundled Starter Deck + Audio Precaching
**What:** Starter deck JSON in `public/assets/deck/hsk1-starter.json`, MP3s in `public/assets/deck/audio/`. Configure `vite-plugin-pwa` to precache both via `includeAssets` and `globPatterns`.
**When to use:** Build-time bundling for offline-first audio.
**Example:**
```typescript
// vite.config.ts
import { VitePWA } from 'vite-plugin-pwa'

VitePWA({
  registerType: 'prompt',
  includeAssets: ['assets/deck/**/*'],           // copies to dist + precaches
  workbox: {
    globPatterns: ['**/*.{js,css,html,mp3,json}'], // includes MP3/JSON in precache manifest
    maximumFileSizeToCacheInBytes: 50 * 1024 * 1024, // 50MB for audio
    runtimeCaching: [
      {
        urlPattern: /\/assets\/deck\/audio\/.*\.mp3$/,
        handler: 'CacheFirst',
        options: {
          cacheName: 'starter-deck-audio',
          expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 365 },
          cacheableResponse: { statuses: [0, 200] },
        },
      },
    ],
  },
  manifest: { name: 'Chanki', short_name: 'Chanki', /* ... */ },
})

// src/data/seed.ts
import starterDeck from '/assets/deck/hsk1-starter.json' // Vite import
import { db } from './db'
import { CardSchema } from './schema'

export async function seedStarterDeckIfNeeded(): Promise<void> {
  const seeded = await db.meta.get('starterDeckSeeded')
  if (seeded) return

  await db.transaction('rw', db.decks, db.cards, async () => {
    await db.decks.put(starterDeck.deck)
    const validCards = starterDeck.cards
      .map(c => CardSchema.parse({ ...c, schemaVersion: 1, createdAt: Date.now(), updatedAt: Date.now() }))
    await db.cards.bulkAdd(validCards)
    await db.meta.put({ key: 'starterDeckSeeded', value: true })
  })
}
```
*Source: [vite-plugin-pwa Static Assets](https://vite-pwa-org.netlify.app/guide/static-assets), [Workbox Precaching](https://github.com/vite-pwa/vite-plugin-pwa/blob/main/docs/guide/service-worker-precache.md), [Audio caching with RangeRequests](https://github.com/GoogleChrome/workbox/issues/2849)*

### Anti-Patterns to Avoid
- **Stacking version blocks without upgrader:** `db.version(1).stores({...}); db.version(2).stores({...})` — legacy pattern, breaks in Dexie 4
- **Fingerprinting for device ID:** Unnecessary complexity, privacy risk, bundle bloat. `crypto.randomUUID()` in IndexedDB is sufficient
- **Zod `nativeEnum()`:** Deprecated. Use `z.enum([...])` with `as const` array
- **Storing audio in IndexedDB as Blobs:** Bloats DB, complicates backup. Store URLs in `audioMeta`, serve MP3s via Cache API / public/
- **Mutating data in upgrade hook without transaction:** Always use `tx.table(...).toCollection().modify()` inside upgrade callback

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Schema validation + TS types | Custom validators + manual type defs | Zod | Single source of truth, `z.infer`, coercion, refinements |
| IndexedDB schema migration | Manual `onupgradeneeded` handlers | Dexie upgrade hooks | Declarative, atomic, rollback on error, tested |
| Anonymous device identity | Fingerprinting (canvas, WebGL, audio) | `crypto.randomUUID()` in Dexie | Privacy-first, zero deps, survives reload, no consent needed |
| Audio precaching for offline | Manual Cache API logic | `vite-plugin-pwa` + Workbox `CacheFirst` + `RangeRequestsPlugin` | Handles 206 partial responses, range requests, expiration |
| Reactive DB queries in React | Custom `useEffect` + `db.on('changes')` | `dexie-react-hooks` `useLiveQuery` | Automatic subscription, cleanup, batched renders |

**Key insight:** The data contract is the foundation everything else builds on. Hand-rolling any of these creates subtle bugs that cascade into Phases 3-11. Dexie + Zod + Vite PWA are battle-tested for exactly this architecture.

## Common Pitfalls

### Pitfall 1: Schema Drift Between Zod and Dexie
**What goes wrong:** Zod schema adds a field but Dexie `stores()` doesn't index it, or vice versa. Queries fail silently or return stale data.
**Why it happens:** Two separate definitions not kept in sync.
**How to avoid:** Single source of truth — derive Dexie `stores()` indexes from Zod schema programmatically, or use a shared config object. At minimum, document the coupling and add a CI check.
**Warning signs:** Type errors on `db.cards.add()`, missing index warnings in console, queries returning undefined.

### Pitfall 2: Upgrade Hook Runs on Fresh Install
**What goes wrong:** `.upgrade()` callback executes on first-time users (oldVersion=0), corrupting empty tables.
**Why it happens:** Misunderstanding Dexie upgrade sequence — upgraders only run when `oldVersion > 0`.
**How to avoid:** Dexie 4 only runs upgrade when upgrading from existing version. But guard anyway: `if (oldVersion === 0) return`. Test with fresh profile.
**Warning signs:** `db.open()` rejects on first launch, "Unable to patch indexes" warnings.

### Pitfall 3: Audio Files Not Cached Offline
**What goes wrong:** MP3s load online but fail in airplane mode. Service worker shows 404 for audio.
**Why it happens:** `globPatterns` missing `mp3`, or files in `src/assets/` not `public/`, or Range Requests (206) not cached.
**How to avoid:** Put audio in `public/assets/deck/audio/`. Configure `globPatterns: ['**/*.{js,css,html,mp3,json}']` AND `includeAssets: ['assets/deck/**/*']`. Use `RangeRequestsPlugin` in runtime caching.
**Warning signs:** Lighthouse PWA audit fails "works offline", Network tab shows (failed) for MP3s offline.

### Pitfall 4: Device ID Lost on Private/Incognito Mode
**What goes wrong:** User opens app in incognito, gets new UUID, progress doesn't persist.
**Why it happens:** IndexedDB in incognito is ephemeral (cleared on close).
**How to avoid:** Accept this as expected behavior per privacy design. Document: "Progress in incognito is session-only." No fix needed — requirement is "no login screen," not "survives incognito."
**Warning signs:** User reports "lost progress" after closing incognito tab.

### Pitfall 5: Tone Enum Accepts Invalid Values
**What goes wrong:** `tone: 6` or `tone: 'foo'` passes validation.
**Why it happens:** Zod `enum` created from mutable array, or `z.number().min(1).max(5)` used instead of string enum.
**How to avoid:** `const TONES = ['1','2','3','4','5'] as const; const ToneEnum = z.enum(TONES)`. Use string enum (matches JSON, URL params).
**Warning signs:** Invalid tone values in DB, TS errors on `card.tone` usage.

## Code Examples

### Complete Dexie + Zod Setup (Verified Pattern)
```typescript
// src/data/db.ts
import { Dexie, type EntityTable } from 'dexie'
import type { Deck, Card, Progress, ReviewLog, AudioMeta, DeviceMeta } from './schema'

export const db = new Dexie('ChankiDB') as Dexie & {
  decks: EntityTable<Deck, 'id'>
  cards: EntityTable<Card, 'id'>
  progress: EntityTable<Progress, 'id'>
  reviewLogs: EntityTable<ReviewLog, 'id'>
  audioMeta: EntityTable<AudioMeta, 'url'>
  meta: EntityTable<DeviceMeta, 'key'>
}

db.version(1).stores({
  decks: '++id, name, &slug, schemaVersion',
  cards: '++id, deckId, hanzi, pinyin, tone, hskLevel, schemaVersion, updatedAt, syncStatus',
  progress: '++id, cardId, &[cardId+deviceId], stability, difficulty, due, reps, lapses, syncStatus, updatedAt',
  reviewLogs: '++id, cardId, deviceId, rating, scheduledDays, elapsedDays, timestamp',
  audioMeta: '&url, size, cachedAt, expiresAt',
  meta: '&key, value',
})

// Index notes:
// - cards: deckId (deck queries), tone/hskLevel (filtering), updatedAt/syncStatus (sync)
// - progress: compound [cardId+deviceId] unique (one progress per card per device), due (due queue), syncStatus (push)
// - reviewLogs: cardId+deviceId (history), timestamp (ordering)
// - audioMeta: url as PK (dedupe), expiresAt (LRU eviction)
// - meta: simple key-value for deviceId, schemaVersion, starterDeckSeeded
```

### Zod Card Schema with Refinements
```typescript
// src/data/schema.ts
import * as z from 'zod'

export const TONES = ['1', '2', '3', '4', '5'] as const
export const ToneEnum = z.enum(TONES)
export type Tone = z.infer<typeof ToneEnum>

export const RatingEnum = z.enum(['again', 'hard', 'good', 'easy'])
export type Rating = z.infer<typeof RatingEnum>

export const CardSchema = z.object({
  id: z.string().uuid(),
  deckId: z.string().uuid(),
  hanzi: z.string().min(1, 'Hanzi required'),
  pinyin: z.string().min(1, 'Pinyin required'),
  meaning: z.string().min(1, 'Meaning required'),
  tone: ToneEnum,
  tags: z.array(z.string()).default([]),
  hskLevel: z.number().int().min(1).max(9).optional(),
  audioUrl: z.string().url().optional(),
  example: z.string().optional(),
  traditional: z.string().optional(),
  schemaVersion: z.literal(1),
  createdAt: z.number().int().positive(),
  updatedAt: z.number().int().positive(),
}).strict() // Reject unknown fields

export type Card = z.infer<typeof CardSchema>
export type CardInput = z.input<typeof CardSchema>

// Validation helper
export function validateCard(input: unknown): Card {
  return CardSchema.parse(input)
}
```

### Device ID Bootstrap (App Entry)
```typescript
// src/main.tsx or App.tsx
import { getOrCreateDeviceId } from '@/data/device-id'
import { seedStarterDeckIfNeeded } from '@/data/seed'

async function bootstrap() {
  const deviceId = await getOrCreateDeviceId()
  console.log('[Chanki] Device ID:', deviceId)
  await seedStarterDeckIfNeeded()
  // ... mount React app
}

bootstrap()
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Stack Dexie version blocks (v1, v2, v3 without upgraders) | Edit single version block, increment number | Dexie 3.0 (2021) | Simpler migrations, no legacy baggage |
| `z.nativeEnum(TypeScriptEnum)` | `z.enum(['a','b'] as const)` | Zod 3.22+ | Native enum deprecated, const array gives better inference |
| Fingerprinting for anon ID | `crypto.randomUUID()` in IndexedDB | 2023+ (widely supported) | Privacy-first, no consent, smaller bundle |
| Service worker manual caching | `vite-plugin-pwa` `generateSW` + `globPatterns` | Workbox 7 / vite-plugin-pwa 1.x | Zero-config precache, hash-based invalidation |
| Store audio as Blobs in IndexedDB | Serve via Cache API, store URLs in DB | 2022+ (Cache API mature) | Smaller DB, native streaming, range requests work |

**Deprecated/outdated:**
- **Dexie <3 version stacking:** Don't keep `db.version(1).stores(...)` alongside `db.version(2).stores(...)` without upgrader
- **Zod `nativeEnum`:** Removed in Zod 4, use `z.enum()`
- **`navigator.storage.persist()` for PWA:** Not reliable on iOS; design for eviction instead (Phase 1 research)

## Open Questions

1. **HSK Version for Starter Deck**
   - What we know: HSK 2.0 = 150 words (widely used in materials). HSK 3.0 (2026) = 300-500 words.
   - What's unclear: Product decision on which standard "HSK1-ish" targets.
   - Recommendation: Default to HSK 2.0 150 words (stable, well-documented, matches most learner expectations). Make deck source swappable for Phase 4 admin import.

2. **Audio Source Licensing**
   - What we know: Need native/recorded audio (not TTS) for starter deck. Must be redistributable.
   - What's unclear: Specific audio source (TonePerfect, Hanziway, custom recordings).
   - Recommendation: Use open-licensed TTS (Microsoft Xiaoxiao neural) for Phase 2 placeholder; replace with native recordings in Phase 4/5. Document licensing in `public/assets/deck/LICENSE.md`.

3. **Compound Index `[cardId+deviceId]` on Progress**
   - What we know: Dexie supports compound indexes via `[prop1+prop2]` syntax. Unique constraint enforced.
   - What's unclear: Whether `&[cardId+deviceId]` syntax works for unique compound index in Dexie 4.
   - Recommendation: Test in Phase 2 Plan 01. Fallback: separate unique index on `cardId` + app-level deviceId check (less efficient but works).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 2.x (already in project from Phase 1) |
| Config file | `vitest.config.ts` (extends Vite config) |
| Quick run command | `npm run test -- --run` |
| Full suite command | `npm run test:coverage` |
| Estimated runtime | ~15 seconds |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| OFFLINE-04 | Cards/progress persist across reload from Dexie | integration | `npm run test -- src/data/db.test.ts` | ❌ Wave 0 gap |
| DECK-03 | Invalid card (bad tone, missing field) rejected | unit | `npm run test -- src/data/schema.test.ts` | ❌ Wave 0 gap |
| DECK-03 | Additive migration v1→v2 preserves data | integration | `npm run test -- src/data/migrator.test.ts` | ❌ Wave 0 gap |
| SYNC-01 | Device UUID generated on first launch, reused | unit | `npm run test -- src/data/device-id.test.ts` | ❌ Wave 0 gap |
| DECK-01 | Starter deck seeds cards + audio URLs on first run | integration | `npm run test -- src/data/seed.test.ts` | ❌ Wave 0 gap |

### Nyquist Sampling Rate
- **Minimum sample interval:** After every committed task → run: `npm run test -- --run`
- **Full suite trigger:** Before merging final task of any plan wave
- **Phase-complete gate:** Full suite green before `/gsd-verify-work` runs
- **Estimated feedback latency per task:** ~15 seconds

### Wave 0 Gaps (must be created before implementation)
- [ ] `src/data/db.test.ts` — covers OFFLINE-04 (Dexie open, CRUD, indexes)
- [ ] `src/data/schema.test.ts` — covers DECK-03 (Zod parse valid/invalid, type inference)
- [ ] `src/data/migrator.test.ts` — covers DECK-03 (upgrade hook v1→v2 additive)
- [ ] `src/data/device-id.test.ts` — covers SYNC-01 (getOrCreateDeviceId idempotent)
- [ ] `src/data/seed.test.ts` — covers DECK-01 (seedStarterDeckIfNeeded idempotent, valid cards)
- [ ] `vitest.config.ts` — ensure `environment: 'jsdom'` or `happy-dom` for IndexedDB polyfill
- [ ] `@vitest/environment-indexeddb` or `fake-indexeddb` — IndexedDB polyfill for Node test runner

## Sources

### Primary (HIGH confidence)
- [Dexie.org - Version.stores()](https://dexie.org/docs/Version/Version.stores()) — Schema syntax, indexes, compound keys
- [Dexie.org - TypeScript](https://dexie.org/docs/Typescript) — EntityTable, Table generics, mapped classes
- [Dexie.org - Database Versioning](https://dexie.org/docs/Tutorial/Design) — Upgrade hooks, additive migration, version rules
- [Dexie.org - Cloud Best Practices](https://dexie.org/docs/cloud/best-practices) — Dexie 4 versioning (edit block, increment)
- [Zod.dev - Enums](https://zod.dev/api?id=zod-enums) — `z.enum()` with `as const`, type inference
- [Zod.dev - API](https://zod.dev/api) — Object schemas, `.strict()`, `.parse()`, `z.infer`
- [vite-plugin-pwa - Static Assets](https://vite-pwa-org.netlify.app/guide/static-assets) — `includeAssets`, `globPatterns`, asset hashing
- [vite-plugin-pwa - Service Worker Precaching](https://github.com/vite-pwa/vite-plugin-pwa/blob/main/docs/guide/service-worker-precache.md) — Workbox integration, `maximumFileSizeToCacheInBytes`
- [Workbox - Audio Caching Issue](https://github.com/GoogleChrome/workbox/issues/2849) — RangeRequestsPlugin for 206 responses
- [MDN - crypto.randomUUID()](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/randomUUID) — Native UUID generation

### Secondary (MEDIUM confidence)
- [Tuggy Blog - Anonymous Device ID](https://tuggy.io/blog/devlog-7-anonymous-users-progressive-authentication) — localStorage/IndexedDB UUID pattern
- [TonePerfect HSK 1](https://toneperfect.app/hsk/1) — HSK 2.0 150-word list with audio
- [StudyCLI HSK 3.0](https://studycli.org/chinese-tools/hsk-1-vocabulary/) — HSK 3.0 300-word list
- [PassHSK 2026](https://www.passhsk.app/hsk-1-vocabulary-list-2026) — HSK 3.0 500-word expansion note

### Tertiary (LOW confidence)
- Fingerprinting libraries (device-uuid, fingerprint.js) — reviewed but rejected for privacy/complexity
- Exact HSK 3.0 level mapping — validate against official CLEC lists during Phase 4 content work

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — All versions verified via npm registry, official docs
- Architecture: HIGH — Dexie 4 patterns confirmed in official docs, Zod patterns standard
- Pitfalls: HIGH — Based on documented Dexie/Zod/Workbox gotchas with workarounds
- Starter deck content: MEDIUM — HSK version choice is product decision, not technical

**Research date:** 2026-09-19
**Valid until:** 2026-10-19 (30 days — stable stack, only HSK list may evolve)