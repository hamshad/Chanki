import { db } from './db'
import { firestore } from './firebase'
import { doc, getDocs, collection, writeBatch } from 'firebase/firestore'
import { getOrCreateDeviceId } from './device-id'

export async function syncProgress() {
  if (!navigator.onLine) {
    console.log('[Sync] Offline, skipping sync.')
    return
  }

  try {
    window.dispatchEvent(new CustomEvent('sync:start'))
    const deviceId = await getOrCreateDeviceId()
    
    // ─── 1. PUSH Pending Local Changes to Firestore ────────────────────────
    const pendingProgress = await db.progress
      .where('syncStatus')
      .equals('pending')
      .toArray()

    if (pendingProgress.length > 0) {
      console.log(`[Sync] Pushing ${pendingProgress.length} pending items...`)
      
      const batch = writeBatch(firestore)
      const deviceRef = doc(firestore, 'devices', deviceId)
      
      // Ensure device document exists
      batch.set(deviceRef, { updatedAt: Date.now() }, { merge: true })

      for (const item of pendingProgress) {
        const itemRef = doc(firestore, `devices/${deviceId}/progress/${item.id}`)
        // Convert to plain object and remove syncStatus for remote storage
        const { syncStatus, ...remoteItem } = item
        batch.set(itemRef, remoteItem)
      }

      await batch.commit()

      // Mark local items as synced
      await db.transaction('rw', db.progress, async () => {
        for (const item of pendingProgress) {
          await db.progress.update(item.id, { syncStatus: 'synced' })
        }
      })
    }

    // ─── 2. PULL Latest Remote Changes from Firestore ──────────────────────
    console.log('[Sync] Pulling latest remote changes...')
    const progressCol = collection(firestore, `devices/${deviceId}/progress`)
    const snapshot = await getDocs(progressCol)
    
    const remoteItems = snapshot.docs.map(d => d.data())

    await db.transaction('rw', db.progress, async () => {
      for (const remote of remoteItems) {
        const local = await db.progress.get(remote.id)
        if (!local || local.updatedAt < remote.updatedAt) {
          // Last-write-wins resolution
          await db.progress.put({ ...remote, syncStatus: 'synced' } as any)
        }
      }
    })
    
    console.log('[Sync] Sync complete.')
    window.dispatchEvent(new CustomEvent('sync:end', { detail: { success: true } }))
  } catch (err) {
    console.error('[Sync] Error syncing:', err)
    window.dispatchEvent(new CustomEvent('sync:end', { detail: { success: false, error: err } }))
  }
}

// Optionally, run sync periodically or on connectivity changes
export function initBackgroundSync() {
  window.addEventListener('online', syncProgress)
  // Run once on load
  syncProgress()
}
