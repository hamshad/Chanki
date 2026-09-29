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
      <h2 className="text-3xl font-bold mb-8">Session Complete!</h2>
      
      <div className="grid grid-cols-2 gap-4 w-full max-w-sm mb-12">
        <div className="glass-panel p-4 flex flex-col">
          <span className="text-sm text-gray-400 mb-1">Cards</span>
          <span className="text-3xl font-bold text-blue-400">{stats.totalStudied}</span>
        </div>
        
        <div className="glass-panel p-4 flex flex-col">
          <span className="text-sm text-gray-400 mb-1">Accuracy</span>
          <span className="text-3xl font-bold text-green-400">{accuracy}%</span>
        </div>
        
        <div className="glass-panel p-4 flex flex-col col-span-2">
          <span className="text-sm text-gray-400 mb-1">Retries</span>
          <span className="text-xl font-medium text-orange-400">{stats.retries}</span>
        </div>
      </div>
      
      <div className="mb-12 text-gray-400 text-sm">
        Next review due: {nextDue}
      </div>

      <button 
        className="primary px-12 py-3 rounded-full font-bold text-lg"
        onClick={() => setLocation('/')}
      >
        Finish
      </button>
    </div>
  )
}
