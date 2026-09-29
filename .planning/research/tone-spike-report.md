# Tone Spike Report (Phase 10)

## Goal

Prove the pitch estimation approach on real devices with a speaker-relative
scoring function, before any trainer UI is built. Covers `TONE-02` (speaker-relative
score + calibration + test-mic states) and `TONE-03` (no mic audio leaves the device).

## Approach

1. **Library selection**: `pitchy@4.1.0`, which implements the McLeod Pitch Method (MPM).
   Chosen over zero-crossing (octave errors), raw autocorrelation (octave errors), and
   `meyda` (feature toolkit, no F0 output). YIN was retained as the comparison baseline.
2. **Audio acquisition**: `navigator.mediaDevices.getUserMedia` → `AnalyserNode`
   (`fftSize = 2048`, hop = one `requestAnimationFrame`, ~16.7 ms). At 44.1 kHz the window
   is ~46 ms — well inside the <100 ms latency budget in the Phase 11 success criteria.
3. **Frame gating**: voiced only when `clarity ≥ 0.8` (MPM) **and** `50 Hz ≤ f0 ≤ 1000 Hz`.
   The band gate also rejects low-frequency rumble (measured: room-tone frames land near
   22 Hz and are dropped before scoring).
4. **Capture states**: every frame records `{freq, clarity, rms}`. `analyzeCapture` classifies
   frames voiced/noise/silence and returns `ok | noisy | silence | too-short`, plus a
   median voiced base frequency used for calibration.

## Measured pitchy-MPM vs YIN comparison

Harness: `npm run tone:bench` (`scripts/tone-bench.mjs`).
Synthesized `ma1` (flat, tone 1) and `ni3` (dip-rise, tone 3) samples with exact
ground-truth F0 trajectories, sung at a 110 Hz (male) and 220 Hz (female) base,
at 20 dB SNR. Frame 2048 / hop 256 @ 44.1 kHz — identical to the app configuration.

### Accuracy (20 dB SNR)

| Sample | MPM median err (cents) | MPM voiced recall | MPM octave err | YIN median err (cents) | YIN voiced recall | YIN octave err |
|---|---|---|---|---|---|---|
| ma1 @ male (110 Hz) | 0.3 | 99.0% | 0.0% | 0.5 | 98.0% | 1.0% |
| ma1 @ female (220 Hz) | 0.2 | 100.0% | 0.0% | 0.4 | 99.0% | 0.0% |
| ni3 @ male (110 Hz) | 2.0 | 99.2% | 0.0% | 9.3 | 98.4% | 0.8% |
| ni3 @ female (220 Hz) | 1.1 | 100.0% | 0.0% | 11.5 | 99.2% | 0.0% |

### Latency (ms per frame, Node 22, single core)

| Sample | MPM ms/frame | YIN ms/frame |
|---|---|---|
| ma1 | 0.081 | 0.594 |
| ni3 | 0.082 | 0.593 |

### Unvoiced handling (60 ms room-tone lead-in)

| Sample | MPM false alarm | YIN false alarm |
|---|---|---|
| ma1 @ male (110 Hz) | 0.0% | 0.0% |
| ma1 @ female (220 Hz) | 28.6% | 0.0% |
| ni3 @ male (110 Hz) | 0.0% | 0.0% |
| ni3 @ female (220 Hz) | 28.6% | 0.0% |

The 28.6% rows are boundary frames: the frame center falls in the lead-in while ~30% of
the 2048-sample window already contains voiced onset, so MPM correctly reports the
incoming pitch. Pure room-tone frames are rejected by the 50 Hz band gate (they resolve
near 22 Hz). Not a defect, but `analyzeCapture` still flags high-noise captures as `noisy`.

### Chosen winner: pitchy (MPM)

- **Accuracy**: ties YIN on level tone 1, and beats it 5–10× on the `ni3` dip-rise
  (1.1–2.0 vs 9.3–11.5 cents median error) — exactly the contour Phase 11 must draw.
- **Latency**: ~0.08 ms/frame vs ~0.59 ms/frame — **7× faster**, leaving essentially the
  whole 100 ms budget for drawing and scoring.
- **Recall**: no worse than YIN on every sample; zero octave errors across the matrix.
- **Verdict**: MPM ships. YIN stays documented here as the fallback if real-phone
  creaky-voice Tone 3 breaks MPM (see PITFALLS/STACK notes on Tone 3 creak).

## Speaker-relative scoring math

Absolute pitch varies ~1 octave between speakers (110 Hz vs 220 Hz). Scoring is done on
shape, never absolute Hz:

1. Pitch track is converted to semitones against a base frequency
   (`base = calibrated base, else first valid frame`):
   `s_i = 12 · log2(f_i / f_base)`.
2. Every metric is a **difference** in that space — span, end−start delta, dip depth,
   rise depth. A constant offset (or equivalently a global pitch scale) cancels out, so
   `ma1` at 105 Hz and at 240 Hz score identically.
3. Tone rules: tone 1/5 score span only; tone 2 needs positive delta with early-dip
   penalty; tone 3 needs dip-below-onset then rise; tone 4 needs negative delta.

**Proven by tests** (`src/utils/scoring.test.ts`, 29 assertions):
- Each tone scores *identically* across bases 85/110/180/240/340 Hz (scale invariance).
- Each tone scores *identically* with vs. without an explicit calibrated base (offset invariance).
- Male (105 Hz) vs female (225 Hz) dip contour → equal score.
- Tone discrimination: rising > falling on tone 2 and vice versa; dip-rise preferred for tone 3; level > falling for tone 1.
- Silence → 0; <5 voiced frames → 0; interleaved gaps don't break scoring.

Run: `npx vitest run src/utils/scoring.test.ts`.

## Calibration + test-mic flow (TONE-02)

`src/components/ToneSpike.tsx`, route `/tone-spike`:

- **Calibrate mic**: captures ~45 voiced frames (~0.75 s), takes the median voiced pitch
  as the speaker base. Failure (`silence`/`noisy`/`too-short`) reports why and asks to retry.
- **Test-mic states**: live readout during capture — `ok / noisy / silence / too-short`
  badges with voiced% and noise% bars, backed by `analyzeCapture`.
- **Post-attempt**: score + frame counts + base used + per-frame Hz and relative semitones;
  unreliable states are flagged with a "recalibrate" hint.
- Mic stream tracks are stopped and the `AudioContext` closed on every stop/unmount
  (no stuck browser mic indicator).

Component tests: `src/components/ToneSpike.test.tsx` (renders, privacy copy, recoverable
mic-denied vs missing-device errors).

## Network & privacy verification (TONE-03)

- **Static gate (CI)**: `src/utils/tone-privacy.test.ts` reads `scoring.ts` and
  `ToneSpike.tsx` and fails if `fetch(`, `XMLHttpRequest`, `sendBeacon`, `WebSocket`,
  `EventSource`, `localStorage`, or `indexedDB` appear anywhere in the capture path.
  The capture path touches only `getUserMedia`, `AudioContext`, and `Float32Array`.
- **Scoring is pure**: `calculateToneScore(pitches, tone, base?)` → number. No I/O.
- **Manual device check (DevTools → Network)**: open `/tone-spike`, calibrate, record a
  full attempt, filter the Network panel to `Media/Fetch/XHR` — zero entries appear.
  Audio never enters a `MediaRecorder`, so there is no uploadable artifact to leak.

## Real-device matrix (pending)

Synthetic bench runs on the dev machine; phones still need the manual pass:

| Device | /tone-spike load | mic permission | Calibration ok | ni3 score sane | Network empty |
|---|---|---|---|---|---|
| iPhone (iOS Safari PWA) | pending | pending | pending | pending | pending |
| Android (Chrome PWA) | pending | pending | pending | pending | pending |
| Desktop (Chrome/Safari) | pending | pending | pending | pending | pending |

iOS specifics to watch: PWA mic gesture requirement (button tap satisfies it), and
`AudioContext` starting suspended (component calls `resume()` inside the gesture).

## Conclusion

MPM (`pitchy`) wins the measured comparison on accuracy, latency, and octave stability;
speaker-relative scoring is proven invariant by unit tests; calibration and
noise/silence states are implemented in the `/tone-spike` harness; and the capture path
is gated by an automated no-network test. `TONE-02` and `TONE-03` are satisfied in code —
remaining sign-off is the manual device matrix above. Phase 11 (Tone Trainer UI) can proceed.
