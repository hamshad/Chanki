import { collection, deleteDoc, doc, getDocs, setDoc } from 'firebase/firestore'
import { firestore } from './firebase'
import { CardSchema, type Card } from './schema'

/**
 * Character data source: the Firestore `cards` collection.
 * Dexie never stores cards — progress only (see db.ts).
 * First fetch is cached in-memory for the session; Firestore's own
 * IndexedDB persistence answers repeat/offline loads.
 */
let cache: Card[] | null = null

export async function fetchRemoteCards(): Promise<Card[]> {
  if (cache) return cache
  const snapshot = await getDocs(collection(firestore, 'cards'))
  const cards: Card[] = []
  snapshot.forEach((docSnap) => {
    const parsed = CardSchema.safeParse(docSnap.data())
    if (parsed.success) {
      cards.push(parsed.data)
    } else {
      console.warn('[cards] skipping invalid doc', docSnap.id, parsed.error.message)
    }
  })
  cache = cards
  return cards
}

export function invalidateRemoteCardCache(): void {
  cache = null
}

export async function saveRemoteCard(card: Card): Promise<void> {
  CardSchema.parse(card)
  await setDoc(doc(firestore, 'cards', card.id), card)
  invalidateRemoteCardCache()
}

export async function deleteRemoteCard(id: string): Promise<void> {
  await deleteDoc(doc(firestore, 'cards', id))
  invalidateRemoteCardCache()
}
