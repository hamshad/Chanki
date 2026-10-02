/**
 * Pure sync helpers — conflict resolution and doc builders shared by the
 * sync engine. No I/O: Firestore imports live in sync.ts.
 *
 * Conflict rules (Anki-style multi-device semantics):
 *   • Progress rows  → last-write-wins by `updatedAt`
 *   • Review logs    → append-only union by id (never overwritten)
 *   • Day-complete   → furthest local-day stamp wins (ISO stamps compare
 *                      lexicographically)
 */

import type { Progress, ReviewLog } from './schema'
import type { DeviceSignals } from './fingerprint'

export interface DeviceDoc {
  fingerprint: string
  app: string
  userAgent: string
  platform: string
  timeZone: string
  language: string
  screen: string
  pixelRatio: number
  lastCompletedDay?: string
  lastSeenAt: number
  updatedAt: number
}

export function buildDeviceDoc(args: {
  fingerprint: string
  signals: DeviceSignals
  lastCompletedDay?: string
  now: number
}): DeviceDoc {
  const { fingerprint, signals, lastCompletedDay, now } = args
  return {
    fingerprint,
    app: 'chanki-web',
    userAgent: signals.userAgent,
    platform: signals.platform,
    timeZone: signals.timeZone,
    language: signals.language,
    screen: `${signals.screenWidth}x${signals.screenHeight}x${signals.colorDepth}`,
    pixelRatio: signals.pixelRatio,
    ...(lastCompletedDay ? { lastCompletedDay } : {}),
    lastSeenAt: now,
    updatedAt: now,
  }
}

/**
 * Merge a pulled remote progress row into the local one.
 * Returns the row to write, or null when the local copy wins (no write).
 * When ids differ (post-re-home match by card+device) the local row's
 * identity is kept — progress has a unique [cardId+deviceId] constraint.
 */
export function mergeProgressRow(local: Progress | undefined, remote: Progress): Progress | null {
  if (!local) return { ...remote, syncStatus: 'synced' }
  if (local.updatedAt < remote.updatedAt) {
    return { ...remote, syncStatus: 'synced', id: local.id, deviceId: local.deviceId }
  }
  return null
}

/** Merge a pulled remote review log. Immutable — only unseen ids are written. */
export function mergeLogRow(local: ReviewLog | undefined, remote: ReviewLog): ReviewLog | null {
  if (!local) return { ...remote, syncStatus: 'synced' }
  return null
}

/** Adopt the remote day-complete stamp when it is ahead of the local one. */
export function shouldAdoptRemoteDay(local: unknown, remote: unknown): boolean {
  if (typeof remote !== 'string' || remote.length === 0) return false
  return typeof local !== 'string' || local.length === 0 || remote > local
}

/**
 * Resolve a fingerprint match to a deviceId. Exactly-one keeps identical-
 * hardware collisions from stealing another user's deck; ambiguous matches
 * fall back to a fresh local identity.
 */
export function pickAdoptedDevice(candidates: { id: string }[]): string | null {
  return candidates.length === 1 ? candidates[0].id : null
}

export function chunk<T>(items: T[], size: number): T[][] {
  const groups: T[][] = []
  for (let i = 0; i < items.length; i += size) groups.push(items.slice(i, i + size))
  return groups
}
