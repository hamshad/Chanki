import { get, push, ref, remove, set, onValue } from 'firebase/database'
import { rtdb } from './firebase'

/** Admin-managed resource links — stored in Firebase Realtime Database. */
export interface ResourceLink {
  id: string
  title: string
  url: string
  note?: string
  createdAt?: number
}

export function subscribeResources(onData: (items: ResourceLink[]) => void): () => void {
  return onValue(ref(rtdb, 'resources'), snapshot => {
    const value = snapshot.val() ?? {}
    const items: ResourceLink[] = Object.entries(value).map(([id, v]) => ({
      id,
      ...(v as Omit<ResourceLink, 'id'>),
    }))
    items.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
    onData(items)
  })
}

export async function addResource(input: { title: string; url: string; note?: string }): Promise<void> {
  const node = push(ref(rtdb, 'resources'))
  await set(node, {
    title: input.title.trim(),
    url: input.url.trim(),
    note: input.note?.trim() || '',
    createdAt: Date.now(),
  })
}

export async function deleteResource(id: string): Promise<void> {
  await remove(ref(rtdb, `resources/${id}`))
}

export async function fetchResources(): Promise<ResourceLink[]> {
  const snap = await get(ref(rtdb, 'resources'))
  const value = snap.val() ?? {}
  return Object.entries(value).map(([id, v]) => ({ id, ...(v as Omit<ResourceLink, 'id'>) }))
}
