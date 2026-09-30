import { useEffect, useState } from 'react'
import { useLocation } from 'wouter'
import { motion } from 'framer-motion'
import { AudioLines, ArrowRight } from 'lucide-react'
import { db } from '../data/db'
import { InstallButton } from '../components/InstallButton.tsx'

interface DeckStats {
  deckName: string
  due: number
  total: number
}

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
}

const item = {
  hidden: { opacity: 0, y: 18 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as const },
  },
}

async function loadDeckStats(): Promise<DeckStats> {
  const [cards, decks, progress] = await Promise.all([
    db.cards.toArray(),
    db.decks.toArray(),
    db.progress.toArray(),
  ])

  const latest = new Map<string, number>()
  for (const p of progress) {
    const seen = latest.get(p.cardId)
    if (seen === undefined || p.updatedAt > seen) latest.set(p.cardId, p.due)
  }

  const now = Date.now()
  const due = cards.filter((c) => {
    const dueAt = latest.get(c.id)
    return dueAt === undefined || dueAt <= now
  }).length

  return {
    deckName: decks[0]?.name ?? 'your deck',
    due,
    total: cards.length,
  }
}

export function Home() {
  const [, setLocation] = useLocation()
  const [stats, setStats] = useState<DeckStats | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    loadDeckStats()
      .then((result) => {
        if (!cancelled) setStats(result)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const dueCopy =
    stats === null
      ? 'Counting your deck…'
      : stats.due === 0
        ? 'Nothing is due right now. Review anyway to reinforce.'
        : `${stats.due} ${stats.due === 1 ? 'card is' : 'cards are'} due today.`

  return (
    <motion.section
      variants={container}
      initial="hidden"
      animate="show"
      className="hero"
      aria-labelledby="hero-title"
    >
      <div>
        <motion.p variants={item} className="eyebrow">
          {stats ? stats.deckName : 'deck'} · four-sided recall
        </motion.p>

        <motion.h1 variants={item} id="hero-title">
          Daily review
        </motion.h1>

        <motion.p variants={item} className="lede">
          {failed ? 'Could not read your local deck.' : dueCopy} Character, pinyin, meaning and
          tone — each card prompts all four before you grade it.
        </motion.p>

        <motion.div variants={item} className="hero-actions">
          <button className="primary" onClick={() => setLocation('/review')}>
            Start session <ArrowRight size={17} aria-hidden="true" />
          </button>
          <button className="secondary" onClick={() => setLocation('/tone')}>
            <AudioLines size={16} aria-hidden="true" /> Tone trainer
          </button>
          <InstallButton />
        </motion.div>

        <motion.dl variants={item} className="hero-meta">
          <div>
            <dt className="label">Due now</dt>
            <dd className="value">{stats ? stats.due : '—'}</dd>
          </div>
          <div>
            <dt className="label">In deck</dt>
            <dd className="value">{stats ? stats.total : '—'}</dd>
          </div>
          <div>
            <dt className="label">Sides per card</dt>
            <dd className="value">4</dd>
          </div>
        </motion.dl>
      </div>

      <motion.span variants={item} className="hero-glyphs" aria-hidden="true">
        读写听说
      </motion.span>
    </motion.section>
  )
}
