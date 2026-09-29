#!/usr/bin/env node
/**
 * Phase 10 spike bench: pitchy (McLeod MPM) vs a reference YIN implementation
 * on synthesized Mandarin tone samples with known ground-truth F0 trajectories.
 *
 * Samples: ma1 (flat) and ni3 (dip-rise), sung by a 110 Hz "male" and a
 * 220 Hz "female" voice, at 20 dB SNR. Frame: 2048 samples, hop 256 (~5.8 ms
 * @ 44.1 kHz) — the same configuration the ToneSpike component uses.
 *
 * Run: npm run tone:bench
 */
import { performance } from 'node:perf_hooks'
import { PitchDetector } from 'pitchy'

const SAMPLE_RATE = 44100
const FRAME = 2048
const HOP = 256
const FMIN = 50
const FMAX = 1000
const CLARITY_GATE = 0.8
const LEAD_SILENCE = 0.06 // seconds of room tone so false-alarm rate is measurable

/** Ground-truth F0 in Hz at time t (seconds). Shared by synthesis + scoring. */
const CONTOURS = {
  ma1: {
    syllable: 'ma1',
    duration: 0.6,
    // Tone 1: high level, 55 — plus a gentle 4.5 Hz vibrato (±12 cents).
    f0: (t, base) => base * Math.pow(2, (0.012 * Math.sin(2 * Math.PI * 4.5 * t)) / 12),
  },
  ni3: {
    syllable: 'ni3',
    duration: 0.75,
    // Tone 3: 214 — fall 4 semitones, hold, then rise 5 semitones.
    f0: (t, base) => {
      const p = t / 0.75
      let semis
      if (p < 0.45) semis = -4 * (p / 0.45)
      else if (p < 0.6) semis = -4
      else semis = -4 + 9 * ((p - 0.6) / 0.4)
      return base * Math.pow(2, semis / 12)
    },
  },
}

function synthesize(contour, base) {
  const { duration, f0 } = contour
  const lead = Math.floor(LEAD_SILENCE * SAMPLE_RATE)
  const n = lead + Math.floor(duration * SAMPLE_RATE)
  const signal = new Float32Array(n)

  let phase = 0
  for (let i = lead; i < n; i++) {
    const t = (i - lead) / SAMPLE_RATE
    phase += (2 * Math.PI * f0(t, base)) / SAMPLE_RATE
    let s = 0
    for (let h = 1; h <= 12; h++) s += Math.sin(h * phase) / h // band-limited sawtooth
    signal[i] = s
  }

  // 20 dB SNR white noise, present everywhere (incl. the lead-in).
  let sigPow = 0
  for (let i = lead; i < n; i++) sigPow += signal[i] * signal[i]
  const sigRms = Math.sqrt(sigPow / (n - lead))
  const noiseRms = sigRms / 10
  for (let i = 0; i < n; i++) signal[i] += gaussian() * noiseRms

  const gt = new Float32Array(n) // ground truth F0; 0 = unvoiced
  for (let i = 0; i < n; i++) gt[i] = i >= lead ? f0((i - lead) / SAMPLE_RATE, base) : 0
  return { signal, gt, lead }
}

function gaussian() {
  let u = 0
  let v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

function detectMpm(signal) {
  const detector = PitchDetector.forFloat32Array(FRAME)
  detector.clarityThreshold = CLARITY_GATE
  const out = []
  for (let start = 0; start + FRAME <= signal.length; start += HOP) {
    const frame = signal.subarray(start, start + FRAME)
    const [freq, clarity] = detector.findPitch(frame, SAMPLE_RATE)
    const voiced = clarity >= CLARITY_GATE && freq >= FMIN && freq <= FMAX
    out.push({ freq: voiced ? freq : 0, confidence: clarity })
  }
  return out
}

function detectYin(signal) {
  const out = []
  const W = FRAME >> 1
  const tauMin = Math.max(2, Math.floor(SAMPLE_RATE / FMAX))
  const tauMax = Math.min(W - 1, Math.floor(SAMPLE_RATE / FMIN))
  const d = new Float64Array(tauMax + 2)
  const cmnd = new Float64Array(tauMax + 2)

  for (let start = 0; start + FRAME <= signal.length; start += HOP) {
    const frame = signal.subarray(start, start + FRAME)

    for (let tau = 1; tau <= tauMax; tau++) {
      let sum = 0
      for (let i = 0; i < W; i++) {
        const diff = frame[i] - frame[i + tau]
        sum += diff * diff
      }
      d[tau] = sum
    }

    cmnd[0] = 1
    let running = 0
    for (let tau = 1; tau <= tauMax; tau++) {
      running += d[tau]
      cmnd[tau] = running > 0 ? (d[tau] * tau) / running : 1
    }

    let tauEst = -1
    const threshold = 0.15
    for (let tau = tauMin; tau <= tauMax; tau++) {
      if (cmnd[tau] < threshold) {
        while (tau + 1 <= tauMax && cmnd[tau + 1] < cmnd[tau]) tau++
        tauEst = tau
        break
      }
    }
    if (tauEst < 0) {
      let min = Infinity
      for (let tau = tauMin; tau <= tauMax; tau++) {
        if (cmnd[tau] < min) {
          min = cmnd[tau]
          tauEst = tau
        }
      }
      if (min > 0.35) tauEst = -1 // silence / unvoiced
    }

    if (tauEst < 0) {
      out.push({ freq: 0, confidence: 1 - cmnd[tauMin] })
      continue
    }

    // Parabolic interpolation around the CMND minimum.
    const prev = cmnd[tauEst - 1] ?? 1
    const next = cmnd[tauEst + 1] ?? 1
    const denom = 2 * (2 * cmnd[tauEst] - prev - next)
    const shift = denom !== 0 ? (next - prev) / denom : 0
    const freq = SAMPLE_RATE / (tauEst + shift)
    const voiced = freq >= FMIN && freq <= FMAX
    out.push({ freq: voiced ? freq : 0, confidence: 1 - cmnd[tauEst] })
  }
  return out
}

function evaluate(detections, gt, lead) {
  let sumAbsCents = 0
  let errCount = 0
  let octaveErrors = 0
  let voicedGt = 0
  let voicedHit = 0
  let unvoicedFrames = 0
  let falseAlarms = 0

  detections.forEach((det, i) => {
    const center = Math.floor(i * HOP + FRAME / 2)
    const truth = gt[Math.min(center, gt.length - 1)]
    const isVoiced = truth > 0

    if (isVoiced) {
      voicedGt++
      if (det.freq > 0) {
        voicedHit++
        const cents = 1200 * Math.log2(det.freq / truth)
        sumAbsCents += Math.abs(cents)
        errCount++
        if (Math.abs(cents) > 1150) octaveErrors++
      }
    } else {
      unvoicedFrames++
      if (det.freq > 0) falseAlarms++
    }
  })

  return {
    medianAbsCents: medianOf(detections, gt, lead),
    meanAbsCents: errCount ? sumAbsCents / errCount : NaN,
    octaveRate: errCount ? (octaveErrors / errCount) * 100 : NaN,
    voicedRecall: voicedGt ? (voicedHit / voicedGt) * 100 : NaN,
    falseAlarm: unvoicedFrames ? (falseAlarms / unvoicedFrames) * 100 : NaN,
  }
}

function medianOf(detections, gt) {
  const errors = []
  detections.forEach((det, i) => {
    const center = Math.floor(i * HOP + FRAME / 2)
    const truth = gt[Math.min(center, gt.length - 1)]
    if (truth > 0 && det.freq > 0) errors.push(Math.abs(1200 * Math.log2(det.freq / truth)))
  })
  errors.sort((a, b) => a - b)
  if (!errors.length) return NaN
  const mid = errors.length >> 1
  return errors.length % 2 ? errors[mid] : (errors[mid - 1] + errors[mid]) / 2
}

function timeFrames(fn, signal) {
  fn(signal) // warm-up
  const runs = 5
  const t0 = performance.now()
  for (let r = 0; r < runs; r++) fn(signal)
  const frames = Math.floor((signal.length - FRAME) / HOP) + 1
  return (performance.now() - t0) / runs / frames
}

function fmt(v, digits = 1) {
  return Number.isFinite(v) ? v.toFixed(digits) : 'n/a'
}

const SPEAKERS = [
  { label: 'male (110 Hz)', base: 110 },
  { label: 'female (220 Hz)', base: 220 },
]

const rows = []
for (const contour of Object.values(CONTOURS)) {
  for (const speaker of SPEAKERS) {
    const { signal, gt } = synthesize(contour, speaker.base)
    const mpm = evaluate(detectMpm(signal), gt, 0)
    const yin = evaluate(detectYin(signal), gt, 0)
    rows.push({ sample: `${contour.syllable} @ ${speaker.label}`, mpm, yin })
  }
}

const mpmMs = {}
const yinMs = {}
for (const [name, contour] of Object.entries(CONTOURS)) {
  const { signal } = synthesize(contour, 150)
  mpmMs[name] = timeFrames(detectMpm, signal)
  yinMs[name] = timeFrames(detectYin, signal)
}

console.log('## Accuracy (20 dB SNR, frame 2048 / hop 256 @ 44.1 kHz)\n')
console.log('| Sample | MPM median err (cents) | MPM voiced recall | MPM octave err | YIN median err (cents) | YIN voiced recall | YIN octave err |')
console.log('|---|---|---|---|---|---|---|')
for (const r of rows) {
  console.log(
    `| ${r.sample} | ${fmt(r.mpm.medianAbsCents)} | ${fmt(r.mpm.voicedRecall)}% | ${fmt(r.mpm.octaveRate)}% | ${fmt(r.yin.medianAbsCents)} | ${fmt(r.yin.voicedRecall)}% | ${fmt(r.yin.octaveRate)}% |`,
  )
}

console.log('\n## Latency (ms per frame, Node 22, single core)\n')
console.log('| Sample | MPM ms/frame | YIN ms/frame |')
console.log('|---|---|---|')
for (const name of Object.keys(CONTOURS)) {
  console.log(`| ${CONTOURS[name].syllable} | ${fmt(mpmMs[name], 3)} | ${fmt(yinMs[name], 3)} |`)
}

console.log('\n## Unvoiced handling (60 ms room-tone lead-in)\n')
console.log('| Sample | MPM false alarm | YIN false alarm |')
console.log('|---|---|---|')
for (const r of rows) {
  console.log(`| ${r.sample} | ${fmt(r.mpm.falseAlarm)}% | ${fmt(r.yin.falseAlarm)}% |`)
}
