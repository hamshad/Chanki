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

/** `vendor/model` or `vendor/model:tag` — anything else is a typo, not a model. */
const MODEL_SLUG = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._:@-]+$/

/**
 * Assistant model chain from Remote Config `chat_models` — a comma-separated
 * list, e.g. `google/gemma-4-26b-a4b-it:free,nvidia/nemotron-3-ultra-550b-a55b:free`.
 * First entry is preferred; the rest are fallbacks.
 *
 * `openrouter/free` is always appended: it is OpenRouter's own router, it is
 * never withdrawn, so a chain of stale or mistyped slugs can never leave the
 * assistant dead. Entries that are not model slugs (a JSON array pasted into
 * the console, a stray quote) are dropped — they would only ever 404.
 */
export async function getChatModels(fallback: readonly string[]): Promise<string[]> {
  const ALWAYS_LAST = 'openrouter/free'
  let models: string[] = []
  try {
    await fetchAndActivate(remoteConfig)
    models = getValue(remoteConfig, 'chat_models')
      .asString()
      .split(',')
      .map((m) => m.trim().replace(/^["'\s]+|["'\s]+$/g, ''))
      .filter((m) => m && MODEL_SLUG.test(m))
  } catch {
    models = []
  }
  if (!models.length) models = [...fallback]
  if (!models.includes(ALWAYS_LAST)) models.push(ALWAYS_LAST)
  return models
}
