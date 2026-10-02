import { useEffect, useState } from 'react'
import { useLocation } from 'wouter'
import { motion } from 'framer-motion'
import { ArrowRight, Flame } from 'lucide-react'
import { db } from '../data/db'
import { fetchRemoteCards } from '../data/remoteCards'
import { getIntroducedToday } from '../data/review'
import { NEW_PER_DAY, REVIEWS_PER_DAY } from '../scheduler'
import { buildDeckOverview, formatDue, type DeckOverview } from '../utils/stats'

function BarChart<T extends { day: string }>({
  data,
  valueOf,
  accent,
  labelOf,
}: {
  data: T[]
  valueOf: (item: T) => number
  accent: 'accent' | 'warn'
  labelOf: (item: T) => string
}) {
  const max = Math.max(1, ...data.map(valueOf))
  return (
    <div className={`bar-chart bar-chart--${accent}`} role="img" aria-label="daily bars">
      {data.map(item => {
        const v = valueOf(item)
        return (
          <div className="bar-col" key={item.day} title={`${item.day}: ${v}`}>
            <span className="bar" style={{ height: `${Math.max(v > 0 ? 8 : 2, (v / max) * 100)}%` }} />
            <span className="bar-label tnum">{labelOf(item)}</span>
          </div>
        )
      })}
    </div>
  )
}

export function Stats() {
  const [, setLocation] = useLocation()
  const [overview, setOverview] = useState<DeckOverview | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [cards, progress, logs, introducedToday] = await Promise.all([
          fetchRemoteCards(),
          db.progress.toArray(),
          db.reviewLogs.toArray(),
          getIntroducedToday(),
        ])
        if (cancelled) return
        setOverview(
          buildDeckOverview(cards, progress, logs, {
            now: Date.now(),
            newPerDay: NEW_PER_DAY,
            introducedToday,
          }),
        )
      } catch {
        if (!cancelled) setFailed(true)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  if (failed) {
    return (
      <div className="state-block" role="alert">
        <h2 className="state-title">Overview unavailable</h2>
        <p>Check your connection — deck data comes from the cloud.</p>
        <button className="primary mt-4" onClick={() => setLocation('/home')}>
          Back to home
        </button>
      </div>
    )
  }

  if (!overview) {
    return (
      <div className="state-block" aria-busy="true" aria-live="polite">
        <span className="faint text-sm">Crunching your review history…</span>
      </div>
    )
  }

  const { dueNow, newToday, today, streak, forecast, activity, upcoming } = overview
  const dayNum = (day: string) => day.slice(8)

  return (
    <motion.section
      className="stats-page"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      aria-labelledby="stats-title"
    >
      <header className="stats-header">
        <div>
          <p className="eyebrow">chanki deck · overview</p>
          <h2 id="stats-title" className="display text-3xl">
            Deck overview
          </h2>
        </div>
        <p className="streak-badge" title="Consecutive days studied">
          <Flame size={16} aria-hidden="true" />
          {streak} {streak === 1 ? 'day' : 'days'}
        </p>
      </header>

      {/* Card states — Anki: new / learning / young / mature */}
      <div className="stat-tiles" aria-label="Card states">
        <div className="stat-tile">
          <span className="label">New</span>
          <span className="value tnum">{overview.newCount}</span>
          <span className="faint text-xs">never seen</span>
        </div>
        <div className="stat-tile stat-tile--lrn">
          <span className="label">Learning</span>
          <span className="value tnum">{overview.learningCount}</span>
          <span className="faint text-xs">in steps</span>
        </div>
        <div className="stat-tile stat-tile--young">
          <span className="label">Young</span>
          <span className="value tnum">{overview.youngCount}</span>
          <span className="faint text-xs">interval &lt; 21d</span>
        </div>
        <div className="stat-tile stat-tile--mature">
          <span className="label">Mature</span>
          <span className="value tnum">{overview.matureCount}</span>
          <span className="faint text-xs">interval ≥ 21d</span>
        </div>
      </div>

      <div className="stat-tiles stat-tiles--dues" aria-label="Due summary">
        <div className="stat-tile">
          <span className="label">Due now</span>
          <span className="value tnum">{dueNow.total}</span>
          <span className="faint text-xs">
            {dueNow.review} review · {dueNow.learning} learning
          </span>
        </div>
        <div className="stat-tile">
          <span className="label">New left today</span>
          <span className="value tnum">{newToday.left}</span>
          <span className="faint text-xs">
            {newToday.introduced}/{NEW_PER_DAY} introduced
          </span>
        </div>
        <div className="stat-tile">
          <span className="label">Studied today</span>
          <span className="value tnum">{today.unique}</span>
          <span className="faint text-xs">
            {today.reviews} reviews · {today.againPct}% again
          </span>
        </div>
        <div className="stat-tile">
          <span className="label">Deck</span>
          <span className="value tnum">{overview.total}</span>
          <span className="faint text-xs">cards · cap {REVIEWS_PER_DAY}/day</span>
        </div>
      </div>

      <section className="stats-section glass-panel" aria-labelledby="forecast-title">
        <h3 id="forecast-title" className="display text-2xl">
          Forecast
        </h3>
        <p className="faint text-sm">Reviews due over the next 14 days — overdue counts today.</p>
        <BarChart
          data={forecast}
          valueOf={item => item.due}
          accent="accent"
          labelOf={item => dayNum(item.day)}
        />
      </section>

      <section className="stats-section glass-panel" aria-labelledby="activity-title">
        <h3 id="activity-title" className="display text-2xl">
          Last 14 days
        </h3>
        <p className="faint text-sm">Reviews answered per day — “again” included.</p>
        <BarChart
          data={activity}
          valueOf={item => item.reviews}
          accent="warn"
          labelOf={item => dayNum(item.day)}
        />
      </section>

      <section className="stats-section glass-panel" aria-labelledby="upcoming-title">
        <h3 id="upcoming-title" className="display text-2xl">
          Upcoming
        </h3>
        <p className="faint text-sm">Next cards to resurface and when.</p>
        {upcoming.length === 0 ? (
          <p className="faint">Everything is due right now — no future dues waiting.</p>
        ) : (
          <ul className="upcoming-list">
            {upcoming.map(({ card, due }) => (
              <li key={card.id}>
                <span className="hanzi-text">{card.hanzi}</span>
                <span className="faint text-sm">{card.pinyin}</span>
                <span className="upcoming-due tnum text-sm">{formatDue(due, overview.now)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="stats-actions">
        <button className="primary" onClick={() => setLocation('/review')}>
          {dueNow.total > 0 || newToday.left > 0 ? 'Start review' : 'Review anyway'}{' '}
          <ArrowRight size={17} aria-hidden="true" />
        </button>
      </div>
    </motion.section>
  )
}
