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

  useEffect(() => {
    async function loadCards() {
      try {
        const allCards = await db.cards.limit(20).toArray()
        setQueue(allCards)
        setInitialCount(allCards.length)
      } catch (err) {
        console.error('Failed to load cards:', err)
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
    return <div className="text-gray-400 animate-pulse">Loading cards...</div>
  }

  if (queue.length === 0 && !showSummary) {
    return (
      <div className="card-container text-center flex flex-col items-center">
        <p className="mb-2">No cards found in the database.</p>
        <button className="primary mt-4 px-6 py-2 rounded-full font-bold" onClick={() => setLocation('/')}>Go Back</button>
      </div>
    )
  }

  if (showSummary) {
    return <SessionSummary stats={stats} />
  }

  const currentCard = queue[0]
  const attempts = attemptCounts[currentCard.id] || 0
  const uniqueKey = `${currentCard.id}-${attempts}`

  return (
    <div style={{ width: '100%' }}>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        marginBottom: '2rem',
        opacity: 0.6,
        fontSize: '0.875rem'
      }}>
        <button 
          onClick={() => setLocation('/')}
          style={{ background: 'transparent', border: 'none', padding: 0, textDecoration: 'underline' }}
        >
          Quit
        </button>
        <span>Card {stats.totalStudied + (attempts === 0 ? 1 : 0)} of {initialCount}</span>
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
