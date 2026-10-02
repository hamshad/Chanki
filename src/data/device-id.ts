import { db } from './db'
import { computeFingerprint } from './fingerprint'

/**
 * Device identity — DERIVED from the device fingerprint, never a random
 * UUID that dies with local storage. Clear storage / reinstall / incognito:
 * the same hardware recomputes the same id, so Firestore data is found
 * again with zero prompts.
 *
 * Legacy migration: earlier builds minted a random uuid into meta.deviceId;
 * on first run with the derived scheme, local rows are re-homed from that
 * uuid to the fingerprint id (remote copies under the old uuid path are
 * superseded — local data, the source of truth, is pushed to the new path).
 *
 * No PII stored; this id is never linked to a real user.
 */
export async function getOrCreateDeviceId(): Promise<string> {
  const fingerprint = await getFingerprint()

  const row = await db.meta.get('deviceId')
  const stored = typeof row?.value === 'string' ? row.value : null

  if (stored === fingerprint) return fingerprint

  if (stored && stored !== fingerprint) {
    // Legacy uuid (or a stale fingerprint after a signal change) → re-home.
    await rehomeLocalDeviceId(stored, fingerprint)
  }

  await db.meta.put({ key: 'deviceId', value: fingerprint })
  return fingerprint
}

/** Derived identity (cached in meta purely as a memo — recomputable). */
export async function getFingerprint(): Promise<string> {
  const row = await db.meta.get('fingerprint')
  if (typeof row?.value === 'string') return row.value
  const fingerprint = await computeFingerprint()
  await db.meta.put({ key: 'fingerprint', value: fingerprint })
  return fingerprint
}

/**
 * Rewrite all local rows from deviceId `from` to `to`, including the
 * unique [cardId+deviceId] collision case (keep the newer content under
 * the surviving row's id, drop the stale duplicate). Re-homed rows are
 * re-flagged pending so the next sync uploads them under `to`.
 */
async function rehomeLocalDeviceId(from: string, to: string): Promise<void> {
  await db.transaction('rw', db.progress, db.reviewLogs, db.meta, async () => {
    const logs = await db.reviewLogs.where('deviceId').equals(from).toArray()
    for (const log of logs) await db.reviewLogs.update(log.id, { deviceId: to })

    const rows = await db.progress.filter(p => p.deviceId === from).toArray()
    for (const row of rows) {
      const clash = await db.progress
        .where('[cardId+deviceId]')
        .equals([row.cardId, to])
        .first()
      if (clash && clash.id !== row.id) {
        if (row.updatedAt > clash.updatedAt) {
          await db.progress.put({ ...row, id: clash.id, deviceId: to, syncStatus: 'pending' })
        }
        await db.progress.delete(row.id)
      } else {
        await db.progress.update(row.id, { deviceId: to, syncStatus: 'pending' })
      }
    }
  })
}
