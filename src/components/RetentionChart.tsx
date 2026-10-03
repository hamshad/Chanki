/**
 * Retention curve: what a month of review actually buys you.
 *
 * Two schematic lines over 30 days — the forgetting curve if you only ever
 * re-read a word (fast exponential decay), and the sawtooth you get when each
 * review lands just before the drop. Drawn as plain SVG; no chart library.
 */

const DAYS = 30
const REVIEW_DAYS = [1, 3, 7, 14, 21, 28]
const W = 320
const H = 168
const PAD = { top: 12, right: 12, bottom: 24, left: 34 }

/** Re-reading only: classic Ebbinghaus-style exponential decay. */
function passiveRetention(day: number): number {
  return 100 * Math.exp(-day / 6)
}

/**
 * Spaced repetition: every retrieval resets retention to ~100% and the gap
 * before the next dip widens, so a month later it is still high.
 */
function spacedRetention(day: number): number {
  let last = 0
  for (const d of REVIEW_DAYS) if (day >= d) last = d
  const next = REVIEW_DAYS.find((d) => d > day) ?? DAYS
  return 100 - 22 * ((day - last) / Math.max(1, next - last))
}

const x = (day: number) => PAD.left + (day / DAYS) * (W - PAD.left - PAD.right)
const y = (value: number) => PAD.top + (1 - value / 100) * (H - PAD.top - PAD.bottom)

function buildPath(fn: (day: number) => number): string {
  const steps = 60
  return Array.from({ length: steps + 1 }, (_, i) => {
    const day = (i / steps) * DAYS
    return `${i === 0 ? 'M' : 'L'}${x(day).toFixed(1)},${y(fn(day)).toFixed(1)}`
  }).join(' ')
}

/** Steep decay needs many samples to look like a curve, not a wedge. */
const DECAY_STEPS = 120
const decayPath = Array.from({ length: DECAY_STEPS + 1 }, (_, i) => {
  const day = (i / DECAY_STEPS) * DAYS
  return `${i === 0 ? 'M' : 'L'}${x(day).toFixed(1)},${y(passiveRetention(day)).toFixed(1)}`
}).join(' ')

export function RetentionChart() {
  return (
    <figure className="curve">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Line chart of recall over 30 days. Re-reading alone falls from 100% to near zero within a fortnight; reviewing at spaced intervals stays above 75% for the whole month."
      >
        {/* gridlines */}
        {[0, 50, 100].map((value) => (
          <g key={value}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(value)} y2={y(value)} className="curve__grid" />
            <text x={PAD.left - 6} y={y(value) + 3} className="curve__tick curve__tick--y">
              {value}%
            </text>
          </g>
        ))}
        {[0, 15, DAYS].map((day) => (
          <text
            key={day}
            x={x(day)}
            y={H - PAD.bottom + 14}
            className="curve__tick curve__tick--x"
            textAnchor={day === 0 ? 'start' : day === DAYS ? 'end' : 'middle'}
          >
            {day === DAYS ? '30 days' : `day ${day}`}
          </text>
        ))}

        <path d={decayPath} className="curve__line curve__line--passive" />
        <path d={buildPath(spacedRetention)} className="curve__line curve__line--active" />

        {REVIEW_DAYS.map((day) => (
          <circle key={day} cx={x(day)} cy={y(spacedRetention(day))} r="2.4" className="curve__dot" />
        ))}
      </svg>

      <figcaption className="curve__legend">
        <span className="curve__key">
          <i className="curve__swatch curve__swatch--passive" aria-hidden="true" />
          re-reading only
        </span>
        <span className="curve__key">
          <i className="curve__swatch curve__swatch--active" aria-hidden="true" />
          with Chanki
        </span>
      </figcaption>
    </figure>
  )
}
