import { describe, it, expect, beforeEach, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'

/**
 * Sync engine integration test: Dexie (offline source of truth) ⇄ Firestore
 * (persisted copy) with a mocked firestore module — no network.
 */

const h = vi.hoisted(() => {
  const store = new Map<string, Record<string, unknown>>()
  const stats = { commits: 0, setDocCalls: 0 }
  return { store, stats }
})

vi.mock('./firebase', () => ({ firestore: { app: 'fake' } }))

vi.mock('firebase/firestore', () => {
  interface Ref {
    path: string
  }
  const doc = (_fs: unknown, ...parts: string[]): Ref => ({ path: parts.join('/') })
  const collection = (_fs: unknown, ...parts: string[]): Ref => ({ path: parts.join('/') })
  const setDoc = async (
    ref: Ref,
    data: Record<string, unknown>,
    opts?: { merge?: boolean },
  ): Promise<void> => {
    h.stats.setDocCalls++
    const existing = opts?.merge ? h.store.get(ref.path) : undefined
    h.store.set(ref.path, { ...existing, ...data })
  }
  const getDoc = async (ref: Ref) => {
    const data = h.store.get(ref.path)
    return { exists: () => data !== undefined, data: () => data }
  }
  interface Filter {
    field: string
    value: unknown
  }
  interface QueryRef extends Ref {
    filters?: Filter[]
  }
  const getDocs = async (ref: QueryRef) => {
    const docs = [...h.store.entries()]
      .filter(([path]) => path.startsWith(`${ref.path}/`))
      .map(([path, data]) => ({
        id: path.slice(ref.path.length + 1),
        data: () => data,
      }))
      .filter(d => (ref.filters ?? []).every(f => d.data()[f.field] === f.value))
    return { docs, empty: docs.length === 0 }
  }
  const writeBatch = () => {
    const ops: { path: string; data: Record<string, unknown> }[] = []
    return {
      set: (ref: Ref, data: Record<string, unknown>) => ops.push({ path: ref.path, data }),
      commit: async () => {
        h.stats.commits++
        for (const op of ops) h.store.set(op.path, op.data)
      },
    }
  }
  const query = (ref: Ref, ...filters: Filter[]): QueryRef => ({ ...ref, filters })
  const where = (field: string, _op: string, value: unknown): Filter => ({ field, value })
  return { doc, collection, setDoc, getDoc, getDocs, writeBatch, query, where }
})

const DEVICE_ID = '00000000-0000-4000-8000-0000000000d1'
const CARD_ID = '00000000-0000-4000-8000-0000000000c1'

function seedProgress(over: Record<string, unknown> = {}) {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    cardId: CARD_ID,
    deviceId: DEVICE_ID,
    stability: 3,
    difficulty: 5,
    due: 1_000_000,
    reps: 2,
    lapses: 0,
    state: 2,
    updatedAt: 1_000,
    ...over,
  }
}

function seedLog(over: Record<string, unknown> = {}) {
  return {
    id: '00000000-0000-4000-8000-000000000009',
    cardId: CARD_ID,
    deviceId: DEVICE_ID,
    rating: 'good',
    scheduledDays: 1,
    elapsedDays: 0,
    timestamp: 999,
    ...over,
  }
}

async function freshModules(deviceId = DEVICE_ID) {
  vi.resetModules()
  const { db } = await import('./db')
  await db.open()
  // Dexie's IndexedDB dependency is captured once per process (externalized
  // module) — the same backing store persists across tests, so reset tables
  // explicitly instead of relying on a fresh IDBFactory.
  await db.progress.clear()
  await db.reviewLogs.clear()
  await db.meta.clear()
  await db.meta.bulkPut([
    { key: 'deviceId', value: deviceId },
    // Identity is DERIVED from the fingerprint — equal here, so the legacy
    // re-home path stays quiet in the shared suites below.
    { key: 'fingerprint', value: deviceId },
  ])
  const sync = await import('./sync')
  return { db, sync }
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  h.store.clear()
  h.stats.commits = 0
  h.stats.setDocCalls = 0
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
})

describe('syncNow — push', () => {
  it('uploads pending progress + logs, writes device doc, marks local synced', async () => {
    const { db, sync } = await freshModules()
    await db.progress.put({ ...seedProgress(), syncStatus: 'pending' } as never)
    await db.reviewLogs.put({ ...seedLog() } as never)

    await sync.syncNow()

    // Remote store populated
    expect(h.store.get(`devices/${DEVICE_ID}/progress/00000000-0000-4000-8000-000000000001`))
      .toBeDefined()
    expect(h.store.get(`devices/${DEVICE_ID}/reviewLogs/00000000-0000-4000-8000-000000000009`))
      .toBeDefined()
    const deviceDoc = h.store.get(`devices/${DEVICE_ID}`)
    expect(deviceDoc?.fingerprint).toBe(DEVICE_ID)
    expect(deviceDoc?.app).toBe('chanki-web')

    // Local rows flagged synced, syncStatus stripped from remote payloads
    const localProgress = await db.progress.get('00000000-0000-4000-8000-000000000001')
    expect(localProgress?.syncStatus).toBe('synced')
    const remoteRow = h.store.get(`devices/${DEVICE_ID}/progress/00000000-0000-4000-8000-000000000001`)
    expect(remoteRow && 'syncStatus' in remoteRow).toBe(false)

    const localLog = await db.reviewLogs.get('00000000-0000-4000-8000-000000000009')
    expect(localLog?.syncStatus).toBe('synced')
    db.close()
  })

  it('does not re-send rows already flagged synced', async () => {
    const { db, sync } = await freshModules()
    await db.progress.put({ ...seedProgress(), syncStatus: 'synced' } as never)

    await sync.syncNow()

    expect(
      h.store.get(`devices/${DEVICE_ID}/progress/00000000-0000-4000-8000-000000000001`),
    ).toBeUndefined()
    db.close()
  })

  it('skips entirely when offline', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
    const { db, sync } = await freshModules()
    await db.progress.put({ ...seedProgress(), syncStatus: 'pending' } as never)

    await sync.syncNow()

    expect(h.store.size).toBe(0)
    expect((await db.progress.get('00000000-0000-4000-8000-000000000001'))?.syncStatus)
      .toBe('pending')
    db.close()
  })
})

describe('syncNow — pull', () => {
  it('merges unseen remote progress + logs into Dexie and adopts the day stamp', async () => {
    h.store.set(`devices/${DEVICE_ID}`, {
      fingerprint: DEVICE_ID,
      app: 'chanki-web',
      lastCompletedDay: '2026-10-02',
      lastSeenAt: 1,
      updatedAt: 1,
    })
    h.store.set(`devices/${DEVICE_ID}/progress/00000000-0000-4000-8000-000000000001`, seedProgress())
    h.store.set(`devices/${DEVICE_ID}/reviewLogs/00000000-0000-4000-8000-000000000009`, seedLog())

    const { db, sync } = await freshModules()
    await sync.syncNow()

    const progress = await db.progress.get('00000000-0000-4000-8000-000000000001')
    expect(progress?.reps).toBe(2)
    expect(progress?.syncStatus).toBe('synced')
    const log = await db.reviewLogs.get('00000000-0000-4000-8000-000000000009')
    expect(log?.rating).toBe('good')
    expect((await db.meta.get('lastCompletedDay'))?.value).toBe('2026-10-02')
    db.close()
  })

  it('keeps the local row when it is newer than remote (LWW)', async () => {
    h.store.set(`devices/${DEVICE_ID}`, { fingerprint: DEVICE_ID, updatedAt: 1 })
    h.store.set(`devices/${DEVICE_ID}/progress/00000000-0000-4000-8000-000000000001`, seedProgress({ updatedAt: 500 }))

    const { db, sync } = await freshModules()
    await db.progress.put({
      ...seedProgress({ updatedAt: 900, reps: 7 }),
      syncStatus: 'pending',
    } as never)

    await sync.syncNow()

    const local = await db.progress.get('00000000-0000-4000-8000-000000000001')
    expect(local?.reps).toBe(7)
    expect(local?.updatedAt).toBe(900)
    // …and the newer local copy is (re)pushed over the stale remote one.
    expect(
      h.store.get(`devices/${DEVICE_ID}/progress/00000000-0000-4000-8000-000000000001`)?.reps,
    ).toBe(7)
    db.close()
  })
})

describe('syncNow — legacy uuid migration', () => {
  it('re-homes local rows to the derived id and pushes there', async () => {
    const legacy = '12345678-1234-4234-8234-123456789012'
    const derived = 'derived-fingerprint-id'
    const { db, sync } = await freshModules(legacy)
    // Identity scheme upgraded: fingerprint now IS the device id.
    await db.meta.put({ key: 'fingerprint', value: derived })
    await db.meta.put({ key: 'deviceId', value: legacy })
    await db.progress.put({
      ...seedProgress({ deviceId: legacy }),
      syncStatus: 'pending',
    } as never)

    await sync.syncNow()

    expect((await db.meta.get('deviceId'))?.value).toBe(derived)
    const row = await db.progress.get('00000000-0000-4000-8000-000000000001')
    expect(row?.deviceId).toBe(derived)
    expect(
      h.store.get(`devices/${derived}/progress/00000000-0000-4000-8000-000000000001`),
    ).toBeDefined()
    expect(h.store.get(`devices/${legacy}`)).toBeUndefined()
    db.close()
  })
})
