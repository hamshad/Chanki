/**
 * Structured Chinese terms inside assistant replies.
 *
 * The prompt forces one exact shape — `汉字 (pīnyīn · meaning)` — and this
 * parser turns each occurrence into a styled chip (hanzi + toned pinyin +
 * meaning). Anything not matching the shape renders as plain text, so a
 * model that forgets the format degrades to today's bubbles, never a crash.
 */
export type ChatSegment =
  | { kind: 'text'; text: string }
  | { kind: 'term'; hanzi: string; pinyin: string; meaning: string }

// CJK block + extension A cover every modern hanzi the model will emit.
const HANZI = '\\u4E00-\\u9FFF\\u3400-\\u4DBF'
const TERM_RE = new RegExp(
  `([${HANZI}]+)\\s*\\(([^()\\n]*?)\\s*·\\s*([^()\\n]*?)\\)`,
  'g',
)

/** Pinyin always carries plain Latin letters — without them it is not a term. */
function looksLikePinyin(s: string): boolean {
  return /[a-z]/i.test(s)
}

export function parseChatText(text: string): ChatSegment[] {  const out: ChatSegment[] = []
  let last = 0
  TERM_RE.lastIndex = 0
  for (;;) {
    const m = TERM_RE.exec(text)
    if (!m) break
    const [full, hanzi, pinyin, meaning] = m
    const start = m.index
    if (start > last) out.push({ kind: 'text', text: text.slice(last, start) })
    if (looksLikePinyin(pinyin) && meaning.trim()) {
      out.push({ kind: 'term', hanzi, pinyin: pinyin.trim(), meaning: meaning.trim() })
    } else {
      // Shape without substance (e.g. an aside in parens) — keep verbatim.
      out.push({ kind: 'text', text: full })
    }
    last = start + full.length
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) })
  return out.length ? out : [{ kind: 'text', text }]
}

export type ChatBlock = { kind: 'text'; text: string } | { kind: 'chinese'; body: string }

const FENCE_RE = /```chinese[ \t]*\n([\s\S]*?)(?:```|$)/g

/**
 * Split a reply into prose runs and ```chinese example blocks. Only the
 * `chinese` tag becomes a card — other fences stay verbatim prose. An
 * unclosed trailing fence still renders (cut-off replies must not vanish).
 */
export function splitFences(text: string): ChatBlock[] {
  const out: ChatBlock[] = []
  let last = 0
  FENCE_RE.lastIndex = 0
  for (;;) {
    const m = FENCE_RE.exec(text)
    if (!m) break
    if (m.index > last) out.push({ kind: 'text', text: text.slice(last, m.index) })
    out.push({ kind: 'chinese', body: m[1].trim() })
    last = m.index + m[0].length
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) })
  return out.length ? out : [{ kind: 'text', text }]
}
