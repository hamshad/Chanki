import { useState, useEffect } from 'react'
import { useLocation } from 'wouter'
import { db } from '../data/db'
import { CardView } from '../components/Review/CardView'
import { SessionSummary, type SessionStats } from '../components/Review/SessionSummary'
import type { Card } from '../data/schema'
import type { Rating } from '../types'
import { motion, AnimatePresence } from 'framer-motion'

export function ReviewSession() {
  const [, setLocation] = useLocation()
  const [queue, setQueue] = useState<Card[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<SessionStats>({ totalStudied: 0, correctFirstTry: 0, retries: 0 })
  const [attemptCounts, setAttemptCounts] = useState<Record<string, number>>({})
  const [showSummary, setShowSummary] = useState(false)
  const [initialCount, setInitialCount] = useState(0)
  const [loadFailed, setLoadFailed] = useState(false)

  useEffect(() => {
    async function loadCards() {
      try {
        const allCards = await db.cards.limit(20).toArray()
        setQueue(allCards)
        setInitialCount(allCards.length)
      } catch (err) {
        console.error('Failed to load cards:', err)
        setLoadFailed(true)
      } finally {
        setLoading(false)
      }
    }
    loadCards()
  }, [])

  const handleNext = (rating: Rating) => {
    const currentCard = queue[0]
    const attempts = attemptCounts[currentCard.id] || 0

    setStats((prev) => {
      const newStats = { ...prev }
      if (attempts === 0) {
        newStats.totalStudied += 1
        if (rating !== 'again') {
          newStats.correctFirstTry += 1
        }
      }
      if (rating === 'again') {
        newStats.retries += 1
      }
      return newStats
    })

    setAttemptCounts((prev) => ({
      ...prev,
      [currentCard.id]: attempts + 1
    }))

    setQueue((prevQueue) => {
      const remaining = prevQueue.slice(1)
      if (rating === 'again') {
        remaining.push(currentCard)
      }
      if (remaining.length === 0) {
        setShowSummary(true)
      }
      return remaining
    })
  }

  if (loading) {
    return (
      <div className="card-container" aria-busy="true" aria-live="polite">
        <div className="skeleton skeleton-card">
          <div className="skeleton-line" style={{ width: '6rem' }} />
          <div className="skeleton-line" style={{ width: '10rem', height: '3.5rem' }} />
          <div className="skeleton-line" style={{ width: '7rem' }} />
        </div>
        <span className="faint text-sm mt-4">Loading cards…</span>
      </div>
    )
  }

  if (loadFailed) {
    return (
      <div className="state-block" role="alert">
        <h2 className="state-title">Your deck could not be read</h2>
        <p>Local storage may be blocked or full. Check site permissions, then try again.</p>
        <button className="primary mt-4" onClick={() => setLocation('/')}>
          Back to home
        </button>
      </div>
    )
  }

  if (queue.length === 0 && !showSummary) {
    return (
      <div className="state-block">
        <h2 className="state-title">No cards in this deck yet</h2>
        <p>Add cards through the admin panel, or import a deck JSON to start reviewing.</p>
        <button className="primary mt-4" onClick={() => setLocation('/')}>
          Back to home
        </button>
      </div>
    )
  }

  if (showSummary) {
    return <SessionSummary stats={stats} />
  }

  const currentCard = queue[0]
  const attempts = attemptCounts[currentCard.id] || 0
  const uniqueKey = `${currentCard.id}-${attempts}`
  const answered = stats.totalStudied
  const progressPct = initialCount > 0 ? Math.round((answered / initialCount) * 100) : 0

  return (
    <div style={{ width: '100%' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.1rem',
        }}
      >
        <button className="btn-quiet" onClick={() => setLocation('/')}>
          ← Quit
        </button>
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
          <CardView 
            key={uniqueKey}
            card={currentCard} 
            onNext={handleNext} 
          />
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
