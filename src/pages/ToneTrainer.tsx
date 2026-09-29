import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Mic, MicOff, Target } from 'lucide-react'
import { useToneCapture } from '../hooks/useToneCapture'
import { ToneContour } from '../components/ToneContour'
import {
  analyzeCapture,
  calculateToneScore,
  CAPTURE_STATE_LABEL,
  MAX_VOICED_HZ,
  MIN_VOICED_HZ,
} from '../utils/scoring'
import {
  compareContours,
  divergenceHint,
  toContour,
  zoneLabel,
} from '../utils/toneContour'
import type { Tone } from '../types'

const TONE_OPTIONS: { value: Tone; label: string; pattern: string }[] = [
  { value: '1', label: 'Tone 1', pattern: '55 high level' },
  { value: '2', label: 'Tone 2', pattern: '35 rising' },
  { value: '3', label: 'Tone 3', pattern: '214 dip-rise' },
  { value: '4', label: 'Tone 4', pattern: '51 falling' },
  { value: '5', label: 'Tone 5', pattern: 'neutral light' },
]

export function ToneTrainer() {
  const [targetTone, setTargetTone] = useState<Tone>('3')
  const { mode, live, lastFrames, baseFreq, calibrationMsg, error, start, stop, framesRef } =
    useToneCapture()

  const busy = mode !== 'idle'
  const recording = mode === 'recording'

  const analysis = useMemo(() => (lastFrames ? analyzeCapture(lastFrames) : null), [lastFrames])
  const score = useMemo(() => {
    if (!lastFrames) return null
    return calculateToneScore(
      lastFrames.map(f => f.freq),
      targetTone,
      baseFreq ?? undefined,
    )
  }, [lastFrames, targetTone, baseFreq])

  const finalContour = useMemo(() => {
    if (!lastFrames) return null
    const contour = toContour(
      lastFrames.map(f => f.freq),
      baseFreq ?? undefined,
    )
    return contour.length > 0 ? contour : null
  }, [lastFrames, baseFreq])

  const divergence = useMemo(
    () => (finalContour ? compareContours(finalContour, targetTone) : null),
    [finalContour, targetTone],
  )

  const displayState = live ?? analysis
  const voicedFrames = lastFrames
    ? lastFrames.filter(f => f.freq >= MIN_VOICED_HZ && f.freq <= MAX_VOICED_HZ).length
    : 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-6 text-white w-full max-w-xl mx-auto"
      data-testid="tone-trainer"
    >
      <h2 className="text-2xl font-bold mb-1">Tone Trainer</h2>
      <p className="text-gray-400 text-sm mb-5">
        Record a syllable and watch your pitch contour against the target shape. Everything stays
        on-device.
      </p>

      <div className="grid grid-cols-5 gap-2 mb-5">
        {TONE_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => setTargetTone(opt.value)}
            disabled={busy}
            title={opt.pattern}
            className={`py-2 rounded text-sm font-bold border transition-colors disabled:opacity-40 ${
              targetTone === opt.value
                ? 'border-transparent text-gray-950'
                : 'border-gray-700 text-gray-300 hover:border-gray-500'
            }`}
            style={
              targetTone === opt.value
                ? { background: `var(--tone-${opt.value})` }
                : undefined
            }
          >
            {opt.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-gray-500 -mt-3 mb-5">
        Target: <span className="text-gray-300">{TONE_OPTIONS.find(o => o.value === targetTone)?.pattern}</span>
      </p>

      <ToneContour
        targetTone={targetTone}
        framesRef={framesRef}
        recording={recording}
        baseFreq={baseFreq}
        final={finalContour}
      />

      {displayState && (
        <div className="mt-3 p-3 bg-gray-900 rounded text-sm" data-testid="capture-state">
          <span
            className={`inline-block px-2 py-0.5 rounded text-xs font-bold uppercase ${
              displayState.state === 'ok'
                ? 'bg-emerald-700 text-emerald-50'
                : displayState.state === 'too-short'
                  ? 'bg-gray-700 text-gray-200'
                  : 'bg-amber-700 text-amber-50'
            }`}
          >
            {CAPTURE_STATE_LABEL[displayState.state]}
          </span>
          <span className="ml-3 text-gray-400 font-mono">
            voiced {(displayState.voicedRatio * 100).toFixed(0)}% · {displayState.frames} frames
          </span>
        </div>
      )}

      {error && (
        <div className="mt-3 p-3 bg-red-900/60 border border-red-700 rounded text-sm" role="alert">
          {error}
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          onClick={() => start('calibrating')}
          disabled={busy}
          className="bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 px-4 py-2 rounded font-bold flex items-center gap-2"
        >
          <Target size={16} />
          {baseFreq ? 'Recalibrate' : 'Calibrate mic'}
        </button>

        {!busy ? (
          <button
            onClick={() => start('recording')}
            className="bg-blue-600 hover:bg-blue-500 px-5 py-2 rounded font-bold flex items-center gap-2"
          >
            <Mic size={16} />
            Record attempt
          </button>
        ) : (
          <button
            onClick={stop}
            className="bg-red-600 hover:bg-red-500 px-5 py-2 rounded font-bold flex items-center gap-2 animate-pulse"
          >
            <MicOff size={16} />
            {mode === 'calibrating' ? 'Stop calibration' : 'Stop'}
          </button>
        )}

        <span className="text-xs text-gray-500 font-mono">
          {baseFreq ? `base ${baseFreq.toFixed(0)} Hz` : 'no calibration (base = first frame)'}
        </span>
      </div>

      {calibrationMsg && <p className="mt-2 text-xs text-amber-400">{calibrationMsg}</p>}

      {score !== null && divergence && analysis && finalContour && (
        <div className="mt-5 p-4 bg-gray-800 rounded" data-testid="attempt-result">
          <div className="flex items-baseline justify-between">
            <h3 className="text-xl">
              Score:{' '}
              <span className="font-bold text-green-400">{score} / 100</span>
            </h3>
            <span className="text-sm text-gray-400 font-mono">
              avg error {divergence.meanAbsError.toFixed(1)} st
            </span>
          </div>

          <p className="mt-2 text-sm text-gray-300">
            <span className="font-bold text-amber-400">{zoneLabel(divergence.zone)} third</span>{' '}
            diverged most ({divergence.zoneError.toFixed(1)} semitones off).
          </p>
          <p className="mt-1 text-sm text-gray-400">{divergenceHint(targetTone, divergence.zone)}</p>

          <div className="mt-3 text-xs text-gray-500">
            {voicedFrames} voiced / {analysis.frames} frames
            {analysis.state !== 'ok' && (
              <span className="text-amber-400"> · capture was {CAPTURE_STATE_LABEL[analysis.state].toLowerCase()}, treat score as a hint</span>
            )}
          </div>
        </div>
      )}
    </motion.div>
  )
}
