import { initializeApp } from 'firebase/app'
import { initializeFirestore, persistentLocalCache, persistentSingleTabManager } from 'firebase/firestore'
import { getDatabase } from 'firebase/database'
import {
  getRemoteConfig,
  fetchAndActivate,
  getString,
  getValue,
} from 'firebase/remote-config'

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
}

const app = initializeApp(firebaseConfig)

/**
 * Cards live in Firestore. Firestore's own IndexedDB persistence keeps them
 * readable offline — our Dexie DB stores progress only, never card data.
 */
export const firestore = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentSingleTabManager({}) }),
})

/** Resources (admin-managed links) live in the Realtime Database. */
export const rtdb = getDatabase(app)

export const remoteConfig = getRemoteConfig(app)
remoteConfig.settings = {
  minimumFetchIntervalMillis: import.meta.env.DEV ? 0 : 3600000,
  fetchTimeoutMillis: 10000,
}
// Dev fallback — production value comes from the admin_code Remote Config param.
// chat_models is a comma-separated fallback chain used when the param is unset.
remoteConfig.defaultConfig = { admin_code: '5173' }

/**
 * Admin gate value: Remote Config `admin_code`, dev fallback `5173`.
 * Client-side gate only — not a security boundary.
 */
export async function getAdminCode(): Promise<string> {
  try {
    await fetchAndActivate(remoteConfig)
    return getString(remoteConfig, 'admin_code') || '5173'
  } catch {
    return '5173'
  }
}

/**
 * Assistant model chain from Remote Config `chat_models` — a comma-separated
 * list, e.g. `google/gemma-4-26b-a4b-it:free,nvidia/nemotron-3-ultra-550b-a55b:free`.
 * First entry is preferred; the rest are fallbacks. Returns `fallback`
 * untouched when the param is empty or the fetch fails, so an offline device
 * or a half-written config never breaks chat.
 */
export async function getChatModels(fallback: readonly string[]): Promise<string[]> {
  try {
    await fetchAndActivate(remoteConfig)
    const raw = getValue(remoteConfig, 'chat_models').asString()
    const models = raw
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean)
    return models.length ? models : [...fallback]
  } catch {
    return [...fallback]
  }
}
