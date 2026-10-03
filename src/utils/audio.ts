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

/**
 * Rank Chinese voices for naturalness. Desktop machines usually expose the
 * robotic local voices (Windows SAPI, macOS Tingting) alongside — or instead
 * of — network voices, so a plain "first zh voice" pick sounds like the 90s
 * on PC while phones get Google's neural one. Signals, best first:
 *
 *  - name marker (Neural/Natural/Online/Enhanced): the voice vendor labels
 *    its good engines this way — Edge's local "Xiaoxiao (Natural)" beats a
 *    network voice even though it is `localService`.
 *  - `localService === false`: Chrome's online Google voices.
 *  - exact zh-CN over looser zh-TW/zh-HK matches.
 */
export function chooseChineseVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  const normalize = (lang: string) => lang.replace('_', '-').toLowerCase()
  const score = (v: SpeechSynthesisVoice): number => {
    let s = 0
    if (/(neural|natural|online|enhanced|premium)/i.test(v.name)) s += 100
    if (!v.localService) s += 50
    if (normalize(v.lang) === 'zh-cn') s += 10
    return s
  }

  let best: SpeechSynthesisVoice | undefined
  let bestScore = -1
  for (const voice of voices) {
    if (!normalize(voice.lang).startsWith('zh')) continue
    const s = score(voice)
    if (s > bestScore) {
      bestScore = s
      best = voice
    }
  }
  return best
}

function pickChineseVoice(): SpeechSynthesisVoice | undefined {
  if (!voiceCache.length && typeof window !== 'undefined' && 'speechSynthesis' in window) {
    voiceCache = window.speechSynthesis.getVoices()
  }
  return chooseChineseVoice(voiceCache)
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
