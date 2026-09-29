import { db } from './db'

/**
 * Returns the anonymous device UUID, creating it on first launch.
 *
 * - Uses native crypto.randomUUID() — no dependencies, cryptographically secure.
 * - Stored under `meta.deviceId` in Dexie (persists across page reloads).
 * - Incognito/private mode: ephemeral by design — progress is session-only.
 * - No PII stored; this ID is never linked to a real user.
 */
export async function getOrCreateDeviceId(): Promise<string> {
  const existing = await db.meta.get('deviceId')
  if (existing) return existing.value as string

  const deviceId = crypto.randomUUID()
  await db.meta.put({ key: 'deviceId', value: deviceId })
  return deviceId
}
