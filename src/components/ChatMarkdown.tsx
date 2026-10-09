/**
 * Assistant reply typography.
 *
 * The model writes plain markdown — `### headings`, ```chinese fences```,
 * `- bullets`, `**bold**`. This turns that into the lesson layout: hanzi as
 * the hero line, pinyin and meaning beneath it, word-by-word and tips as
 * clean sections. Anything unrecognised falls through as prose, so a reply
 * the model formats differently still renders — just less nicely.
 */

// ── inline: bold, code, italic ───────────────────────────────────────────────

import type React from 'react'
import { ToneText } from './ui/ToneText'
import { toneFromMarked } from '../utils/pinyin'

// ── inline: bold, code, italic ───────────────────────────────────────────────

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

// `code`, **bold**, *italic* — bold before italic so ** wins.
function renderInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
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

const HANZI_LINE = /[\u4E00-\u9FFF\u3400-\u4DBF]/

/**
 * A fence body is hanzi lines, then a pinyin line, then the meaning. A model
 * that packs several sentences into one fence starts a new group at the next
 * hanzi line after the meaning — split on that boundary.
 */
function splitChineseSentences(body: string): string[] {
  const lines = body.split('\n')
  const groups: string[][] = []
  let current: string[] = []
  let phase: 'hanzi' | 'pinyin' | 'meaning' = 'hanzi'

  for (const line of lines) {
    if (!line.trim()) continue
    const isHanzi = HANZI_LINE.test(line)
    // A hanzi line arriving after the meaning started a new sentence.
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

// ── block renderer ──────────────────────────────────────────────────────────

/**
 * Render one reply. Blocks are split on blank lines; inside each block the
 * fence, heading, bullet and paragraph forms are handled in priority order.
 */
export function ChatMarkdown({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/)
  return (
    <>
      {blocks.map((block, bi) => {
        const raw = block.trim()
        if (!raw) return null

        // ```chinese … ``` — hanzi / pinyin / meaning lines, possibly several
        // sentences in one fence.
        const fence = /^```chinese[ \t]*\n([\s\S]*?)(?:```|$)/.exec(raw)
        if (fence) {
          const sentences = splitChineseSentences(fence[1])
          return (
            <div key={bi} className="chat-hanzi-stack">
              {sentences.map((s, si) => (
                <ChineseFence key={si} body={s} />
              ))}
            </div>
          )
        }

        // Heading: ### Word by word:  (or ##, or a bare `Heading:` line)
        const heading = /^#{1,6}\s+(.*)$/.exec(raw)
        if (heading) {
          return (
            <h4 key={bi} className="chat-md__heading">
              {renderInline(heading[1])}
            </h4>
          )
        }

        // Bullets (one or more consecutive `-` lines).
        const lines = raw.split('\n')
        if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
          return (
            <ul key={bi} className="chat-md__list">
              {lines.map((line, li) => (
                <li key={li} className="chat-md__item">
                  <GlossBullet text={line.replace(/^\s*[-*]\s+/, '')} />
                </li>
              ))}
            </ul>
          )
        }

        // Plain paragraph — render inline markup.
        return (
          <p key={bi} className="chat-md__p">
            {lines.map((line, li) => (
              <span key={li}>
                {li > 0 && <br />}
                {renderInline(line)}
              </span>
            ))}
          </p>
        )
      })}
    </>
  )
}