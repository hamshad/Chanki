import { describe, it, expect, beforeEach, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'

// Provide a fresh IndexedDB for each test
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  vi.resetModules()
})

// Lazily import db after polyfill is installed
async function getDb() {
  // Re-import fresh module to get a new Dexie instance per test
  const { db } = await import('./db')
  return db
}

describe('ChankiDB', () => {
  it('opens successfully and exposes progress-only tables', async () => {
    const db = await getDb()
    await db.open()
    expect(db.tables.map((t) => t.name).sort()).toEqual(
      ['meta', 'progress', 'reviewLogs'].sort(),
    )
    db.close()
  })

  it('can put and get meta key-value pairs', async () => {
    const db = await getDb()
    await db.open()

    await db.meta.put({ key: 'deviceId', value: 'test-uuid-123' })
    const meta = await db.meta.get('deviceId')
    expect(meta?.value).toBe('test-uuid-123')
    db.close()
  })

  it('tracks the completed-day stamp', async () => {
    const db = await getDb()
    await db.open()

    await db.meta.put({ key: 'lastCompletedDay', value: '2026-09-30' })
    const meta = await db.meta.get('lastCompletedDay')
    expect(meta?.value).toBe('2026-09-30')
    db.close()
  })

  it('can query progress by due date (due index)', async () => {
    const db = await getDb()
    await db.open()

    const now = Date.now()
    const progress = [
      { id: '00000000-0000-0000-0000-000000000020', cardId: '00000000-0000-0000-0000-000000000002', deviceId: '00000000-0000-0000-0000-000000000003', stability: 1, difficulty: 5, due: now - 1000, reps: 0, lapses: 0, syncStatus: 'pending' as const, updatedAt: now },
      { id: '00000000-0000-0000-0000-000000000021', cardId: '00000000-0000-0000-0000-000000000004', deviceId: '00000000-0000-0000-0000-000000000003', stability: 1, difficulty: 5, due: now + 86400000, reps: 0, lapses: 0, syncStatus: 'pending' as const, updatedAt: now },
    ]
    await db.progress.bulkPut(progress)

    const due = await db.progress.where('due').below(now).toArray()
    expect(due).toHaveLength(1)
    expect(due[0].due).toBeLessThan(now)
    db.close()
  })
})
