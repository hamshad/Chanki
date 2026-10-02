import { useState, useEffect } from 'react'
import { useLocation } from 'wouter'
import { db } from '../../data/db'

export interface SessionStats {
  totalStudied: number
  correctFirstTry: number
  retries: number
}

interface SessionSummaryProps {
  stats: SessionStats
}

export function SessionSummary({ stats }: SessionSummaryProps) {
  const [, setLocation] = useLocation()
  const [nextDue, setNextDue] = useState<string>('Calculating...')
  
  const accuracy = stats.totalStudied > 0 
    ? Math.round((stats.correctFirstTry / stats.totalStudied) * 100) 
    : 0

  useEffect(() => {
    async function loadNextDue() {
      try {
        const nextCard = await db.progress.orderBy('due').first()
        if (!nextCard) {
          setNextDue('No cards due!')
          return
        }
        
        const now = Date.now()
        const diffMs = nextCard.due - now
        
        if (diffMs <= 0) {
          setNextDue('Now')
        } else {
          const diffMins = Math.round(diffMs / 60000)
          if (diffMins < 60) setNextDue(`in ${diffMins} min`)
          else {
            const diffHours = Math.round(diffMins / 60)
            if (diffHours < 24) setNextDue(`in ${diffHours} hours`)
            else setNextDue(`in ${Math.round(diffHours / 24)} days`)
          }
        }
      } catch (err) {
        setNextDue('Unknown')
      }
    }
    loadNextDue()
  }, [])

  return (
    <div className="card-container flex flex-col items-center justify-center min-h-[60vh] text-center w-full">
      <p className="eyebrow">day complete</p>
      <h2 className="display text-4xl" style={{ margin: '0.35rem 0 2rem' }}>
        Done for today
      </h2>

      <div className="stat-grid mb-8">
        <div className="stat">
          <span className="stat-label">cards</span>
          <span className="stat-value">{stats.totalStudied}</span>
        </div>

        <div className="stat">
          <span className="stat-label">accuracy</span>
          <span className="stat-value">{accuracy}%</span>
        </div>

        <div className="stat stat--wide">
          <span className="stat-label">retries</span>
          <span className="stat-value">{stats.retries}</span>
        </div>
      </div>

      <p className="faint text-sm mb-8 tnum">Next review due {nextDue}</p>

      <button className="primary" onClick={() => setLocation('/home')}>
        Go home
      </button>
      <button className="btn-quiet mt-2" onClick={() => setLocation('/stats')}>
        Deck overview
      </button>
    </div>
  )
}
