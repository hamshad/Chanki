import { describe, it, expect } from 'vitest'
import { CardSchema, DeckSchema, ProgressSchema, ReviewLogSchema, AudioMetaSchema, ToneEnum, TONES } from './schema'

const DECK_ID = '00000000-0000-0000-0000-000000000001'
const CARD_ID = '00000000-0000-0000-0000-000000000002'
const NOW = 1726700000000

const validCard = {
  id: CARD_ID,
  deckId: DECK_ID,
  hanzi: '你',
  pinyin: 'nǐ',
  meaning: 'you',
  tone: '3' as const,
  tags: ['hsk1'],
  hskLevel: 1,
  audioUrl: '/assets/deck/audio/ni3.mp3',
  example: '你好吗？',
  traditional: '你',
  schemaVersion: 1 as const,
  createdAt: NOW,
  updatedAt: NOW,
}

describe('ToneEnum', () => {
  it('accepts valid tones 1-5', () => {
    for (const t of TONES) {
      expect(() => ToneEnum.parse(t)).not.toThrow()
    }
  })

  it('rejects tone "0"', () => {
    expect(() => ToneEnum.parse('0')).toThrow()
  })

  it('rejects tone "6"', () => {
    expect(() => ToneEnum.parse('6')).toThrow()
  })

  it('rejects numeric tone 3 (must be string)', () => {
    expect(() => ToneEnum.parse(3)).toThrow()
  })

  it('rejects "foo"', () => {
    expect(() => ToneEnum.parse('foo')).toThrow()
  })
})

describe('CardSchema', () => {
  it('accepts a fully valid card', () => {
    const card = CardSchema.parse(validCard)
    expect(card.hanzi).toBe('你')
    expect(card.tone).toBe('3')
    expect(card.schemaVersion).toBe(1)
  })

  it('accepts card without optional fields', () => {
    const { audioUrl, example, traditional, hskLevel, ...minimal } = validCard
    expect(() => CardSchema.parse(minimal)).not.toThrow()
  })

  it('defaults tags to [] when omitted', () => {
    const { tags, ...noTags } = validCard
    const card = CardSchema.parse(noTags)
    expect(card.tags).toEqual([])
  })

  it('rejects missing hanzi', () => {
    const { hanzi, ...rest } = validCard
    expect(() => CardSchema.parse(rest)).toThrow()
  })

  it('rejects empty hanzi', () => {
    expect(() => CardSchema.parse({ ...validCard, hanzi: '' })).toThrow()
  })

  it('rejects missing pinyin', () => {
    const { pinyin, ...rest } = validCard
    expect(() => CardSchema.parse(rest)).toThrow()
  })

  it('rejects missing meaning', () => {
    const { meaning, ...rest } = validCard
    expect(() => CardSchema.parse(rest)).toThrow()
  })

  it('rejects invalid tone "6"', () => {
    expect(() => CardSchema.parse({ ...validCard, tone: '6' })).toThrow()
  })

  it('rejects invalid tone "0"', () => {
    expect(() => CardSchema.parse({ ...validCard, tone: '0' })).toThrow()
  })

  it('rejects invalid schemaVersion (must be literal 1)', () => {
    expect(() => CardSchema.parse({ ...validCard, schemaVersion: 2 })).toThrow()
  })

  it('rejects unknown fields (strict mode)', () => {
    expect(() => CardSchema.parse({ ...validCard, extraField: 'oops' })).toThrow()
  })

  it('rejects non-UUID id', () => {
    expect(() => CardSchema.parse({ ...validCard, id: 'not-a-uuid' })).toThrow()
  })
})

describe('CardSchema — sourced metadata (ETL)', () => {
  const fullCard = {
    ...validCard,
    frequency: 130,
    chars: [
      {
        char: '你',
        radical: '亻',
        strokes: 7,
        decomposition: '⿰亻尔',
        etymology: {
          type: 'pictophonetic' as const,
          phonetic: '尔',
          semantic: '亻',
          hint: 'person',
        },
      },
    ],
    examples: [
      { zh: '你好。', en: 'Hello.', sourceId: 12345 },
      { zh: '你好吗？', audioUrl: '/assets/deck/audio/ex-99.mp3' },
    ],
  }

  it('accepts card with frequency, char metadata and examples', () => {
    const card = CardSchema.parse(fullCard)
    expect(card.frequency).toBe(130)
    expect(card.chars?.[0].strokes).toBe(7)
    expect(card.examples?.[0].en).toBe('Hello.')
  })

  it('accepts etymology without phonetic/semantic (ideographic)', () => {
    const card = {
      ...fullCard,
      chars: [{ char: '上', radical: '一', etymology: { type: 'ideographic' as const, hint: 'One stroke above another' } }],
    }
    expect(() => CardSchema.parse(card)).not.toThrow()
  })

  it('accepts null phonetic/semantic from source data', () => {
    const card = {
      ...fullCard,
      chars: [{ char: '你', etymology: { type: 'pictophonetic' as const, phonetic: null, semantic: null } }],
    }
    expect(() => CardSchema.parse(card)).not.toThrow()
  })

  it('rejects unknown etymology type', () => {
    const card = {
      ...fullCard,
      chars: [{ char: '你', etymology: { type: 'mystery' } }],
    }
    expect(() => CardSchema.parse(card)).toThrow()
  })

  it('rejects unknown keys inside char metadata (strict)', () => {
    const card = { ...fullCard, chars: [{ char: '你', fortune: 'lucky' }] }
    expect(() => CardSchema.parse(card)).toThrow()
  })

  it('rejects example without zh', () => {
    const card = { ...fullCard, examples: [{ en: 'no chinese' }] }
    expect(() => CardSchema.parse(card)).toThrow()
  })

  it('rejects negative frequency', () => {
    expect(() => CardSchema.parse({ ...fullCard, frequency: -1 })).toThrow()
  })
})

describe('DeckSchema', () => {
  const validDeck = {
    id: DECK_ID,
    name: 'HSK 1 Starter',
    slug: 'hsk1-starter',
    schemaVersion: 1 as const,
    createdAt: NOW,
    updatedAt: NOW,
  }

  it('accepts valid deck', () => {
    expect(() => DeckSchema.parse(validDeck)).not.toThrow()
  })

  it('rejects missing name', () => {
    const { name, ...rest } = validDeck
    expect(() => DeckSchema.parse(rest)).toThrow()
  })
})

describe('ProgressSchema', () => {
  it('accepts valid progress', () => {
    const p = {
      id: CARD_ID,
      cardId: CARD_ID,
      deviceId: DECK_ID,
      stability: 1.5,
      difficulty: 5.0,
      due: NOW,
      reps: 0,
      lapses: 0,
      syncStatus: 'pending' as const,
      updatedAt: NOW,
    }
    expect(() => ProgressSchema.parse(p)).not.toThrow()
  })
})

describe('ReviewLogSchema', () => {
  it('accepts valid review log', () => {
    const r = {
      id: CARD_ID,
      cardId: CARD_ID,
      deviceId: DECK_ID,
      rating: 'good' as const,
      scheduledDays: 1,
      elapsedDays: 0,
      timestamp: NOW,
    }
    expect(() => ReviewLogSchema.parse(r)).not.toThrow()
  })

  it('rejects invalid rating', () => {
    const r = {
      id: CARD_ID,
      cardId: CARD_ID,
      deviceId: DECK_ID,
      rating: 'perfect',
      scheduledDays: 1,
      elapsedDays: 0,
      timestamp: NOW,
    }
    expect(() => ReviewLogSchema.parse(r)).toThrow()
  })
})

describe('AudioMetaSchema', () => {
  it('accepts valid audio meta', () => {
    const a = {
      url: '/assets/deck/audio/ni3.mp3',
      size: 12345,
      cachedAt: NOW,
      expiresAt: NOW + 86400000,
    }
    expect(() => AudioMetaSchema.parse(a)).not.toThrow()
  })
})
