import { db } from './db'
import type { Progress, ReviewLog } from '../types'

/**
 * Persists a graded review atomically:
 *   1. Upserts the Progress row (one per [cardId+deviceId]) with updated FSRS state.
 *   2. Appends a new immutable ReviewLog entry (never overwrites).
 *
 * This is the ONLY write path for review data. All callers must go through here.
 *
 * @param progress  The updated Progress fields from scheduler.apply() — id will be
 *                  resolved by looking up the existing row or generating a new UUID.
 * @param reviewLog The new ReviewLog entry from scheduler.apply() — always inserted,
 *                  never overwriting a prior entry.
 * @returns         The persisted Progress id and new ReviewLog id.
 */
export async function saveReview(
  progress: Omit<Progress, 'id'>,
  reviewLog: Omit<ReviewLog, 'id'>,
): Promise<{ progressId: string; reviewLogId: string }> {
  let progressId: string
  let reviewLogId: string

  await db.transaction('rw', db.progress, db.reviewLogs, async () => {
    // ── 1. Upsert Progress ─────────────────────────────────────────────────
    // Find existing record by [cardId+deviceId] compound index.
    const existing = await db.progress
      .where('[cardId+deviceId]')
      .equals([progress.cardId, progress.deviceId])
      .first()

    if (existing) {
      // Update in place — keeps same id
      await db.progress.update(existing.id, {
        ...progress,
        id: existing.id, // ensure id is preserved
      })
      progressId = existing.id
    } else {
      // First review for this card on this device — create new row
      const newId = crypto.randomUUID()
      await db.progress.add({ ...progress, id: newId } as Progress)
      progressId = newId
    }

    // ── 2. Append ReviewLog ────────────────────────────────────────────────
    // Always insert, never update — immutable audit trail.
    const logId = crypto.randomUUID()
    await db.reviewLogs.add({ ...reviewLog, id: logId } as ReviewLog)
    reviewLogId = logId
  })

  return { progressId: progressId!, reviewLogId: reviewLogId! }
}

/**
 * Returns the current Progress for a card on this device, or null if never reviewed.
 */
export async function getProgress(
  cardId: string,
  deviceId: string,
): Promise<Progress | null> {
  const row = await db.progress
    .where('[cardId+deviceId]')
    .equals([cardId, deviceId])
    .first()
  return row ?? null
}

/**
 * Returns all ReviewLog entries for a card (chronological order).
 */
export async function getReviewHistory(
  cardId: string,
  deviceId: string,
): Promise<ReviewLog[]> {
  return db.reviewLogs
    .where('cardId')
    .equals(cardId)
    .filter((log) => log.deviceId === deviceId)
    .sortBy('timestamp')
}
