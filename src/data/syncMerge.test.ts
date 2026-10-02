import { describe, it, expect } from 'vitest'
import {
  buildDeviceDoc,
  chunk,
  mergeLogRow,
  mergeProgressRow,
  pickAdoptedDevice,
  shouldAdoptRemoteDay,
} from './syncMerge'
import type { Progress, ReviewLog } from './schema'
import type { DeviceSignals } from './fingerprint'

const SIGNALS: DeviceSignals = {
  userAgent: 'UA',
  language: 'en',
  timeZone: 'UTC',
  screenWidth: 100,
  screenHeight: 200,
  colorDepth: 24,
  pixelRatio: 1,
  platform: 'Test',
  hardwareConcurrency: 8,
  maxTouchPoints: 0,
  deviceMemory: 8,
  webglRenderer: 'Test GPU',
}

function progress(over: Partial<Progress> = {}): Progress {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    cardId: '00000000-0000-4000-8000-000000000002',
    deviceId: '00000000-0000-4000-8000-000000000003',
    stability: 3,
    difficulty: 5,
    due: 1000,
    reps: 1,
    lapses: 0,
    state: 2,
    syncStatus: 'pending',
    updatedAt: 100,
    ...over,
  }
}

function log(over: Partial<ReviewLog> = {}): ReviewLog {
  return {
    id: '00000000-0000-4000-8000-000000000011',
    cardId: '00000000-0000-4000-8000-000000000002',
    deviceId: '00000000-0000-4000-8000-000000000003',
    rating: 'good',
    scheduledDays: 1,
    elapsedDays: 0,
    timestamp: 500,
    ...over,
  }
}

describe('buildDeviceDoc', () => {
  it('packs device metadata + day stamp + timestamps', () => {
    const doc = buildDeviceDoc({
      fingerprint: 'abc123',
      signals: SIGNALS,
      lastCompletedDay: '2026-10-02',
      now: 42,
    })
    expect(doc).toEqual({
      fingerprint: 'abc123',
      app: 'chanki-web',
      userAgent: 'UA',
      platform: 'Test',
      timeZone: 'UTC',
      language: 'en',
      screen: '100x200x24',
      pixelRatio: 1,
      lastCompletedDay: '2026-10-02',
      lastSeenAt: 42,
      updatedAt: 42,
    })
  })

  it('omits lastCompletedDay when unknown', () => {
    const doc = buildDeviceDoc({ fingerprint: 'x', signals: SIGNALS, now: 1 })
    expect('lastCompletedDay' in doc).toBe(false)
  })
})

describe('mergeProgressRow (last-write-wins by updatedAt)', () => {
  it('adopts the remote row when local is missing', () => {
    const remote = progress({ syncStatus: 'pending' as const, updatedAt: 5 })
    expect(mergeProgressRow(undefined, remote)).toEqual({ ...remote, syncStatus: 'synced' })
  })

  it('adopts the remote row when it is newer', () => {
    const local = progress({ updatedAt: 10 })
    const remote = progress({ updatedAt: 20 })
    expect(mergeProgressRow(local, remote)).toEqual({ ...remote, syncStatus: 'synced' })
  })

  it('keeps the local row when it is equal or newer (returns null)', () => {
    expect(mergeProgressRow(progress({ updatedAt: 20 }), progress({ updatedAt: 20 }))).toBeNull()
    expect(mergeProgressRow(progress({ updatedAt: 30 }), progress({ updatedAt: 20 }))).toBeNull()
  })

  it('preserves local row identity when ids differ (post re-home match)', () => {
    const local = progress({ id: '00000000-0000-4000-8000-0000000000aa', updatedAt: 10, reps: 2 })
    const remote = progress({ id: '00000000-0000-4000-8000-0000000000bb', updatedAt: 20, reps: 9 })
    const merged = mergeProgressRow(local, remote)
    expect(merged?.id).toBe('00000000-0000-4000-8000-0000000000aa')
    expect(merged?.deviceId).toBe(local.deviceId)
    expect(merged?.reps).toBe(9)
    expect(merged?.syncStatus).toBe('synced')
  })
})

describe('mergeLogRow (append-only union)', () => {
  it('inserts unseen logs, never overwrites existing ones', () => {
    const remote = log()
    expect(mergeLogRow(undefined, remote)).toEqual({ ...remote, syncStatus: 'synced' })
    expect(mergeLogRow(log(), remote)).toBeNull()
  })
})

describe('shouldAdoptRemoteDay', () => {
  it('adopts remote only when it is ahead', () => {
    expect(shouldAdoptRemoteDay(undefined, '2026-10-02')).toBe(true)
    expect(shouldAdoptRemoteDay('', '2026-10-02')).toBe(true)
    expect(shouldAdoptRemoteDay('2026-10-01', '2026-10-02')).toBe(true)
    expect(shouldAdoptRemoteDay('2026-10-02', '2026-10-02')).toBe(false)
    expect(shouldAdoptRemoteDay('2026-10-03', '2026-10-02')).toBe(false)
    expect(shouldAdoptRemoteDay('2026-10-02', undefined)).toBe(false)
    expect(shouldAdoptRemoteDay(undefined, 12345)).toBe(false)
  })
})

describe('pickAdoptedDevice', () => {
  it('adopts only on an unambiguous single match', () => {
    expect(pickAdoptedDevice([{ id: 'only' }])).toBe('only')
    expect(pickAdoptedDevice([])).toBeNull()
    expect(pickAdoptedDevice([{ id: 'a' }, { id: 'b' }])).toBeNull()
  })
})

describe('chunk', () => {
  it('splits into batches under the Firestore 500-op limit', () => {
    expect(chunk([], 400)).toEqual([])
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    const big = chunk(Array.from({ length: 900 }, (_, i) => i), 400)
    expect(big.map(g => g.length)).toEqual([400, 400, 100])
  })
})
