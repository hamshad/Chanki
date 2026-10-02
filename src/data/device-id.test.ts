import { describe, it, expect, beforeEach, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  // Reset module cache so db re-opens fresh per test
  vi.resetModules()
})

/** Fresh Dexie (indexedDB swap above) with cleared identity + row tables. */
async function freshDb() {
  const { db } = await import('./db')
  await db.open()
  await db.meta.clear()
  await db.progress.clear()
  await db.reviewLogs.clear()
  return db
}

const DERIVED_RE = /^[0-9a-f]{16,64}$/

describe('getOrCreateDeviceId — derived identity', () => {
  it('returns the fingerprint (not a stored random uuid)', async () => {
    const db = await freshDb()
    const { computeFingerprint } = await import('./fingerprint')
    const { getOrCreateDeviceId } = await import('./device-id')

    const expected = await computeFingerprint()
    const id = await getOrCreateDeviceId()
    expect(id).toMatch(DERIVED_RE)
    expect(id).toBe(expected)
    db.close()
  })

  it('is idempotent across calls', async () => {
    const db = await freshDb()
    const { getOrCreateDeviceId } = await import('./device-id')
    const id1 = await getOrCreateDeviceId()
    const id2 = await getOrCreateDeviceId()
    expect(id1).toBe(id2)
    db.close()
  })

  it('stores deviceId under meta key "deviceId"', async () => {
    const db = await freshDb()
    const { getOrCreateDeviceId } = await import('./device-id')
    const id = await getOrCreateDeviceId()
    expect((await db.meta.get('deviceId'))?.value).toBe(id)
    db.close()
  })

  it('survives a storage wipe: same device, empty meta → same id', async () => {
    const db = await freshDb()
    const { getOrCreateDeviceId } = await import('./device-id')

    const before = await getOrCreateDeviceId()
    // Simulate cleared storage / reinstall / incognito entry
    await db.meta.clear()
    const after = await getOrCreateDeviceId()
    expect(after).toBe(before)
    db.close()
  })

  it('migrates a legacy stored uuid: rows re-homed to the derived id', async () => {
    const db = await freshDb()
    const { computeFingerprint } = await import('./fingerprint')
    const { getOrCreateDeviceId } = await import('./device-id')

    const derived = await computeFingerprint()
    const legacy = '12345678-1234-4234-8234-123456789012'
    await db.meta.put({ key: 'deviceId', value: legacy })
    await db.progress.put({
      id: '00000000-0000-4000-8000-000000000001',
      cardId: '00000000-0000-4000-8000-0000000000c1',
      deviceId: legacy,
      due: 1000,
      stability: 1,
      difficulty: 5,
      reps: 1,
      lapses: 0,
      state: 2,
      updatedAt: 1000,
      syncStatus: 'pending',
    })
    await db.reviewLogs.put({
      id: '00000000-0000-4000-8000-000000000009',
      cardId: '00000000-0000-4000-8000-0000000000c1',
      deviceId: legacy,
      rating: 'good',
      scheduledDays: 1,
      elapsedDays: 0,
      timestamp: 999,
    })

    const id = await getOrCreateDeviceId()
    expect(id).toBe(derived)
    expect((await db.meta.get('deviceId'))?.value).toBe(derived)

    const row = await db.progress.get('00000000-0000-4000-8000-000000000001')
    expect(row?.deviceId).toBe(derived)
    expect(row?.syncStatus).toBe('pending')
    const log = await db.reviewLogs.get('00000000-0000-4000-8000-000000000009')
    expect(log?.deviceId).toBe(derived)
    db.close()
  })

  it('migration keeps the newer copy when the same card exists under both ids', async () => {
    const db = await freshDb()
    const { computeFingerprint } = await import('./fingerprint')
    const { getOrCreateDeviceId } = await import('./device-id')

    const derived = await computeFingerprint()
    const legacy = '12345678-1234-4234-8234-123456789012'
    await db.meta.put({ key: 'deviceId', value: legacy })

    const base = {
      cardId: '00000000-0000-4000-8000-0000000000c1',
      due: 0,
      stability: 1,
      difficulty: 5,
      elapsed_days: 0,
      scheduled_days: 0,
      lapses: 0,
      state: 1,
      last_review: 0,
      syncStatus: 'pending' as const,
    }
    // Older content under the legacy id, newer under the derived id
    await db.progress.put({ ...base, id: 'row-legacy', deviceId: legacy, reps: 2, updatedAt: 1000 })
    await db.progress.put({ ...base, id: 'row-derived', deviceId: derived, reps: 9, updatedAt: 2000 })

    await getOrCreateDeviceId()

    expect(await db.progress.get('row-legacy')).toBeUndefined()
    const survivor = await db.progress.get('row-derived')
    expect(survivor?.deviceId).toBe(derived)
    expect(survivor?.reps).toBe(9)
    expect(
      await db.progress.where('cardId').equals('00000000-0000-4000-8000-0000000000c1').count(),
    ).toBe(1)
    db.close()
  })
})
