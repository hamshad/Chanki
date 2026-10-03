import { useEffect, useState } from 'react'
import { useLocation } from 'wouter'
import { db } from '../data/db'
import { fetchRemoteCards } from '../data/remoteCards'
import { getIntroducedToday } from '../data/review'
import { endOfLocalDay, localDayStamp } from '../utils/day'
import {
  buildDailyQueue,
  countByKind,
  NEW_PER_DAY,
  REVIEWS_PER_DAY,
  type QueueCounts,
  type QueueItem,
} from '../scheduler'
import { CardView } from '../components/Review/CardView'
import { SessionSummary, type SessionStats } from '../components/Review/SessionSummary'
import { LifeLoader } from '../components/LifeLoader'
import type { Rating } from '../types'
import { motion, AnimatePresence } from 'framer-motion'

/**
 * Requeue budget per card inside one session: a card graded "again" comes
 * back (Anki learning step), but at most this many times before the session
 * lets it go — keeps an "again"-loop from never finishing the day.
 */
const MAX_REQUEUES = 3

type Mode = 'loading' | 'failed' | 'empty' | 'session' | 'summary' | 'dayDone'

const KIND_LABEL: Record<keyof QueueCounts, string> = {
  learning: 'LRN',
  review: 'DUE',
  new: 'NEW',
}

export function ReviewSession() {
  const [, setLocation] = useLocation()
  const [mode, setMode] = useState<Mode>('loading')
  const [dayDoneReason, setDayDoneReason] = useState<'completed' | 'clear'>('completed')
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [stats, setStats] = useState<SessionStats>({ totalStudied: 0, correctFirstTry: 0, retries: 0 })
  const [attemptCounts, setAttemptCounts] = useState<Record<string, number>>({})
  const [initialCount, setInitialCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [cards, progress, dayStamp, introducedToday] = await Promise.all([
          fetchRemoteCards(),
          db.progress.toArray(),
          db.meta.get('lastCompletedDay'),
          getIntroducedToday(),
        ])
        if (cancelled) return

        if (cards.length === 0) {
          setMode('empty')
          return
        }

        // Day-completed gate: stays done until local midnight.
        if (dayStamp?.value === localDayStamp()) {
          setDayDoneReason('completed')
          setMode('dayDone')
          return
        }

        const { queue: dayQueue } = buildDailyQueue(cards, progress, {
          now: Date.now(),
          newPerDay: NEW_PER_DAY,
          reviewsPerDay: REVIEWS_PER_DAY,
          introducedToday,
        })

        if (dayQueue.length === 0) {
          setDayDoneReason('clear')
          setMode('dayDone')
          return
        }

        setQueue(dayQueue)
        setInitialCount(dayQueue.length)
        setMode('session')
      } catch (err) {
        console.error('Failed to load cards:', err)
        if (!cancelled) setMode('failed')
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const handleNext = (rating: Rating, nextDueMs: number) => {
    const current = queue[0]
    const attempts = attemptCounts[current.card.id] || 0

    setStats(prev => {
      const next = { ...prev }
      if (attempts === 0) {
        next.totalStudied += 1
        if (rating !== 'again') next.correctFirstTry += 1
      }
      if (rating === 'again') next.retries += 1
      return next
    })

    setAttemptCounts(prev => ({ ...prev, [current.card.id]: attempts + 1 }))

    const remaining = queue.slice(1)
    // Anki learning step: a card scheduled later today (short step, or a
    // same-day review) comes back in this session instead of vanishing.
    if (nextDueMs <= endOfLocalDay() && attempts < MAX_REQUEUES) {
      remaining.push({
        ...current,
        kind: rating === 'again' ? 'learning' : 'review',
      })
    }

    if (remaining.length === 0) {
      // Queue exhausted = day complete (stays done until midnight).
      void db.meta.put({ key: 'lastCompletedDay', value: localDayStamp() })
      setMode('summary')
    } else {
      setQueue(remaining)
    }
  }

  if (mode === 'loading') {
    return (
      <div className="card-container" aria-busy="true" aria-live="polite">
        <LifeLoader className="life-loader--card" label="Loading cards" />
        <span className="faint text-sm mt-4">Loading cards…</span>
      </div>
    )
  }

  if (mode === 'failed') {
    return (
      <div className="state-block" role="alert">
        <h2 className="state-title">Cards could not be loaded</h2>
        <p>Check your connection — character data comes from the cloud.</p>
        <button className="primary mt-4" onClick={() => setLocation('/home')}>
          Back to home
        </button>
      </div>
    )
  }

  if (mode === 'empty') {
    return (
      <div className="state-block">
        <h2 className="state-title">No cards yet</h2>
        <p>The admin hasn't added any characters. Cards appear here as soon as they are saved.</p>
        <button className="primary mt-4" onClick={() => setLocation('/home')}>
          Back to home
        </button>
      </div>
    )
  }

  if (mode === 'dayDone') {
    return (
      <div className="state-block">
        <p className="eyebrow">today</p>
        <h2 className="state-title">
          {dayDoneReason === 'completed' ? "Today's review is done" : 'Nothing is due right now'}
        </h2>
        <p>
          {dayDoneReason === 'completed'
            ? 'Nice work — reviews open again tomorrow.'
            : 'Your next cards unlock tomorrow. Try the tone trainer meanwhile.'}
        </p>
        <button className="primary mt-4" onClick={() => setLocation('/home')}>
          Go home
        </button>
        <button className="btn-quiet mt-2" onClick={() => setLocation('/stats')}>
          Deck overview
        </button>
        <button className="btn-quiet mt-2" onClick={() => setLocation('/tone')}>
          Tone trainer
        </button>
      </div>
    )
  }

  if (mode === 'summary') {
    return <SessionSummary stats={stats} />
  }

  const currentCard = queue[0].card
  const attempts = attemptCounts[currentCard.id] || 0
  const uniqueKey = `${currentCard.id}-${attempts}`
  const answered = stats.totalStudied
  const progressPct = initialCount > 0 ? Math.round((answered / initialCount) * 100) : 0
  const counts = countByKind(queue)

  return (
    <div style={{ width: '100%' }}>
      <div className="session-toolbar">
        <button className="btn-quiet" onClick={() => setLocation('/home')}>
          ← Quit
        </button>

        {/* Anki-style queue composition: learning / due / new still to come. */}
        <span className="queue-chips" aria-label="Queue composition">
          <span className="queue-chip queue-chip--lrn">
            {counts.learning} <i>{KIND_LABEL.learning}</i>
          </span>
          <span className="queue-chip queue-chip--due">
            {counts.review} <i>{KIND_LABEL.review}</i>
          </span>
          <span className="queue-chip queue-chip--new">
            {counts.new} <i>{KIND_LABEL.new}</i>
          </span>
        </span>

        <span className="faint text-sm tnum">
          Card {answered + (attempts === 0 ? 1 : 0)} of {initialCount}
        </span>
      </div>

      <div
        className="session-progress"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={initialCount}
        aria-valuenow={answered}
        aria-label="Session progress"
      >
        <span style={{ width: `${progressPct}%` }} />
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={uniqueKey}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.3 }}
        >
          <CardView key={uniqueKey} card={currentCard} onNext={handleNext} />
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
