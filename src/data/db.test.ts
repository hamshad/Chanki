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
  it('opens successfully and exposes all 6 tables', async () => {
    const db = await getDb()
    await db.open()
    expect(db.tables.map((t) => t.name).sort()).toEqual(
      ['audioMeta', 'cards', 'decks', 'meta', 'progress', 'reviewLogs'].sort(),
    )
    db.close()
  })

  it('can add and get a deck round-trip', async () => {
    const db = await getDb()
    await db.open()

    const deck = {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Test Deck',
      slug: 'test-deck',
      schemaVersion: 1 as const,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    await db.decks.put(deck)
    const fetched = await db.decks.get('00000000-0000-0000-0000-000000000001')
    expect(fetched?.name).toBe('Test Deck')
    expect(fetched?.slug).toBe('test-deck')
    db.close()
  })

  it('can add and get a card round-trip', async () => {
    const db = await getDb()
    await db.open()

    const card = {
      id: '00000000-0000-0000-0000-000000000002',
      deckId: '00000000-0000-0000-0000-000000000001',
      hanzi: '你',
      pinyin: 'nǐ',
      meaning: 'you',
      tone: '3' as const,
      tags: ['hsk1'],
      hskLevel: 1,
      schemaVersion: 1 as const,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    await db.cards.put(card)
    const fetched = await db.cards.get('00000000-0000-0000-0000-000000000002')
    expect(fetched?.hanzi).toBe('你')
    expect(fetched?.tone).toBe('3')
    db.close()
  })

  it('can query cards by deckId index', async () => {
    const db = await getDb()
    await db.open()

    const uniqueDeckId = '00000000-0000-0000-0000-000000000005'
    const cards = [
      { id: '00000000-0000-0000-0000-000000000010', deckId: uniqueDeckId, hanzi: '我', pinyin: 'wǒ', meaning: 'I/me', tone: '3' as const, tags: [], schemaVersion: 1 as const, createdAt: Date.now(), updatedAt: Date.now() },
      { id: '00000000-0000-0000-0000-000000000011', deckId: uniqueDeckId, hanzi: '你', pinyin: 'nǐ', meaning: 'you', tone: '3' as const, tags: [], schemaVersion: 1 as const, createdAt: Date.now(), updatedAt: Date.now() },
      { id: '00000000-0000-0000-0000-000000000012', deckId: '00000000-0000-0000-0000-000000000099', hanzi: '他', pinyin: 'tā', meaning: 'he', tone: '1' as const, tags: [], schemaVersion: 1 as const, createdAt: Date.now(), updatedAt: Date.now() },
    ]
    await db.cards.bulkPut(cards)

    const result = await db.cards.where('deckId').equals(uniqueDeckId).toArray()
    expect(result).toHaveLength(2)
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

  it('can put and get starterDeckSeeded flag', async () => {
    const db = await getDb()
    await db.open()

    await db.meta.put({ key: 'starterDeckSeeded', value: true })
    const meta = await db.meta.get('starterDeckSeeded')
    expect(meta?.value).toBe(true)
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
