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
      <h2 className="display text-3xl mb-1">Tone trainer</h2>
      <p className="text-gray-400 text-sm mb-5">
        Record a syllable and watch your pitch contour against the target shape. Everything stays
        on-device.
      </p>

      <div className="tone-picker">
        {TONE_OPTIONS.map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setTargetTone(opt.value)}
            disabled={busy}
            title={opt.pattern}
            aria-pressed={targetTone === opt.value}
            className="tone-option"
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
        <div className="readout mt-3" data-testid="capture-state">
          <span
            className={`chip ${
              displayState.state === 'ok'
                ? 'chip--live'
                : displayState.state === 'too-short'
                  ? ''
                  : 'chip--warn'
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
        <div className="alert alert--error mt-3" role="alert">
          {error}
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => start('calibrating')}
          disabled={busy}
          className="secondary"
        >
          <Target size={16} aria-hidden="true" />
          {baseFreq ? 'Recalibrate' : 'Calibrate mic'}
        </button>

        {!busy ? (
          <button
            type="button"
            onClick={() => start('recording')}
            className="primary"
          >
            <Mic size={16} aria-hidden="true" />
            Record attempt
          </button>
        ) : (
          <button
            type="button"
            onClick={stop}
            className="bg-red-600 hover:bg-red-500 px-5 py-2 rounded font-bold flex items-center gap-2 animate-pulse"
          >
            <MicOff size={16} aria-hidden="true" />
            {mode === 'calibrating' ? 'Stop calibration' : 'Stop'}
          </button>
        )}

        <span className="text-xs text-gray-500 font-mono">
          {baseFreq ? `base ${baseFreq.toFixed(0)} Hz` : 'no calibration (base = first frame)'}
        </span>
      </div>

      {calibrationMsg && <p className="mt-2 text-xs text-amber-400">{calibrationMsg}</p>}

      {score !== null && divergence && analysis && finalContour && (
        <div className="readout readout--score mt-5" data-testid="attempt-result">
          <div className="flex items-baseline justify-between">
            <h3 className="text-xl font-medium">
              Score:{' '}
              <span className="display text-4xl">{score}</span>
              <span className="text-xl faint"> / 100</span>
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
