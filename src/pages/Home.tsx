import { useLocation } from 'wouter'
import { motion } from 'framer-motion'
import { BookOpen, AudioLines } from 'lucide-react'

export function Home() {
  const [, setLocation] = useLocation()

  const startSession = () => {
    setLocation('/review')
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="card-container"
      style={{ minHeight: '60vh' }}
    >
      <div className="glass-panel" style={{ padding: '3rem', width: '100%', maxWidth: '400px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2rem' }}>
          
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)' }}>
            <BookOpen size={32} color="var(--tone-4)" />
          </div>

          <div>
            <h2 className="text-2xl font-bold mb-2">Daily Review</h2>
            <p className="text-gray-400">Ready for your session? 20 cards are due today.</p>
          </div>

          <button 
            className="primary" 
            onClick={startSession}
            style={{ width: '100%', marginTop: '1rem' }}
          >
            Start Session
          </button>

          <button
            className="secondary"
            onClick={() => setLocation('/tone')}
            style={{ width: '100%' }}
          >
            <AudioLines size={16} /> Tone Trainer
          </button>
        </div>
      </div>
    </motion.div>
  )
}
