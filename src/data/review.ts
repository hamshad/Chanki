import { db } from './db'
import type { Progress, ReviewLog } from '../types'
import { localDayStamp } from '../utils/day'

const INTRODUCED_KEY = 'newIntroduced'

/**
 * Fresh cards introduced (first-reviewed) today, per the Anki deck option
 * "New cards/day". Stored as { day, count } in meta; stale days count as 0.
 */
export async function getIntroducedToday(now = Date.now()): Promise<number> {
  const row = await db.meta.get(INTRODUCED_KEY)
  const value = row?.value as { day?: string; count?: number } | undefined
  if (!value || value.day !== localDayStamp(new Date(now))) return 0
  return value.count ?? 0
}

async function bumpIntroducedToday(now: number): Promise<void> {
  const row = await db.meta.get(INTRODUCED_KEY)
  const value = row?.value as { day?: string; count?: number } | undefined
  const day = localDayStamp(new Date(now))
  const count = value?.day === day ? (value.count ?? 0) + 1 : 1
  await db.meta.put({ key: INTRODUCED_KEY, value: { day, count } })
}

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

  // The caller's deviceId may be stale if an identity re-home happened
  // mid-session — the deviceId in meta is authoritative for new writes.
  const metaDevice = await db.meta.get('deviceId')
  const activeDeviceId =
    typeof metaDevice?.value === 'string' ? metaDevice.value : progress.deviceId
  const row: Omit<Progress, 'id'> = { ...progress, deviceId: activeDeviceId }
  const log: Omit<ReviewLog, 'id'> = { ...reviewLog, deviceId: activeDeviceId }

  await db.transaction('rw', db.progress, db.reviewLogs, db.meta, async () => {
    // ── 1. Upsert Progress ─────────────────────────────────────────────────
    // Find existing record by [cardId+deviceId] compound index.
    const existing = await db.progress
      .where('[cardId+deviceId]')
      .equals([row.cardId, row.deviceId])
      .first()

    if (existing) {
      // Update in place — keeps same id
      await db.progress.update(existing.id, {
        ...row,
        id: existing.id, // ensure id is preserved
      })
      progressId = existing.id
    } else {
      // First review for this card on this device — create new row and count
      // it against today's new-cards/day limit (Anki: card "introduced").
      const newId = crypto.randomUUID()
      await db.progress.add({ ...row, id: newId } as Progress)
      progressId = newId
      await bumpIntroducedToday(log.timestamp)
    }

    // ── 2. Append ReviewLog ────────────────────────────────────────────────
    // Always insert, never update — immutable audit trail.
    const logId = crypto.randomUUID()
    await db.reviewLogs.add({ ...log, id: logId } as ReviewLog)
    reviewLogId = logId
  })

  // Background sync (debounced) — dynamic import keeps the engine (and its
  // Firestore module) out of unit-test module graphs; offline reviews stay
  // queued in Dexie until connectivity returns.
  void import('./sync')
    .then(m => m.scheduleSync())
    .catch(() => {})

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
