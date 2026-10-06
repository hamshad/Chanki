import { describe, it, expect } from 'vitest'
import { parseChatText, splitFences } from './chatFormat'

describe('chat term parser', () => {
  it('parses a single term into hanzi + pinyin + meaning', () => {
    expect(parseChatText('Try 谢谢 (xièxie · thank you) today')).toEqual([
      { kind: 'text', text: 'Try ' },
      { kind: 'term', hanzi: '谢谢', pinyin: 'xièxie', meaning: 'thank you' },
      { kind: 'text', text: ' today' },
    ])
  })

  it('parses several terms and multi-syllable pinyin', () => {
    const segs = parseChatText('我爱你 (wǒ ài nǐ · I love you) and 你好 (nǐ hǎo · hello)')
    expect(segs.filter((s) => s.kind === 'term')).toEqual([
      { kind: 'term', hanzi: '我爱你', pinyin: 'wǒ ài nǐ', meaning: 'I love you' },
      { kind: 'term', hanzi: '你好', pinyin: 'nǐ hǎo', meaning: 'hello' },
    ])
  })

  it('leaves plain text and non-term parens alone', () => {
    expect(parseChatText('just words')).toEqual([{ kind: 'text', text: 'just words' }])
    // No · separator → not a term.
    expect(parseChatText('你好 (hello)')).toEqual([{ kind: 'text', text: '你好 (hello)' }])
    // No hanzi → not a term.
    expect(parseChatText('say (ni hao · hello)')).toEqual([
      { kind: 'text', text: 'say (ni hao · hello)' },
    ])
  })

  it('keeps shape-without-substance verbatim instead of dropping it', () => {
    // Empty meaning: the match survives as plain text runs, nothing dropped.
    expect(parseChatText('中文 (zhōngwén · )!')).toEqual([
      { kind: 'text', text: '中文 (zhōngwén · )' },
      { kind: 'text', text: '!' },
    ])
  })
})

describe('chat fence splitter', () => {
  it('splits prose and chinese blocks', () => {
    expect(splitFences('Here:\n```chinese\n谢谢。\nxièxie.\nThank you.\n```\nDone')).toEqual([
      { kind: 'text', text: 'Here:\n' },
      { kind: 'chinese', body: '谢谢。\nxièxie.\nThank you.' },
      { kind: 'text', text: '\nDone' },
    ])
  })

  it('renders an unclosed trailing fence instead of dropping it', () => {
    expect(splitFences('Say:\n```chinese\n你好。\nnǐ hǎo.')).toEqual([
      { kind: 'text', text: 'Say:\n' },
      { kind: 'chinese', body: '你好。\nnǐ hǎo.' },
    ])
  })

  it('leaves other fences and plain text alone', () => {
    expect(splitFences('plain')).toEqual([{ kind: 'text', text: 'plain' }])
    expect(splitFences('```js\ncode\n```')).toEqual([{ kind: 'text', text: '```js\ncode\n```' }])
  })
})
