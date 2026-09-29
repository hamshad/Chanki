import { db } from './db'
import { validateCard } from './schema'
import type { Deck } from './schema'

// Vite resolves public/ assets at /assets/... URLs — import as JSON for seed
// The JSON is served statically for runtime use and precached by PWA
// We fetch it dynamically so it doesn't bloat the JS bundle.

/**
 * Seeds the HSK1 starter deck on first launch. Idempotent — safe to call
 * every time the app starts; checks meta.starterDeckSeeded before writing.
 *
 * Transaction guarantees atomicity: if any card fails Zod validation, the
 * entire operation rolls back and no partial data is written.
 */
export async function seedStarterDeckIfNeeded(): Promise<void> {
  const seeded = await db.meta.get('starterDeckSeeded')
  if (seeded) return

  const response = await fetch('/assets/deck/hsk1-starter.json')
  const starterDeck = await response.json()

  await db.transaction('rw', db.decks, db.cards, db.meta, async () => {
    // Insert the deck
    await db.decks.put(starterDeck.deck as Deck)

    // Validate each card via Zod before inserting
    const now = Date.now()
    const validCards = (starterDeck.cards as unknown[]).map((c) =>
      validateCard({
        ...(c as object),
        schemaVersion: 1,
        createdAt: now,
        updatedAt: now,
      }),
    )

    await db.cards.bulkAdd(validCards)
    await db.meta.put({ key: 'starterDeckSeeded', value: true })
  })
}
