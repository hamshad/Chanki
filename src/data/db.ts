import { Dexie, type EntityTable } from 'dexie'
import type { Progress, ReviewLog, DeviceMeta } from './schema'

/**
 * ChankiDB — local state ONLY: review progress, logs, device meta.
 * Character data lives in Firestore (read-only for users, see remoteCards.ts)
 * and is cached by Firestore's own IndexedDB persistence — never in Dexie.
 *
 * Version history:
 *   v1 — Phase 2: base schema (decks, cards, progress, reviewLogs, audioMeta, meta)
 *   v2 — cards/decks/audioMeta dropped: character data moved to Firestore,
 *        progress remains device-local (synced to devices/{id}/progress)
 *
 * MIGRATION RULE: To add fields, edit the version number here and add an
 * .upgrade() hook in src/data/migrator.ts. Never stack version blocks.
 */
export const db = new Dexie('ChankiDB') as Dexie & {
  progress: EntityTable<Progress, 'id'>
  reviewLogs: EntityTable<ReviewLog, 'id'>
  meta: EntityTable<DeviceMeta, 'key'>
}

db.version(1).stores({
  // Index notes:
  //   &  → unique index
  //   ++ → auto-increment (not used here; UUIDs as PKs)
  //   [a+b] → compound index
  decks: 'id, name, &slug, schemaVersion',
  cards: 'id, deckId, hanzi, pinyin, tone, hskLevel, schemaVersion, updatedAt, syncStatus',
  progress: 'id, cardId, &[cardId+deviceId], stability, difficulty, due, reps, lapses, syncStatus, updatedAt',
  reviewLogs: 'id, cardId, deviceId, rating, scheduledDays, elapsedDays, timestamp',
  audioMeta: '&url, size, cachedAt, expiresAt',
  meta: '&key',
})

// v2: null drops a table. Progress/reviewLogs/meta untouched.
db.version(2).stores({
  decks: null,
  cards: null,
  audioMeta: null,
  progress: 'id, cardId, &[cardId+deviceId], stability, difficulty, due, reps, lapses, syncStatus, updatedAt',
  reviewLogs: 'id, cardId, deviceId, rating, scheduledDays, elapsedDays, timestamp',
  meta: '&key',
})
