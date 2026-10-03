import { describe, it, expect } from 'vitest'
import {
  searchDict,
  normalizePinyin,
  pickExamples,
  containsHanzi,
  type DictEntry,
} from './search'

function index(): Record<string, DictEntry> {
  return {
    的: { p: 'de', m: ['of; possessive particle'], f: 1, l: 1, g: ['particle'] },
    是: { p: 'shì', m: ['to be; yes'], f: 3, l: 1 },
    你: { p: 'nǐ', m: ['you'], f: 2, l: 1 },
    好: { p: 'hǎo', m: ['good; fine'], f: 20, l: 1 },
    你好: { t: '你好', p: 'nǐ hǎo', m: ['hello; hi'], f: 16470 },
    您好: { p: 'nín hǎo', m: ['hello (polite)'], f: 30000 },
    爱: { t: '愛', p: 'ài', m: ['to love; to be fond of'], f: 130, l: 1 },
    学习: { t: '學習', p: 'xuéxí', m: ['to study; to learn'], f: 789, l: 1 },
    高兴: { p: 'gāoxìng', m: ['happy; glad'], f: 900, l: 1 },
    见: { p: 'jiàn', m: ['to see; to meet'], f: 100, l: 1 },
    很高兴认识你: { p: 'hěn gāoxìng rènshi nǐ', m: ['nice to meet you'], f: 40000 },
  }
}

describe('normalizePinyin', () => {
  it('strips tones, numbers and spaces', () => {
    expect(normalizePinyin('Nǐ Hǎo')).toBe('nihao')
    expect(normalizePinyin('ni3 hao3')).toBe('nihao')
    expect(normalizePinyin('xuéxí')).toBe('xuexi')
    expect(normalizePinyin('lüè')).toBe('lve')
  })
})

describe('containsHanzi', () => {
  it('detects CJK only', () => {
    expect(containsHanzi('你好')).toBe(true)
    expect(containsHanzi('nihao')).toBe(false)
  })
})

describe('searchDict', () => {
  it('ranks exact hanzi first regardless of object order', () => {
    const idx = { 您好: index()['您好'], 你好: index()['你好'], 好: index()['好'] }
    const hits = searchDict(idx, '你好')
    expect(hits[0].hanzi).toBe('你好')
    expect(hits[0].match).toBe('hanzi')
  })

  it('matches tone-marked and numeric pinyin queries', () => {
    const idx = index()
    expect(searchDict(idx, 'nǐ hǎo')[0].hanzi).toBe('你好')
    expect(searchDict(idx, 'ni3 hao3')[0].hanzi).toBe('你好')
    expect(searchDict(idx, 'xuéxí')[0].hanzi).toBe('学习')
  })

  it('finds words by English meaning without any non-Chinese result', () => {
    const hits = searchDict(index(), 'hello')
    expect(hits.some(h => h.hanzi === '你好')).toBe(true)
    expect(hits.every(h => /[一-鿿]/.test(h.hanzi))).toBe(true)
  })

  it('tiers: exact > pinyin > prefix > contains > meaning', () => {
    const idx = index()
    const hits = searchDict(idx, '好')
    // exact 好 first, then hanzi-prefix words, then embedded (你好/您好/很高兴…)
    expect(hits[0].hanzi).toBe('好')
    expect(hits[0].match).toBe('hanzi')
    const containsAt = hits.findIndex(h => h.match === 'contains')
    const prefixAt = hits.findIndex(h => h.match === 'prefix')
    if (containsAt >= 0 && prefixAt >= 0) expect(prefixAt).toBeLessThan(containsAt)
  })

  it('pinyin prefix covers multi-syllable queries', () => {
    const hits = searchDict(index(), 'gaox')
    expect(hits.map(h => h.hanzi)).toContain('高兴')
  })

  it('truncates AFTER ranking (exact hit survives a crowded prefix scan)', () => {
    const idx: Record<string, DictEntry> = {}
    // 30 pinyin-prefix words, exact target inserted LAST
    for (let i = 0; i < 30; i++) {
      idx[`测${i}`] = { p: `ceshi${i}`, m: [`filler ${i}`], f: 1000 + i }
    }
    idx['测试'] = { p: 'cèshì', m: ['test'], f: 500 }
    const hits = searchDict(idx, 'ceshi', 5)
    expect(hits[0].hanzi).toBe('测试')
    expect(hits).toHaveLength(5)
  })

  it('empty and non-matching queries return nothing', () => {
    expect(searchDict(index(), '  ')).toEqual([])
    expect(searchDict(index(), 'zzzz')).toEqual([])
  })

  it('ranks common (low freq) words ahead of rare ones within a tier', () => {
    const idx: Record<string, DictEntry> = {}
    for (let i = 0; i < 10; i++) {
      // letter suffix: digit suffixes would be eaten by tone stripping
      idx[`词${i}`] = { p: `ci${String.fromCharCode(97 + i)}`, m: [`sense ${i}`], f: 9000 - i * 100 }
    }
    const hits = searchDict(idx, 'ci', 3)
    expect(hits[0].hanzi).toBe('词9')
  })
})

describe('pickExamples', () => {
  const word = '你好'
  const candidates = [
    { zh: '你好。', en: 'Hello.', script: 'Hans' },
    { zh: '你好吗？', en: 'How are you?', script: 'Hans' },
    { zh: '用繁體字寫的你好句子非常非常長啊', en: 'trad', script: 'Hant' },
    { zh: '这句话里根本没有那个词', en: 'no word', script: 'Hans' },
    { zh: '这是一句非常非常非常长的中文例句完全超过三十个字的限制了吧', en: 'long', script: 'Hans' },
    { zh: '说你好，然后就走了', en: 'Said hello and left', script: 'Hans' },
  ]

  it('keeps only short, simplified sentences containing the word, shortest first', () => {
    const picked = pickExamples(word, candidates, 3)
    expect(picked.map(c => c.zh)).toEqual(['你好。', '你好吗？', '说你好，然后就走了'])
  })

  it('caps at max', () => {
    expect(pickExamples(word, candidates, 1)).toHaveLength(1)
  })
})
