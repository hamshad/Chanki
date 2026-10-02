/**
 * Sync engine — persists user data (progress, review logs, day-complete
 * stamp, device metadata) to Firestore while Dexie stays the offline source
 * of truth.
 *
 * Write path: every review hits Dexie first (saveReview → scheduleSync);
 * push sends rows still flagged pending. Offline reviews simply sit in the
 * queue until connectivity returns — triggers cover: after each review
 * (debounced), page load, `online`, tab visible, and a 60s interval retry.
 *
 * Read path: pull merges remote rows — progress LWW by updatedAt, logs
 * union by id, day-stamp furthest-wins (see syncMerge.ts).
 */

import { db } from './db'
import { firestore } from './firebase'
import { collection, doc, getDoc, getDocs, setDoc, writeBatch } from 'firebase/firestore'
import { getOrCreateDeviceId } from './device-id'
import { collectSignals } from './fingerprint'
import {
  buildDeviceDoc,
  chunk,
  mergeLogRow,
  mergeProgressRow,
  shouldAdoptRemoteDay,
} from './syncMerge'
import { ProgressSchema, ReviewLogSchema, type Progress, type ReviewLog } from './schema'

/** Firestore writeBatch caps at 500 ops — stay well under. */
const BATCH_SIZE = 400
const RETRY_INTERVAL_MS = 60_000
const DEBOUNCE_MS = 2_000

let inFlight: Promise<void> | null = null
let debounceTimer: ReturnType<typeof setTimeout> | null = null

/** Debounced trigger — called after each local review. */
export function scheduleSync(delayMs = DEBOUNCE_MS): void {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    void syncNow()
  }, delayMs)
}

/** Run a sync now; concurrent callers await the same run. */
export async function syncNow(): Promise<void> {
  if (inFlight) return inFlight
  if (typeof navigator !== 'undefined' && !navigator.onLine) return
  inFlight = runSync().finally(() => {
    inFlight = null
  })
  return inFlight
}

async function runSync(): Promise<void> {
  window.dispatchEvent(new CustomEvent('sync:start'))
  try {
    await push()
    await pull()
    window.dispatchEvent(new CustomEvent('sync:end', { detail: { success: true } }))
  } catch (err) {
    console.error('[Sync] failed:', err)
    window.dispatchEvent(new CustomEvent('sync:end', { detail: { success: false, error: err } }))
  }
}

// ─── PUSH ─────────────────────────────────────────────────────────────────────

interface OutboundPath {
  path: string
  data: Record<string, unknown>
}

async function push(): Promise<void> {
  const deviceId = await getOrCreateDeviceId()
  const now = Date.now()

  const dayRow = await db.meta.get('lastCompletedDay')
  const deviceDoc = buildDeviceDoc({
    fingerprint: deviceId, // identity IS the fingerprint (see device-id.ts)
    signals: collectSignals(),
    lastCompletedDay: typeof dayRow?.value === 'string' ? dayRow.value : undefined,
    now,
  })
  await setDoc(doc(firestore, 'devices', deviceId), deviceDoc, { merge: true })

  const pendingProgress = await db.progress.where('syncStatus').equals('pending').toArray()
  // Logs are immutable: everything not yet flagged synced (older rows may
  // predate the syncStatus field entirely).
  const pendingLogs = (await db.reviewLogs.toArray()).filter(l => l.syncStatus !== 'synced')

  const work: OutboundPath[] = [
    ...pendingProgress.map(item => {
      const { syncStatus, ...remote } = item
      void syncStatus
      return { path: `devices/${deviceId}/progress/${item.id}`, data: remote }
    }),
    ...pendingLogs.map(item => {
      const { syncStatus, ...remote } = item
      void syncStatus
      return { path: `devices/${deviceId}/reviewLogs/${item.id}`, data: remote }
    }),
  ]

  for (const group of chunk(work, BATCH_SIZE)) {
    if (group.length === 0) continue
    const batch = writeBatch(firestore)
    for (const item of group) batch.set(doc(firestore, item.path), item.data)
    await batch.commit()
  }

  await markPushed(pendingProgress, pendingLogs)
}

/**
 * Flag pushed rows as synced — but only when their content did not advance
 * locally while the batch was in flight (a newer write stays pending and is
 * pushed on the next run).
 */
async function markPushed(progress: Progress[], logs: ReviewLog[]): Promise<void> {
  await db.transaction('rw', db.progress, db.reviewLogs, async () => {
    for (const row of progress) {
      const current = await db.progress.get(row.id)
      if (current && current.updatedAt === row.updatedAt) {
        await db.progress.update(row.id, { syncStatus: 'synced' })
      }
    }
    for (const row of logs) {
      const current = await db.reviewLogs.get(row.id)
      if (current && current.syncStatus !== 'synced') {
        await db.reviewLogs.update(row.id, { syncStatus: 'synced' })
      }
    }
  })
}

// ─── PULL ─────────────────────────────────────────────────────────────────────

async function pull(): Promise<void> {
  const deviceId = await getOrCreateDeviceId()

  const deviceSnap = await getDoc(doc(firestore, 'devices', deviceId))
  const [progressSnap, logsSnap] = await Promise.all([
    getDocs(collection(firestore, `devices/${deviceId}/progress`)),
    getDocs(collection(firestore, `devices/${deviceId}/reviewLogs`)),
  ])

  const remoteDay = deviceSnap.exists() ? deviceSnap.data().lastCompletedDay : undefined
  const remoteProgress: Progress[] = []
  for (const docSnap of progressSnap.docs) {
    const parsed = ProgressSchema.safeParse({ ...docSnap.data(), id: docSnap.id })
    if (parsed.success) remoteProgress.push(parsed.data)
    else console.warn('[Sync] dropping invalid remote progress row', docSnap.id)
  }
  const remoteLogs: ReviewLog[] = []
  for (const docSnap of logsSnap.docs) {
    const parsed = ReviewLogSchema.safeParse({ ...docSnap.data(), id: docSnap.id })
    if (parsed.success) remoteLogs.push(parsed.data)
    else console.warn('[Sync] dropping invalid remote review log', docSnap.id)
  }

  await db.transaction('rw', db.progress, db.reviewLogs, db.meta, async () => {
    for (const remote of remoteProgress) {
      // Match by id first, then by card+device — after an identity re-home,
      // a remote row and its local counterpart can carry different ids.
      const byId = await db.progress.get(remote.id)
      const local =
        byId ??
        (await db.progress
          .where('[cardId+deviceId]')
          .equals([remote.cardId, remote.deviceId])
          .first())
      const merged = mergeProgressRow(local, remote)
      if (merged) await db.progress.put(merged)
    }
    for (const remote of remoteLogs) {
      const merged = mergeLogRow(await db.reviewLogs.get(remote.id), remote)
      if (merged) await db.reviewLogs.put(merged)
    }
    const localDay = await db.meta.get('lastCompletedDay')
    if (shouldAdoptRemoteDay(localDay?.value, remoteDay)) {
      await db.meta.put({ key: 'lastCompletedDay', value: remoteDay })
    }
  })
}

// ─── TRIGGERS ─────────────────────────────────────────────────────────────────

/** Wired once at bootstrap (outside React). */
export function initBackgroundSync(): void {
  window.addEventListener('online', () => void syncNow())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') scheduleSync(500)
  })
  setInterval(() => void syncNow(), RETRY_INTERVAL_MS)
  void syncNow()
}
