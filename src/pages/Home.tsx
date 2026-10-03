import { useEffect, useState } from 'react'
import { useLocation } from 'wouter'
import { motion } from 'framer-motion'
import { AudioLines, ArrowRight, ShieldCheck } from 'lucide-react'
import { db } from '../data/db'
import { fetchRemoteCards } from '../data/remoteCards'
import { InstallButton } from '../components/InstallButton.tsx'
import { RetentionChart } from '../components/RetentionChart.tsx'

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
  const [cards, progress] = await Promise.all([fetchRemoteCards(), db.progress.toArray()])

  const latest = new Map<string, number>()
  for (const p of progress) {
    const seen = latest.get(p.cardId)
    if (seen === undefined || p.updatedAt > seen) latest.set(p.cardId, p.due)
  }

  const now = Date.now()
  const due = cards.filter(c => {
    const dueAt = latest.get(c.id)
    return dueAt === undefined || dueAt <= now
  }).length

  return {
    deckName: 'Chanki deck',
    due,
    total: cards.length,
  }
}

export function Home() {
  const [, setLocation] = useLocation()
  const [stats, setStats] = useState<DeckStats | null>(null)
  const [failed, setFailed] = useState(false)
  const [privacyOpen, setPrivacyOpen] = useState(false)

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
    <>
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
            {failed ? 'Could not load your deck from the cloud.' : dueCopy} Character, pinyin, meaning
            and tone — each card prompts all four before you grade it.
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

      <motion.section
        variants={container}
        initial="hidden"
        animate="show"
        className="pitch"
        aria-labelledby="pitch-title"
      >
        <motion.p variants={item} className="eyebrow">
          chinese + anki
        </motion.p>

        <motion.h2 variants={item} id="pitch-title" className="pitch-title">
          Anki asks two sides. Chanki asks four.
        </motion.h2>

        <motion.p variants={item} className="pitch-lede">
          Anki flips a card front to back — recognise the word, produce the meaning. Chanki turns
          every word into a cube with a character, pinyin, meaning and tone. Each review pulls all
          four out of your head before you are allowed to grade, so nothing rots behind the other
          three.
        </motion.p>

        <motion.ul variants={item} className="pitch-faces">
          {[
            ['字', 'Character', 'write it, don’t just recognise it'],
            ['音', 'Pinyin', 'say it, tone included'],
            ['义', 'Meaning', 'use it in a sentence'],
            ['调', 'Tone', 'the difference between mā and má'],
          ].map(([glyph, name, note]) => (
            <li key={name}>
              <span className="pitch-face__glyph" aria-hidden="true">
                {glyph}
              </span>
              <span className="pitch-face__name">{name}</span>
              <span className="pitch-face__note">{note}</span>
            </li>
          ))}
        </motion.ul>

        <motion.div variants={item}>
          <RetentionChart />
        </motion.div>

        <motion.p variants={item} className="pitch-note">
          Re-reading feels like learning because it feels familiar. It isn’t. Memory decays on a
          curve, and the curve does not care how many times you read a word — only how many times
          you dragged it back out of your head. Spaced repetition schedules those attempts just
          before the drop, which is the cheapest moment to learn and the one that actually moves
          the curve. A month of short reviews beats an afternoon of highlighting.
        </motion.p>

        <motion.div variants={item} className="pitch-privacy">
          <button
            type="button"
            className="btn-quiet"
            aria-expanded={privacyOpen}
            aria-controls="privacy-note"
            onClick={() => setPrivacyOpen(open => !open)}
          >
            <ShieldCheck size={15} aria-hidden="true" />
            {privacyOpen ? 'Hide privacy' : 'Privacy'}
          </button>

          {privacyOpen && (
            <div id="privacy-note" className="privacy-note">
              <p>
                Chanki is an independent project — one person trying to make learning Chinese more
                efficient than it needs to be otherwise. No accounts, no ads, no trackers.
              </p>
              <p>
                Your progress is stored against your device, recognised by a fingerprint built from
                browser and hardware signals. That is how your history survives a reinstall without
                you ever making an account.
              </p>
              <p>
                The trade-off: if the app cannot recognise a device you used before, that older
                progress cannot be reattached and may be lost.
              </p>
              <p>
                Questions, or a device that needs reattaching?{' '}
                <a href="mailto:chankiselang@gmail.com">chankiselang@gmail.com</a>
              </p>
            </div>
          )}
        </motion.div>
      </motion.section>
    </>
  )
}
