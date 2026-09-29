import { describe, it, expect, beforeEach, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'

import fs from 'node:fs'
import path from 'node:path'

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  vi.resetModules()

  // Mock fetch to read the local JSON file
  globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
    if (url === '/assets/deck/hsk1-starter.json') {
      const data = fs.readFileSync(path.resolve(__dirname, '../../public/assets/deck/hsk1-starter.json'), 'utf-8')
      return {
        json: async () => JSON.parse(data)
      }
    }
    throw new Error(`Unexpected fetch call: ${url}`)
  })
})

describe('seedStarterDeckIfNeeded', () => {
  it('seeds the starter deck and ~150 cards on first call', async () => {
    const { db } = await import('./db')
    await db.open()
    const { seedStarterDeckIfNeeded } = await import('./seed')

    await seedStarterDeckIfNeeded()

    const decks = await db.decks.toArray()
    expect(decks).toHaveLength(1)
    expect(decks[0].slug).toBe('hsk1-starter')

    const cardsCount = await db.cards.count()
    expect(cardsCount).toBe(150)

    const seeded = await db.meta.get('starterDeckSeeded')
    expect(seeded?.value).toBe(true)

    db.close()
  })

  it('is idempotent (does nothing on second call)', async () => {
    const { db } = await import('./db')
    await db.open()
    const { seedStarterDeckIfNeeded } = await import('./seed')

    await seedStarterDeckIfNeeded()
    
    // Modify a record to ensure it doesn't get overwritten
    const firstDeck = await db.decks.toCollection().first()
    if (firstDeck) {
       await db.decks.update(firstDeck.id, { name: 'Modified Name' })
    }

    await seedStarterDeckIfNeeded()

    const decks = await db.decks.toArray()
    expect(decks).toHaveLength(1)
    expect(decks[0].name).toBe('Modified Name')

    const cardsCount = await db.cards.count()
    expect(cardsCount).toBe(150)

    db.close()
  })
})
