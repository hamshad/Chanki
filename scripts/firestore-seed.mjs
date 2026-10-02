/**
 * Push the bundled starter deck to Firestore — the app reads cards from
 * there, never from local storage.
 *
 * Usage:  npm run db:seed
 * Reads:  .env (VITE_FIREBASE_*), public/assets/deck/hsk1-starter.json
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { initializeApp } from 'firebase/app'
import { getFirestore, doc, setDoc } from 'firebase/firestore'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function loadEnv() {
  try {
    const env = {}
    for (const line of readFileSync(join(root, '.env'), 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m) env[m[1]] = m[2]
    }
    return env
  } catch {
    return {}
  }
}

const env = loadEnv()
const required = ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_APP_ID']
for (const key of required) {
  if (!env[key]) {
    console.error(`Missing ${key} in .env`)
    process.exit(1)
  }
}

const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  appId: env.VITE_FIREBASE_APP_ID,
})
const firestore = getFirestore(app)

const starter = JSON.parse(
  readFileSync(join(root, 'public/assets/deck/hsk1-starter.json'), 'utf8'),
)

const now = Date.now()
await setDoc(doc(firestore, 'decks', starter.deck.id), starter.deck)

let count = 0
for (const card of starter.cards) {
  const docCard = {
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now,
    ...card,
  }
  await setDoc(doc(firestore, 'cards', card.id), docCard)
  count++
}

console.log(`Seeded deck "${starter.deck.name}" + ${count} cards → Firestore (${env.VITE_FIREBASE_PROJECT_ID})`)
