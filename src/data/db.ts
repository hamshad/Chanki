import { Dexie, type EntityTable } from 'dexie'
import type { Deck, Card, Progress, ReviewLog, AudioMeta, DeviceMeta } from './schema'

/**
 * ChankiDB — the single IndexedDB database for all local state.
 * Dexie is the sole READ source of truth; Firestore is write-ahead only (Phase 6+).
 *
 * Version history:
 *   v1 — Phase 2: base schema (decks, cards, progress, reviewLogs, audioMeta, meta)
 *
 * MIGRATION RULE: To add fields, edit the version number here and add an
 * .upgrade() hook in src/data/migrator.ts. Never stack version blocks.
 */
export const db = new Dexie('ChankiDB') as Dexie & {
  decks: EntityTable<Deck, 'id'>
  cards: EntityTable<Card, 'id'>
  progress: EntityTable<Progress, 'id'>
  reviewLogs: EntityTable<ReviewLog, 'id'>
  audioMeta: EntityTable<AudioMeta, 'url'>
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
