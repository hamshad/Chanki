// Tatoeba runtime API (https://api.tatoeba.org) — free, no key, CORS `*`.
// Used for live example sentences and (when the author licensed it) native audio.

import * as z from 'zod'
import { getJson } from './http'

const TATOEBA_API = 'https://api.tatoeba.org'

const TranslationSchema = z.object({
  id: z.number(),
  text: z.string(),
  lang: z.string(),
})

const SentenceSchema = z.object({
  id: z.number(),
  text: z.string(),
  script: z.string().nullable().optional(),
  translations: z.array(TranslationSchema).optional(),
  audios: z
    .array(
      z.object({
        id: z.number(),
        license: z.string().optional().nullable(),
        download_url: z.string().optional(),
      }),
    )
    .optional(),
})

const SentenceListSchema = z.object({
  data: z.array(SentenceSchema).optional(),
})

const AudioSchema = z.object({
  id: z.number(),
  license: z.string().nullable().optional(),
  download_url: z.string(),
  author: z.string().nullable().optional(),
  attribution_url: z.string().nullable().optional(),
  sentence: z.object({ id: z.number(), text: z.string() }),
})

const AudioListSchema = z.object({ data: z.array(AudioSchema).optional() })

export interface ExampleSentence {
  id: number
  zh: string
  en?: string
  script?: string | null
  audioUrl?: string
}

/** Search Mandarin example sentences (with English translations) for `word`. */
export async function searchExamples(word: string, limit = 5): Promise<ExampleSentence[]> {
  const url =
    `${TATOEBA_API}/v1/sentences?lang=cmn&q=${encodeURIComponent(word)}` +
    `&sort=relevance&trans:lang=eng&include=audios&limit=${limit}`
  const res = await getJson(url, SentenceListSchema)
  return (res?.data ?? [])
    .map((s) => {
      const audio = (s.audios ?? [])[0]
      const example: ExampleSentence = {
        id: s.id,
        zh: s.text,
        script: s.script ?? null,
      }
      const en = (s.translations ?? []).find((t) => t.lang === 'eng')
      if (en) example.en = en.text
      // Only surface recordings the author licensed for reuse (403 otherwise).
      if (audio?.license) example.audioUrl = `${TATOEBA_API}/v1/audios/${audio.id}/file`
      return example
    })
    .filter((e) => e.zh.includes(word))
}

/**
 * Find a native-speaker recording whose sentence text equals `word`.
 * Returns null when none exists or reuse is not licensed — callers fall back
 * to the Web Speech API.
 */
export async function findWordAudio(word: string): Promise<string | null> {
  const url = `${TATOEBA_API}/unstable/audios?lang=cmn&text=${encodeURIComponent(word)}&limit=100`
  const res = await getJson(url, AudioListSchema)
  const strip = (s: string) => s.replace(/[。，！？、…,.!?]+$/u, '')
  const match = (res?.data ?? []).find((a) => strip(a.sentence.text) === word)
  if (!match?.license) return null
  return match.download_url.startsWith('http')
    ? match.download_url
    : `${TATOEBA_API}${match.download_url}`
}
