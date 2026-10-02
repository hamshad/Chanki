import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { PitchDetector } from 'pitchy'
import {
  analyzeCapture,
  isVoicedPitch,
  type CaptureAnalysis,
  type Frame,
} from '../utils/scoring'

const LIVE_UPDATE_EVERY = 10
const COUNTDOWN_MS = 700
const MAX_RECORD_MS = 5000
const MIN_RECORD_MS = 400
/** Stop automatically after this much silence once the syllable started. */
const SILENCE_STOP_MS = 900

export type CaptureMode = 'idle' | 'countdown' | 'recording'

export interface ToneCapture {
  mode: CaptureMode
  /** 3 → 2 → 1 while priming the mic, null otherwise. */
  countdown: number | null
  /** Live analysis while recording, updated every LIVE_UPDATE_EVERY frames. */
  live: CaptureAnalysis | null
  /** Frames from the last completed recording. */
  lastFrames: Frame[] | null
  /** Median voiced pitch of the last attempt — auto base, no calibration step. */
  baseFreq: number | null
  error: string | null
  start: () => Promise<void>
  /** Submit the current recording (or no-op when idle/counting down). */
  stop: () => void
  /** Abort countdown/recording without producing a result. */
  cancel: () => void
  /** Mutable frame buffer — read per animation frame by the contour graph. */
  framesRef: RefObject<Frame[]>
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * One-tap microphone flow: getUserMedia (permission) → 3-2-1 countdown →
 * record → auto-stop when the syllable ends (900ms of silence) or at 5s.
 * Base frequency is the attempt's own median pitch — calibration is gone.
 */
export function useToneCapture(): ToneCapture {
  const [mode, setMode] = useState<CaptureMode>('idle')
  const [countdown, setCountdown] = useState<number | null>(null)
  const [live, setLive] = useState<CaptureAnalysis | null>(null)
  const [lastFrames, setLastFrames] = useState<Frame[] | null>(null)
  const [baseFreq, setBaseFreq] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const modeRef = useRef<CaptureMode>('idle')
  const streamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const rafRef = useRef(0)
  const framesRef = useRef<Frame[]>([])
  const startedAtRef = useRef(0)
  const lastVoicedAtRef = useRef(0)
  const voicedOnceRef = useRef(false)

  const teardown = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    audioContextRef.current?.close().catch(() => {})
    audioContextRef.current = null
    streamRef.current?.getTracks().forEach(track => track.stop())
    streamRef.current = null
    modeRef.current = 'idle'
    setMode('idle')
    setCountdown(null)
    setLive(null)
  }, [])

  const finishRecording = useCallback(() => {
    if (modeRef.current !== 'recording') return
    const frames = [...framesRef.current]
    const analysis = analyzeCapture(frames)
    teardown()
    setLastFrames(frames)
    setBaseFreq(analysis.baseFreq)
  }, [teardown])

  const cancel = useCallback(() => {
    if (modeRef.current === 'idle') return
    teardown()
  }, [teardown])

  const start = useCallback(async () => {
    if (modeRef.current !== 'idle') return
    setError(null)
    setLastFrames(null)
    setLive(null)
    modeRef.current = 'countdown'
    setMode('countdown')

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false },
      })
      streamRef.current = stream

      const audioContext = new window.AudioContext()
      await audioContext.resume()
      audioContextRef.current = audioContext

      // Countdown — mic already live, so the first frame never misses the onset.
      for (const n of [3, 2, 1]) {
        if (modeRef.current !== 'countdown') return
        setCountdown(n)
        await sleep(COUNTDOWN_MS)
      }
      if (modeRef.current !== 'countdown') return
      setCountdown(null)

      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 2048
      audioContext.createMediaStreamSource(stream).connect(analyser)

      const detector = PitchDetector.forFloat32Array(analyser.fftSize)
      const timeDomain = new Float32Array(analyser.fftSize)

      framesRef.current = []
      voicedOnceRef.current = false
      startedAtRef.current = performance.now()
      lastVoicedAtRef.current = startedAtRef.current
      modeRef.current = 'recording'
      setMode('recording')

      const tick = () => {
        if (modeRef.current !== 'recording') return
        analyser.getFloatTimeDomainData(timeDomain)
        let sum = 0
        for (let i = 0; i < timeDomain.length; i++) sum += timeDomain[i] * timeDomain[i]
        const rms = Math.sqrt(sum / timeDomain.length)

        const [pitch, clarity] = detector.findPitch(timeDomain, audioContext.sampleRate)
        framesRef.current.push({ freq: pitch, clarity, rms })

        const now = performance.now()
        if (isVoicedPitch(pitch, clarity)) {
          voicedOnceRef.current = true
          lastVoicedAtRef.current = now
        }

        if (framesRef.current.length % LIVE_UPDATE_EVERY === 0) {
          setLive(analyzeCapture(framesRef.current))
        }

        const elapsed = now - startedAtRef.current
        if (elapsed > MAX_RECORD_MS) {
          finishRecording()
          return
        }
        if (
          voicedOnceRef.current &&
          elapsed > MIN_RECORD_MS &&
          now - lastVoicedAtRef.current > SILENCE_STOP_MS
        ) {
          finishRecording()
          return
        }

        rafRef.current = requestAnimationFrame(tick)
      }

      rafRef.current = requestAnimationFrame(tick)
    } catch (err) {
      teardown()
      setError(
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'Microphone permission denied. Allow mic access in browser settings.'
          : 'Microphone unavailable on this device.',
      )
    }
  }, [finishRecording, teardown])

  // Manual submit: recording → result; countdown → treat as cancel.
  const stop = useCallback(() => {
    if (modeRef.current === 'recording') finishRecording()
    else if (modeRef.current === 'countdown') cancel()
  }, [finishRecording, cancel])

  useEffect(() => teardown, [teardown])

  return { mode, countdown, live, lastFrames, baseFreq, error, start, stop, cancel, framesRef }
}
