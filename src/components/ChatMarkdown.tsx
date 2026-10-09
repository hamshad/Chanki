/**
 * Assistant reply typography.
 *
 * The model writes markdown-ish text: ```chinese fences```, `### headings`,
 * `- bullets`, `**bold**`. This renders the lesson layout: hanzi as the hero
 * line, pinyin and meaning beneath it, word-by-word and tips as sections.
 *
 * Parsing is LINE-based, not blank-line-block-based: free models drop the
 * blank line before a heading more often than not, and a block parser then
 * swallows the whole reply into one paragraph. Anything unrecognised renders
 * as prose, so a differently formatted reply still reads fine.
 */
import type React from 'react'
import { ToneText } from './ui/ToneText'
import { toneFromMarked } from '../utils/pinyin'

/** Pinyin split into syllables, each colored by its tone — app convention. */
function TonedPinyin({ text }: { text: string }) {
  return (
    <>
      {text.split(/\s+/).map((syl, i) => (
        <span key={i}>
          {i > 0 && ' '}
          <ToneText text={syl} tone={toneFromMarked(syl)} />
        </span>
      ))}
    </>
  )
}

// ── inline: bold, code, italic ───────────────────────────────────────────────

function renderInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  // `code`, **bold**, *italic* — bold before italic so ** wins.
  const re = /`([^`\n]+)`|\*\*([^*\n]+)\*\*|\*([^*\n]+)\*/g
  let last = 0
  let key = 0
  for (;;) {
    const m = re.exec(text)
    if (!m) break
    if (m.index > last) nodes.push(text.slice(last, m.index))
    if (m[1] !== undefined) {
      nodes.push(
        <code key={key++} className="chat-md__code">
          {m[1]}
        </code>,
      )
    } else if (m[2] !== undefined) {
      nodes.push(
        <strong key={key++} className="chat-md__strong">
          {m[2]}
        </strong>,
      )
    } else {
      nodes.push(
        <em key={key++} className="chat-md__em">
          {m[3]}
        </em>,
      )
    }
    last = m.index + m[0].length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

// ── chinese block: hanzi / pinyin / meaning ─────────────────────────────────

const HANZI = '\\u4E00-\\u9FFF\\u3400-\\u4DBF'
const HAS_HANZI = new RegExp(`[${HANZI}]`)

/**
 * A fence body is hanzi lines, then a pinyin line, then the meaning. A model
 * that packs several sentences into one fence starts a new group at the next
 * hanzi line after the meaning — split on that boundary.
 */
function splitChineseSentences(body: string): string[] {
  const groups: string[][] = []
  let current: string[] = []
  let phase: 'hanzi' | 'pinyin' | 'meaning' = 'hanzi'

  for (const line of body.split('\n')) {
    if (!line.trim()) continue
    const isHanzi = HAS_HANZI.test(line)
    if (isHanzi && phase === 'meaning') {
      groups.push(current)
      current = []
      phase = 'hanzi'
    }
    if (isHanzi) {
      phase = 'hanzi'
      current.push(line)
    } else if (phase === 'hanzi') {
      phase = 'pinyin'
      current.push(line)
    } else {
      phase = 'meaning'
      current.push(line)
    }
  }
  if (current.length) groups.push(current)
  return groups.map((g) => g.join('\n'))
}

function ChineseFence({ body }: { body: string }) {
  const [hanzi = '', pinyin = '', ...rest] = body.split('\n')
  const meaning = rest.join(' ').trim()
  return (
    <div className="chat-hanzi">
      {hanzi.trim() && <p className="chat-hanzi__hanzi">{hanzi.trim()}</p>}
      {pinyin.trim() && (
        <p className="chat-hanzi__pinyin">
          <span className="chat-hanzi__label">Pinyin: </span>
          {/* Tone marks get the app's tone colors, syllable by syllable. */}
          <TonedPinyin text={pinyin.trim()} />
        </p>
      )}
      {meaning && (
        <p className="chat-hanzi__meaning">
          <span className="chat-hanzi__label">Meaning: </span>
          {renderInline(meaning)}
        </p>
      )}
    </div>
  )
}

// ── word-by-word bullet: 汉字 (pīnyīn) = meaning ────────────────────────────

const GLOSS_RE = /^([^\s(]+(?:\s+[^\s(]+)*?)\s*\(([^)]+)\)\s*=\s*(.+)$/

function GlossBullet({ text }: { text: string }) {
  const m = GLOSS_RE.exec(text.trim())
  if (!m) return <>{renderInline(text)}</>
  const [, hanzi, pinyin, meaning] = m
  return (
    <>
      <span className="chat-gloss__hanzi">{hanzi}</span>
      <span className="chat-gloss__pinyin"> (<TonedPinyin text={pinyin} />)</span>
      <span className="chat-gloss__eq"> = </span>
      <span className="chat-gloss__meaning">{renderInline(meaning)}</span>
    </>
  )
}

// ── line classification ─────────────────────────────────────────────────────

const FENCE_OPEN = /^```\s*chinese\s*$/i
const FENCE_CLOSE = /^```\s*$/
const BULLET = /^\s*[-*•]\s+(.*)$/
const HASH_HEADING = /^\s*#{1,6}\s+(.*)$/
/** A bare section label: short, ends with a colon, no sentence punctuation. */
const BARE_HEADING = /^[A-Z][\w' ]{2,44}:\s*$/
/** `Tip: …` / `Note: …` — the label is the heading, the rest rides with it. */
const LABEL_HEADING = /^\s*(Tip|Note|Remember|Heads up|Warning)\s*:\s*(.+)$/i

function isHeading(line: string): string | null {
  const hash = HASH_HEADING.exec(line)
  if (hash) return hash[1]
  if (BARE_HEADING.test(line.trim())) return line.trim().slice(0, -1)
  const labelled = LABEL_HEADING.exec(line)
  if (labelled) return `${labelled[1]}: ${labelled[2]}`
  return null
}

// ── block renderer ──────────────────────────────────────────────────────────

/**
 * Render one reply. Walks the text line by line: fences become hanzi blocks,
 * headings and bullets become sections, everything else is prose. Runs of
 * prose lines join into one paragraph with soft breaks preserved.
 */
export function ChatMarkdown({ text }: { text: string }) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const out: React.ReactNode[] = []
  let key = 0
  let prose: string[] = []

  const flushProse = () => {
    if (!prose.length) return
    const body = prose.join('\n')
    prose = []
    out.push(
      <p key={key++} className="chat-md__p">
        {renderInline(body)}
      </p>,
    )
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // ```chinese … ``` — one or several sentences.
    if (FENCE_OPEN.test(line)) {
      flushProse()
      const body: string[] = []
      i++
      while (i < lines.length && !FENCE_CLOSE.test(lines[i])) {
        body.push(lines[i])
        i++
      }
      // i now sits on the closing fence (or past the end) — the loop's i++
      // moves past it.
      out.push(
        <div key={key++} className="chat-hanzi-stack">
          {splitChineseSentences(body.join('\n')).map((s, si) => (
            <ChineseFence key={si} body={s} />
          ))}
        </div>,
      )
      continue
    }
    if (FENCE_CLOSE.test(line)) continue

    const heading = isHeading(line)
    if (heading) {
      flushProse()
      out.push(
        <h4 key={key++} className="chat-md__heading">
          {renderInline(heading)}
        </h4>,
      )
      continue
    }

    // Bullets: consume the whole run so lists stay lists.
    const bullet = BULLET.exec(line)
    if (bullet) {
      flushProse()
      const items = [bullet[1]]
      while (i + 1 < lines.length) {
        const next = BULLET.exec(lines[i + 1])
        if (!next) break
        items.push(next[1])
        i++
      }
      out.push(
        <ul key={key++} className="chat-md__list">
          {items.map((item, li) => (
            <li key={li} className="chat-md__item">
              <GlossBullet text={item} />
            </li>
          ))}
        </ul>,
      )
      continue
    }

    if (line.trim()) prose.push(line)
    // Blank lines just end a paragraph.
    else flushProse()
  }
  flushProse()

  return <>{out}</>
}