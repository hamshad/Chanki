import { useState, useMemo } from 'react'
import {
  analyzeCapture,
  calculateToneScore,
  toSemitones,
  CAPTURE_STATE_LABEL,
  MAX_VOICED_HZ,
  MIN_VOICED_HZ,
  type CaptureState,
} from '../utils/scoring'
import { useToneCapture } from '../hooks/useToneCapture'
import type { Tone } from '../types'

export function ToneSpike() {
  const [targetTone, setTargetTone] = useState<Tone>('1')
  const { mode, live, lastFrames, baseFreq, calibrationMsg, error, start, stop } = useToneCapture()

  const busy = mode !== 'idle'
  const analysis = useMemo(() => (lastFrames ? analyzeCapture(lastFrames) : null), [lastFrames])
  const score = useMemo(() => {
    if (!lastFrames) return null
    return calculateToneScore(
      lastFrames.map(f => f.freq),
      targetTone,
      baseFreq ?? undefined,
    )
  }, [lastFrames, targetTone, baseFreq])

  const displayState = live ?? analysis
  const shape = useMemo(() => {
    const freqs = lastFrames?.map(f => f.freq) ?? []
    const voiced = freqs.filter(p => p >= MIN_VOICED_HZ && p <= MAX_VOICED_HZ)
    const semis = toSemitones(freqs, baseFreq ?? undefined)
    return voiced.map((hz, i) => ({ hz, semi: semis[i] }))
  }, [lastFrames, baseFreq])

  return (
    <div className="w-full max-w-xl mx-auto" data-testid="tone-spike">
      <p className="eyebrow">dev harness · phase 10</p>
      <h2 className="display text-3xl mb-1">Tone spike</h2>
      <p className="text-gray-400 text-sm mb-6">
        Pitch capture runs fully on-device — no audio or pitch data is ever uploaded.
      </p>

      <div className="mb-4">
        <label className="field-label mr-4" htmlFor="target-tone">
          Target Tone:
        </label>
        <select
          id="target-tone"
          value={targetTone}
          onChange={e => setTargetTone(e.target.value as Tone)}
          className="select-inline"
          disabled={busy}
        >
          <option value="1">Tone 1 (5-5)</option>
          <option value="2">Tone 2 (3-5)</option>
          <option value="3">Tone 3 (2-1-4)</option>
          <option value="4">Tone 4 (5-1)</option>
          <option value="5">Tone 5 (Neutral)</option>
        </select>
      </div>

      <div className="readout mb-4 flex items-center justify-between gap-4">
        <div>
          <div className="text-sm text-gray-400">Speaker base (calibration)</div>
          <div className="text-lg font-mono">
            {baseFreq ? `${baseFreq.toFixed(1)} Hz` : 'not set — defaults to first voiced frame'}
          </div>
          {calibrationMsg && <div className="text-xs text-amber-400 mt-1">{calibrationMsg}</div>}
        </div>
        <button
          type="button"
          onClick={() => start('calibrating')}
          disabled={busy}
          className="secondary"
        >
          Calibrate mic
        </button>
      </div>

      <div className="mb-8">
        {!busy ? (
          <button
            type="button"
            onClick={() => start('recording')}
            className="primary"
          >
            Start Recording
          </button>
        ) : (
          <button type="button" onClick={stop} className="bg-red-600 hover:bg-red-500 px-4 py-2 rounded font-bold animate-pulse">
            {mode === 'calibrating' ? 'Stop calibration' : 'Stop Recording'}
          </button>
        )}
      </div>

      {displayState && (
        <div className="readout mb-6" data-testid="capture-state">
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
        <div className="alert alert--error mb-6" role="alert">
          {error}
        </div>
      )}

      {score !== null && analysis && (
        <div className="readout readout--score mb-8">
          <h3 className="text-xl font-medium">
            Score: <span className="display text-4xl">{score}</span>
            <span className="text-xl faint"> / 100</span>
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
              Result unreliable — {CAPTURE_STATE_LABEL[analysis.state].toLowerCase()}. Recalibrate
              and try again.
            </p>
          )}
        </div>
      )}

      {shape.length > 0 && (
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
      ? 'chip chip--live'
      : state === 'too-short'
        ? 'chip'
        : 'chip chip--warn'
  return <span className={tone}>{CAPTURE_STATE_LABEL[state]}</span>
}
