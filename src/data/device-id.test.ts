import { describe, it, expect, beforeEach, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  // Reset module cache so db re-opens fresh per test
  vi.resetModules()
})

describe('getOrCreateDeviceId', () => {
  it('returns a UUID string on first call', async () => {
    const { db } = await import('./db')
    await db.open()
    const { getOrCreateDeviceId } = await import('./device-id')

    const id = await getOrCreateDeviceId()
    expect(typeof id).toBe('string')
    // UUID v4 format: 8-4-4-4-12 hex chars
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
    db.close()
  })

  it('returns the same UUID on subsequent calls (idempotent)', async () => {
    const { db } = await import('./db')
    await db.open()
    const { getOrCreateDeviceId } = await import('./device-id')

    const id1 = await getOrCreateDeviceId()
    const id2 = await getOrCreateDeviceId()
    expect(id1).toBe(id2)
    db.close()
  })

  it('stores deviceId under meta key "deviceId"', async () => {
    const { db } = await import('./db')
    await db.open()
    const { getOrCreateDeviceId } = await import('./device-id')

    const id = await getOrCreateDeviceId()
    const meta = await db.meta.get('deviceId')
    expect(meta?.key).toBe('deviceId')
    expect(meta?.value).toBe(id)
    db.close()
  })

  it('does not generate a new UUID when one already exists in meta', async () => {
    const { db } = await import('./db')
    await db.open()
    // Pre-seed a known UUID
    const knownId = '12345678-1234-4234-8234-123456789012'
    await db.meta.put({ key: 'deviceId', value: knownId })

    const { getOrCreateDeviceId } = await import('./device-id')
    const id = await getOrCreateDeviceId()
    expect(id).toBe(knownId)
    db.close()
  })
})
