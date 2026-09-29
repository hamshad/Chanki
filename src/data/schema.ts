import * as z from 'zod'

// ─── Tone + Rating enums ──────────────────────────────────────────────────────

export const TONES = ['1', '2', '3', '4', '5'] as const
export const ToneEnum = z.enum(TONES)
export type Tone = z.infer<typeof ToneEnum>

export const RATINGS = ['again', 'hard', 'good', 'easy'] as const
export const RatingEnum = z.enum(RATINGS)
export type Rating = z.infer<typeof RatingEnum>

// ─── Card ─────────────────────────────────────────────────────────────────────

export const CardSchema = z
  .object({
    id: z.string().uuid(),
    deckId: z.string().uuid(),
    hanzi: z.string().min(1, 'Hanzi required'),
    pinyin: z.string().min(1, 'Pinyin required'),
    meaning: z.string().min(1, 'Meaning required'),
    tone: ToneEnum,
    tags: z.array(z.string()).default([]),
    hskLevel: z.number().int().min(1).max(9).optional(),
    audioUrl: z.string().optional(), // relative path e.g. /assets/deck/audio/ni3.mp3
    example: z.string().optional(),
    traditional: z.string().optional(),
    schemaVersion: z.literal(1),
    createdAt: z.number().int().positive(),
    updatedAt: z.number().int().positive(),
  })
  .strict()

export type Card = z.infer<typeof CardSchema>
export type CardInput = z.input<typeof CardSchema>

export function validateCard(input: unknown): Card {
  return CardSchema.parse(input)
}

// ─── Deck ─────────────────────────────────────────────────────────────────────

export const DeckSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(1),
    slug: z.string().min(1),
    schemaVersion: z.literal(1),
    createdAt: z.number().int().positive(),
    updatedAt: z.number().int().positive(),
  })
  .strict()

export type Deck = z.infer<typeof DeckSchema>

// ─── Progress ─────────────────────────────────────────────────────────────────

export const ProgressSchema = z
  .object({
    id: z.string().uuid(),
    cardId: z.string().uuid(),
    deviceId: z.string().uuid(),
    stability: z.number().nonnegative(),
    difficulty: z.number().min(0).max(10),
    due: z.number().int(), // Unix ms timestamp
    reps: z.number().int().nonnegative(),
    lapses: z.number().int().nonnegative(),
    state: z.number().int().optional(),
    learning_steps: z.array(z.number()).optional(),
    sideHistory: z.record(z.string(), z.enum(['pass', 'fail'])).optional(),
    syncStatus: z.enum(['pending', 'synced']).default('pending'),
    updatedAt: z.number().int().positive(),
  })
  .strict()

export type Progress = z.infer<typeof ProgressSchema>

// ─── ReviewLog ────────────────────────────────────────────────────────────────

export const ReviewLogSchema = z
  .object({
    id: z.string().uuid(),
    cardId: z.string().uuid(),
    deviceId: z.string().uuid(),
    rating: RatingEnum,
    scheduledDays: z.number().nonnegative(),
    elapsedDays: z.number().nonnegative(),
    timestamp: z.number().int().positive(),
  })
  .strict()

export type ReviewLog = z.infer<typeof ReviewLogSchema>

// ─── AudioMeta ────────────────────────────────────────────────────────────────

export const AudioMetaSchema = z
  .object({
    url: z.string().min(1), // PK — relative audio path
    size: z.number().int().nonnegative(),
    cachedAt: z.number().int().positive(),
    expiresAt: z.number().int().positive(),
  })
  .strict()

export type AudioMeta = z.infer<typeof AudioMetaSchema>

// ─── DeviceMeta ───────────────────────────────────────────────────────────────

export const DeviceMetaSchema = z.object({
  key: z.string().min(1),
  value: z.unknown(),
})

export type DeviceMeta = z.infer<typeof DeviceMetaSchema>
