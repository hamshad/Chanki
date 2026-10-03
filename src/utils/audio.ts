/**
 * Card audio playback: plays the card's URL clip when it exists, otherwise
 * falls back to the Web Speech API (TTS) with a Chinese voice.
 *
 * Returns a controller so UI (e.g. the voice-clip visualizer) can animate
 * while audio plays and stop it early. Voice warm-up runs at module load so
 * `speak()` stays inside the user-gesture call stack on iOS.
 */

export interface AudioPlayback {
  /** Resolves when playback finishes, fails, or is stopped. */
  readonly done: Promise<void>
  /** Stop playback immediately (safe to call more than once). */
  stop: () => void
}

let voiceCache: SpeechSynthesisVoice[] = []

function warmVoices(): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
  const load = () => {
    const voices = window.speechSynthesis.getVoices()
    if (voices.length) voiceCache = voices
  }
  load()
  window.speechSynthesis.onvoiceschanged = load
}

warmVoices()

function pickChineseVoice(): SpeechSynthesisVoice | undefined {
  if (!voiceCache.length && typeof window !== 'undefined' && 'speechSynthesis' in window) {
    voiceCache = window.speechSynthesis.getVoices()
  }
  const normalize = (lang: string) => lang.replace('_', '-').toLowerCase()
  const zh = voiceCache.filter((v) => normalize(v.lang).startsWith('zh'))
  // Network voices (Chrome ships neural Google voices this way) sound far
  // better than the bundled local ones — prefer them when available.
  return (
    zh.find((v) => v.localService === false) ??
    zh.find((v) => normalize(v.lang) === 'zh-cn') ??
    zh[0]
  )
}

function startTts(text: string, settle: () => void): () => void {
  const synth = window.speechSynthesis
  synth.cancel() // stop anything still speaking from a previous tap
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'zh-CN'
  const voice = pickChineseVoice()
  if (voice) utterance.voice = voice
  utterance.onend = settle
  utterance.onerror = settle
  synth.speak(utterance)
  return () => {
    utterance.onend = null
    utterance.onerror = null
    synth.cancel()
    settle()
  }
}

/**
 * Start playback of `url` (if given), falling back to TTS of `text`.
 * Never throws — failures settle `done` instead.
 */
export function startAudio(url: string | undefined, text: string): AudioPlayback {
  let settled = false
  let resolveDone: () => void = () => {}
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve
  })
  const settle = () => {
    if (settled) return
    settled = true
    resolveDone()
  }

  let cancelled = false
  let stopActive: (() => void) | null = null

  const runTts = () => {
    if (cancelled || settled) return
    stopActive = startTts(text, settle)
  }

  if (url && typeof Audio !== 'undefined') {
    const clip = new Audio(url)
    let finished = false
    const finish = (failed: boolean) => {
      if (finished) return
      finished = true
      clip.onended = null
      clip.onerror = null
      try {
        clip.pause()
      } catch {
        /* already stopped */
      }
      if (failed) runTts()
      else settle()
    }
    clip.onended = () => finish(false)
    clip.onerror = () => finish(true)
    clip.play().catch(() => finish(true))
    stopActive = () => finish(false)
  } else {
    runTts()
  }

  return {
    done,
    stop: () => {
      cancelled = true
      stopActive?.()
      settle()
    },
  }
}
