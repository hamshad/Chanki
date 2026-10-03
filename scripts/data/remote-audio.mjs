/**
 * Firestore audio backfill for manually added cards.
 *
 * Scans the `cards` collection for cards/examples missing `audioUrl`,
 * synthesizes neural clips (edge-tts, same voice as the deck) into
 * `public/assets/deck/audio/`, and patches the docs in place. Files that
 * already exist (e.g. a shared word clip) are reused without synthesizing.
 *
 * Run via `npm run data:audio` (deck phase runs first), then
 * `firebase deploy --only hosting` so the new mp3s ship.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { initializeApp } from 'firebase/app'
import { getFirestore, collection, getDocs, doc, updateDoc } from 'firebase/firestore'
import { synth, safeName, exampleName, pool, VOICE, AUDIO_DIR } from './audio.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const CONCURRENCY = 4
const MIN_BYTES = 200

function loadEnv() {
  try {
    const env = {}
    for (const line of fs.readFileSync(join(root, '.env'), 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m) env[m[1]] = m[2]
    }
    return env
  } catch {
    return {}
  }
}

function firestoreFromEnv() {
  const env = loadEnv()
  const required = ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_APP_ID']
  for (const key of required) {
    if (!env[key]) throw new Error(`Missing ${key} in .env — Firestore audio backfill needs it`)
  }
  const app = initializeApp({
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  })
  return { firestore: getFirestore(app), projectId: env.VITE_FIREBASE_PROJECT_ID }
}

function hasClip(fileName) {
  const file = path.join(AUDIO_DIR, fileName)
  try {
    return fs.statSync(file).size >= MIN_BYTES
  } catch {
    return false
  }
}

/**
 * Backfill `audioUrl` on Firestore cards/examples that lack one.
 * Returns { generated, patched, failed } (failed > 0 → exit 1 at CLI).
 */
export async function ensureRemoteAudio({ quiet = false } = {}) {
  const log = (...args) => { if (!quiet) console.log(...args) }
  const { firestore, projectId } = firestoreFromEnv()
  fs.mkdirSync(AUDIO_DIR, { recursive: true })

  const snapshot = await getDocs(collection(firestore, 'cards'))
  const jobs = [] // per-card work: { docId, card, needCardClip, needExamples: [{ zh, fileName, index }] }

  snapshot.forEach((snap) => {
    const card = snap.data()
    if (!card.hanzi) return
    const needExamples = (card.examples || [])
      .map((ex, index) => ({ ex, index }))
      .filter(({ ex }) => ex.zh && !ex.audioUrl)
      .map(({ ex, index }) => ({ zh: ex.zh, index, fileName: `${exampleName(ex.zh)}.mp3` }))
    if (!card.audioUrl || needExamples.length) {
      jobs.push({
        docId: snap.id,
        card,
        needCardClip: !card.audioUrl,
        needExamples,
      })
    }
  })

  if (!jobs.length) {
    log('Firestore audio up to date — nothing to synthesize.')
    return { generated: 0, patched: 0, failed: 0 }
  }

  // One synth unit per distinct text (card word or example sentence);
  // dedupe by fileName so shared sentences aren't synthesized twice.
  const synthJobs = []
  const seenFiles = new Set()
  for (const job of jobs) {
    if (job.needCardClip) {
      job.cardFileName = `${safeName(job.card.hanzi)}.mp3`
      if (!seenFiles.has(job.cardFileName)) {
        seenFiles.add(job.cardFileName)
        synthJobs.push({ job, field: 'card', text: job.card.hanzi, fileName: job.cardFileName })
      }
    }
    for (const need of job.needExamples) {
      if (seenFiles.has(need.fileName)) continue
      seenFiles.add(need.fileName)
      synthJobs.push({ job, field: 'example', text: need.zh, fileName: need.fileName })
    }
  }

  log(`Firestore audio ▸ ${jobs.length} cards, ${synthJobs.length} clips (voice ${VOICE}) → ${projectId}`)

  let generated = 0
  let failed = 0
  let done = 0
  await pool(synthJobs, CONCURRENCY, async (sj) => {
    try {
      if (!hasClip(sj.fileName)) {
        await synth(sj.text, path.join(AUDIO_DIR, sj.fileName))
        generated += 1
      }
      sj.ok = true
    } catch (err) {
      failed += 1
      console.warn(`  skip "${sj.text}": ${err.message}`)
    }
    done += 1
    if (done % 25 === 0 || done === synthJobs.length) {
      log(`  ${done}/${synthJobs.length} done${failed ? ` (${failed} failed)` : ''}`)
    }
  })

  // Patch every doc whose clips now exist on disk (failed ones retry next run).
  let patched = 0
  const publicPath = (fileName) => `/assets/deck/audio/${fileName}`
  for (const job of jobs) {
    const patch = {}
    if (job.needCardClip && job.cardFileName && hasClip(job.cardFileName)) {
      patch.audioUrl = publicPath(job.cardFileName)
    }
    const exampleOk = job.needExamples.filter((need) => hasClip(need.fileName))
    if (exampleOk.length) {
      patch.examples = job.card.examples.map((ex, index) => {
        const need = exampleOk.find((n) => n.index === index)
        return need ? { ...ex, audioUrl: publicPath(need.fileName) } : ex
      })
    }
    if (Object.keys(patch).length) {
      await updateDoc(doc(firestore, 'cards', job.docId), patch)
      patched += 1
    }
  }

  log(
    `Firestore audio ▸ ${generated} generated, ${patched} docs patched${failed ? `, ${failed} failed` : ''}. ` +
      'Run `firebase deploy --only hosting` to ship new clips.',
  )
  return { generated, patched, failed }
}
