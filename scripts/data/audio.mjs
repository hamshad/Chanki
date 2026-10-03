/**
 * Build-time neural speech for the deck (edge-tts / Microsoft zh voices).
 *
 * Fills `audioUrl` for every card and example that has none, generating mp3s
 * under `public/assets/deck/audio/`. Existing files are reused; only missing
 * clips are synthesized. Requires the `edge-tts` CLI (pip install edge-tts).
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const DECK_DIR = path.join(ROOT, 'public/assets/deck')
const AUDIO_DIR = path.join(DECK_DIR, 'audio')
const DECK_FILE = path.join(DECK_DIR, 'hsk1-starter.json')

const VOICE = process.env.CHANKI_TTS_VOICE || 'zh-CN-XiaoxiaoNeural'
const CONCURRENCY = 4

/** Candidate launchers for edge-tts (PATH first, then the common --user install). */
function ttsLaunchers() {
  const home = process.env.HOME || ''
  return [
    { cmd: 'edge-tts', prefix: [] },
    { cmd: path.join(home, 'Library/Python/3.9/bin/edge-tts'), prefix: [] },
    { cmd: path.join(home, '.local/bin/edge-tts'), prefix: [] },
    { cmd: 'python3', prefix: ['-m', 'edge_tts'] },
    { cmd: 'python3.11', prefix: ['-m', 'edge_tts'] },
  ]
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', (chunk) => (stderr += chunk))
    child.on('error', reject)
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`${path.basename(cmd)} exited ${code}: ${stderr.slice(-400)}`)),
    )
  })
}

let launcher = null

async function resolveLauncher() {
  if (launcher) return launcher
  for (const candidate of ttsLaunchers()) {
    try {
      await run(candidate.cmd, [...candidate.prefix, '--version'])
      launcher = candidate
      return launcher
    } catch {
      /* try next */
    }
  }
  throw new Error(
    'edge-tts not found — install with `pip3 install --user edge-tts` (deck ships without audio until then)',
  )
}

async function synth(text, outFile, attempt = 0) {
  const { cmd, prefix } = await resolveLauncher()
  await run(cmd, [...prefix, '--voice', VOICE, '--text', text, '--write-media', outFile])
  if (!fs.existsSync(outFile) || fs.statSync(outFile).size < 200) {
    if (attempt < 2) return synth(text, outFile, attempt + 1)
    throw new Error(`empty clip for "${text}"`)
  }
}

function safeName(text) {
  const clean = text.replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '')
  return clean || createHash('sha1').update(text).digest('hex').slice(0, 12)
}

function exampleName(text) {
  return `ex-${createHash('sha1').update(text).digest('hex').slice(0, 16)}`
}

async function pool(jobs, limit, worker) {
  let cursor = 0
  const runners = Array.from({ length: Math.min(limit, jobs.length) }, async () => {
    while (cursor < jobs.length) {
      const index = cursor++
      await worker(jobs[index], index)
    }
  })
  await Promise.all(runners)
}

/**
 * Ensure every card/example in the deck JSON has a synthesized clip.
 * Rewrites the deck file (indent matches build-deck) when anything changed.
 */
export async function ensureDeckAudio({ deckFile = DECK_FILE, quiet = false } = {}) {
  const deck = JSON.parse(fs.readFileSync(deckFile, 'utf8'))
  const log = (...args) => { if (!quiet) console.log(...args) }
  fs.mkdirSync(AUDIO_DIR, { recursive: true })

  const jobs = []
  let changed = false
  const link = (owner, text, fileName, key) => {
    const publicPath = `/assets/deck/audio/${fileName}`
    const onDisk = path.join(AUDIO_DIR, fileName)
    if (fs.existsSync(onDisk) && fs.statSync(onDisk).size >= 200) {
      if (owner[key] !== publicPath) {
        owner[key] = publicPath
        changed = true
      }
      return
    }
    jobs.push({ owner, key, text, onDisk, publicPath })
  }

  for (const card of deck.cards) {
    if (!card.audioUrl) link(card, card.hanzi, `${safeName(card.hanzi)}.mp3`, 'audioUrl')
    for (const ex of card.examples || []) {
      if (!ex.audioUrl) link(ex, ex.zh, `${exampleName(ex.zh)}.mp3`, 'audioUrl')
    }
  }

  if (!jobs.length) {
    if (changed) fs.writeFileSync(deckFile, JSON.stringify(deck, null, 1))
    log('Deck audio up to date — nothing to synthesize.')
    return { generated: 0, total: 0 }
  }

  log(`Deck audio ▸ synthesizing ${jobs.length} clips with ${VOICE} …`)
  let done = 0
  let failed = 0
  await pool(jobs, CONCURRENCY, async (job) => {
    try {
      await synth(job.text, job.onDisk)
      job.owner[job.key] = job.publicPath
      changed = true
    } catch (err) {
      failed += 1
      console.warn(`  skip "${job.text}": ${err.message}`)
    }
    done += 1
    if (done % 25 === 0 || done === jobs.length) log(`  ${done}/${jobs.length} done${failed ? ` (${failed} failed)` : ''}`)
  })

  if (changed) fs.writeFileSync(deckFile, JSON.stringify(deck, null, 1))
  log(`Deck audio ▸ ${jobs.length - failed} generated, ${failed} failed.`)
  return { generated: jobs.length - failed, failed, total: jobs.length }
}

export { DECK_FILE, AUDIO_DIR, VOICE, synth, safeName, exampleName, pool }
