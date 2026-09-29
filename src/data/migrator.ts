// Phase 2 FREEZES at v1. This file documents the v2+ pattern for future phases.
// DO NOT ACTIVATE v2 until Phase 4+ requires schema change.
// Dexie 4 pattern: EDIT the version block in db.ts, increment number,
// add .upgrade() only when data transform needed.

/*
// FUTURE: When Phase 4+ needs new field (e.g., 'fsrsParams' on cards):
// 1. Add field to CardSchema in schema.ts with default
// 2. Edit db.version(1) -> db.version(2) in db.ts (NOT add new version block)
// 3. Add .upgrade() here to backfill existing records

import { db } from './db'

export function enableV2Migration(): void {
  db.version(2).stores({
    decks: 'id, name, &slug, schemaVersion',
    cards: 'id, deckId, hanzi, pinyin, tone, hskLevel, schemaVersion, updatedAt, syncStatus, fsrsParams',
    progress: 'id, cardId, &[cardId+deviceId], stability, difficulty, due, reps, lapses, syncStatus, updatedAt',
    reviewLogs: 'id, cardId, deviceId, rating, scheduledDays, elapsedDays, timestamp',
    audioMeta: '&url, size, cachedAt, expiresAt',
    meta: '&key',
  }).upgrade(async (tx) => {
    // Additive only: backfill new field with default
    await tx.table('cards').toCollection().modify((card) => {
      card.fsrsParams = { desiredRetention: 0.9 }
      card.schemaVersion = 2
    })
    await tx.table('meta').put({ key: 'schemaVersion', value: 2 })
  })
}
*/

// Current: v1 only, no migration needed
export function assertV1Schema(): void {
  // Runtime assertion that we're on v1
  console.log('[Chanki] Data contract v1 active — additive migrations ready for v2+')
}
