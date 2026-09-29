import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { PitchDetector } from 'pitchy'
import {
  analyzeCapture,
  calculateToneScore,
  toSemitones,
  MAX_VOICED_HZ,
  MIN_VOICED_HZ,
  type CaptureAnalysis,
  type CaptureState,
  type Frame,
} from '../utils/scoring'
import type { Tone } from '../types'

const CALIBRATE_FRAMES = 45
const LIVE_UPDATE_EVERY = 10

type Mode = 'idle' | 'calibrating' | 'recording'

const STATE_LABEL: Record<CaptureState, string> = {
  'too-short': 'Too short',
  silence: 'No voice detected',
  noisy: 'Noisy background',
  ok: 'Clear',
}

export function ToneSpike() {
  const [mode, setMode] = useState<Mode>('idle')
  const [targetTone, setTargetTone] = useState<Tone>('1')
  const [baseFreq, setBaseFreq] = useState<number | null>(null)
  const [calibrationMsg, setCalibrationMsg] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<CaptureAnalysis | null>(null)
  const [score, setScore] = useState<number | null>(null)
  const [lastPitches, setLastPitches] = useState<number[]>([])
  const [live, setLive] = useState<CaptureAnalysis | null>(null)
  const [error, setError] = useState<string | null>(null)

  const modeRef = useRef<Mode>('idle')
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

  const finishCapture = useCallback(() => {
    const frames = [...framesRef.current]
    const result = analyzeCapture(frames)
    const wasCalibrating = modeRef.current === 'calibrating'
    teardown()

    if (wasCalibrating) {
      if (result.state === 'ok' && result.baseFreq) {
        setBaseFreq(result.baseFreq)
        setCalibrationMsg(`Calibrated at ${result.baseFreq.toFixed(0)} Hz`)
      } else {
        setCalibrationMsg(`Calibration failed: ${STATE_LABEL[result.state]}. Retry closer to the mic.`)
      }
      return
    }

    setAnalysis(result)
    setLastPitches(frames.map(f => f.freq))
    setScore(calculateToneScore(frames.map(f => f.freq), targetTone, baseFreq ?? undefined))
  }, [teardown, targetTone, baseFreq])

  const startCapture = useCallback(
    async (kind: Exclude<Mode, 'idle'>) => {
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
        const source = audioContext.createMediaStreamSource(stream)
        source.connect(analyser)

        const detector = PitchDetector.forFloat32Array(analyser.fftSize)
        const timeDomain = new Float32Array(analyser.fftSize)

        framesRef.current = []
        setAnalysis(null)
        setScore(null)
        setLastPitches([])
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
            finishCapture()
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
    [finishCapture, teardown],
  )

  useEffect(() => teardown, [teardown])

  const busy = mode !== 'idle'
  const displayState = live ?? analysis

  // toSemitones drops unvoiced frames, so zip against the filtered Hz list to keep indices aligned.
  const shape = useMemo(() => {
    const voiced = lastPitches.filter(p => p >= MIN_VOICED_HZ && p <= MAX_VOICED_HZ)
    const semis = toSemitones(lastPitches, baseFreq ?? undefined)
    return voiced.map((hz, i) => ({ hz, semi: semis[i] }))
  }, [lastPitches, baseFreq])

  return (
    <div className="p-8 text-white" data-testid="tone-spike">
      <h2 className="text-2xl font-bold mb-1">Tone Spike (Phase 10)</h2>
      <p className="text-gray-400 text-sm mb-6">
        Pitch capture runs fully on-device — no audio or pitch data is ever uploaded.
      </p>

      <div className="mb-4">
        <label className="mr-4" htmlFor="target-tone">
          Target Tone:
        </label>
        <select
          id="target-tone"
          value={targetTone}
          onChange={e => setTargetTone(e.target.value as Tone)}
          className="bg-gray-800 p-2 rounded"
          disabled={busy}
        >
          <option value="1">Tone 1 (5-5)</option>
          <option value="2">Tone 2 (3-5)</option>
          <option value="3">Tone 3 (2-1-4)</option>
          <option value="4">Tone 4 (5-1)</option>
          <option value="5">Tone 5 (Neutral)</option>
        </select>
      </div>

      <div className="mb-4 p-4 bg-gray-800 rounded flex items-center justify-between gap-4">
        <div>
          <div className="text-sm text-gray-400">Speaker base (calibration)</div>
          <div className="text-lg font-mono">
            {baseFreq ? `${baseFreq.toFixed(1)} Hz` : 'not set — defaults to first voiced frame'}
          </div>
          {calibrationMsg && <div className="text-xs text-amber-400 mt-1">{calibrationMsg}</div>}
        </div>
        <button
          onClick={() => startCapture('calibrating')}
          disabled={busy}
          className="bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 px-4 py-2 rounded font-bold"
        >
          Calibrate mic
        </button>
      </div>

      <div className="mb-8">
        {!busy ? (
          <button
            onClick={() => startCapture('recording')}
            className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded font-bold"
          >
            Start Recording
          </button>
        ) : (
          <button onClick={finishCapture} className="bg-red-600 hover:bg-red-500 px-4 py-2 rounded font-bold animate-pulse">
            {mode === 'calibrating' ? 'Stop calibration' : 'Stop Recording'}
          </button>
        )}
      </div>

      {displayState && (
        <div className="mb-6 p-3 bg-gray-900 rounded text-sm" data-testid="capture-state">
          <StateBadge state={displayState.state} />
          <span className="ml-3 text-gray-400 font-mono">
            voiced {(displayState.voicedRatio * 100).toFixed(0)}% · noise{' '}
            {(displayState.noiseRatio * 100).toFixed(0)}% · {displayState.frames} frames
          </span>
          <div className="mt-2 h-2 bg-gray-800 rounded overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-all"
              style={{ width: `${Math.round(displayState.voicedRatio * 100)}%` }}
            />
          </div>
        </div>
      )}

      {error && (
        <div className="mb-6 p-3 bg-red-900/60 border border-red-700 rounded text-sm" role="alert">
          {error}
        </div>
      )}

      {score !== null && analysis && (
        <div className="mb-8 p-4 bg-gray-800 rounded">
          <h3 className="text-xl">
            Score: <span className="font-bold text-green-400">{score} / 100</span>
          </h3>
          <div className="mt-2 text-sm text-gray-400">
            <StateBadge state={analysis.state} />
            <span className="ml-3">
              {analysis.voicedFrames} voiced / {analysis.frames} frames
              {baseFreq ? ` · scored against ${baseFreq.toFixed(0)} Hz base` : ''}
            </span>
          </div>
          {analysis.state !== 'ok' && (
            <p className="mt-2 text-xs text-amber-400">
              Result unreliable — {STATE_LABEL[analysis.state].toLowerCase()}. Recalibrate and try again.
            </p>
          )}
        </div>
      )}

      {lastPitches.length > 0 && (
        <div className="bg-gray-900 p-4 rounded text-xs text-gray-500 h-64 overflow-y-auto font-mono">
          <div className="text-gray-400 mb-2">frame · Hz · semitones vs base</div>
          {shape.map((row, i) => (
            <div key={i}>
              {String(i).padStart(3, ' ')} · {row.hz.toFixed(1)} Hz ·{' '}
              {row.semi >= 0 ? '+' : ''}
              {row.semi.toFixed(2)}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function StateBadge({ state }: { state: CaptureState }) {
  const tone =
    state === 'ok'
      ? 'bg-emerald-700 text-emerald-50'
      : state === 'too-short'
        ? 'bg-gray-700 text-gray-200'
        : 'bg-amber-700 text-amber-50'
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold uppercase ${tone}`}>
      {STATE_LABEL[state]}
    </span>
  )
}
