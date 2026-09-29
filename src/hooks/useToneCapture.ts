import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { PitchDetector } from 'pitchy'
import {
  analyzeCapture,
  CAPTURE_STATE_LABEL,
  type CaptureAnalysis,
  type Frame,
} from '../utils/scoring'

const CALIBRATE_FRAMES = 45
const LIVE_UPDATE_EVERY = 10

export type CaptureKind = 'calibrating' | 'recording'
export type CaptureMode = CaptureKind | 'idle'

export interface ToneCapture {
  mode: CaptureMode
  /** Live analysis while capturing, updated every LIVE_UPDATE_EVERY frames. */
  live: CaptureAnalysis | null
  /** Frames from the last completed recording (null after calibration). */
  lastFrames: Frame[] | null
  baseFreq: number | null
  calibrationMsg: string | null
  error: string | null
  start: (kind: CaptureKind) => Promise<void>
  stop: () => void
  /** Mutable frame buffer — read per animation frame by the contour graph. */
  framesRef: RefObject<Frame[]>
}

/**
 * Microphone capture loop: getUserMedia → AnalyserNode → rAF → pitchy MPM.
 *
 * Every frame stores {freq, clarity, rms} so analyzeCapture can classify
 * silence/noise, and calibration can pin a speaker base frequency. Nothing
 * here touches the network — frames stay in memory on-device.
 */
export function useToneCapture(): ToneCapture {
  const [mode, setMode] = useState<CaptureMode>('idle')
  const [live, setLive] = useState<CaptureAnalysis | null>(null)
  const [lastFrames, setLastFrames] = useState<Frame[] | null>(null)
  const [baseFreq, setBaseFreq] = useState<number | null>(null)
  const [calibrationMsg, setCalibrationMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const modeRef = useRef<CaptureKind | 'idle'>('idle')
  const streamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const rafRef = useRef(0)
  const framesRef = useRef<Frame[]>([])

  const teardown = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    audioContextRef.current?.close().catch(() => {})
    audioContextRef.current = null
    streamRef.current?.getTracks().forEach(track => track.stop())
    streamRef.current = null
    modeRef.current = 'idle'
    setMode('idle')
    setLive(null)
  }, [])

  const stop = useCallback(() => {
    if (modeRef.current === 'idle') return

    const kind = modeRef.current
    const frames = [...framesRef.current]
    const result = analyzeCapture(frames)
    teardown()

    if (kind === 'calibrating') {
      setLastFrames(null)
      if (result.state === 'ok' && result.baseFreq) {
        setBaseFreq(result.baseFreq)
        setCalibrationMsg(`Calibrated at ${result.baseFreq.toFixed(0)} Hz`)
      } else {
        setCalibrationMsg(
          `Calibration failed: ${CAPTURE_STATE_LABEL[result.state]}. Retry closer to the mic.`,
        )
      }
      return
    }

    setLastFrames(frames)
  }, [teardown])

  const start = useCallback(
    async (kind: CaptureKind) => {
      setError(null)
      if (kind === 'calibrating') setCalibrationMsg(null)
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false },
        })
        streamRef.current = stream

        const audioContext = new window.AudioContext()
        await audioContext.resume()
        audioContextRef.current = audioContext

        const analyser = audioContext.createAnalyser()
        analyser.fftSize = 2048
        audioContext.createMediaStreamSource(stream).connect(analyser)

        const detector = PitchDetector.forFloat32Array(analyser.fftSize)
        const timeDomain = new Float32Array(analyser.fftSize)

        framesRef.current = []
        setLastFrames(null)
        setLive(null)
        modeRef.current = kind
        setMode(kind)

        const tick = () => {
          analyser.getFloatTimeDomainData(timeDomain)
          let sum = 0
          for (let i = 0; i < timeDomain.length; i++) sum += timeDomain[i] * timeDomain[i]
          const rms = Math.sqrt(sum / timeDomain.length)

          const [pitch, clarity] = detector.findPitch(timeDomain, audioContext.sampleRate)
          framesRef.current.push({ freq: pitch, clarity, rms })

          if (framesRef.current.length % LIVE_UPDATE_EVERY === 0) {
            setLive(analyzeCapture(framesRef.current))
          }

          if (kind === 'calibrating' && framesRef.current.length >= CALIBRATE_FRAMES) {
            stop()
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
    },
    [stop, teardown],
  )

  useEffect(() => teardown, [teardown])

  return { mode, live, lastFrames, baseFreq, calibrationMsg, error, start, stop, framesRef }
}
