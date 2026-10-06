/**
 * Google IME handwriting — the engine behind Gboard's Chinese pen input.
 *
 * Strokes go to `google.com/inputtools/request` (CORS allows direct
 * browser calls, no proxy); it returns ranked candidates for the WHOLE
 * drawing, multi-character included — it segments the phrase itself, the
 * way the Android/iOS keyboards do. Undocumented endpoint, so every
 * failure must degrade cleanly: callers fall back to the offline
 * template matcher instead of showing an error.
 */
import type { Stroke } from './handwriting'

const ENDPOINT =
  'https://www.google.com/inputtools/request?ime=handwriting&app=mobilesearch&cs=1&oe=UTF-8'

interface ImeResponse {
  0: string
  1?: [string, string[]][]
}

/** Ink in the IME wire format: per stroke `[xs, ys, ts]`. */
function toInk(strokes: Stroke[]): number[][][] {
  return strokes.map((stroke) => {
    const xs: number[] = []
    const ys: number[] = []
    const ts: number[] = []
    stroke.forEach((p, i) => {
      xs.push(Math.round(p.x))
      ys.push(Math.round(p.y))
      // Synthetic spacing is enough — the engine segments on shape, not time.
      ts.push(i * 30)
    })
    return [xs, ys, ts]
  })
}

export interface RecognizeOptions {
  width: number
  height: number
  signal?: AbortSignal
}

/**
 * Recognise the drawing. Returns candidates best-first; the top one is
 * what the keyboards would place in the text field. Throws on any
 * transport/shape failure — offline is a fallback path, not an error UI.
 */
export async function recognizeGoogleIme(
  strokes: Stroke[],
  options: RecognizeOptions,
): Promise<string[]> {
  if (!strokes.length) return []
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      device: navigator.userAgent,
      options: 'enable_pre_space',
      requests: [
        {
          writing_guide: {
            writing_area_width: options.width,
            writing_area_height: options.height,
          },
          ink: toInk(strokes),
          language: 'zh-CN',
        },
      ],
    }),
    signal: options.signal,
  })
  if (!res.ok) throw new Error(`handwriting request failed (${res.status})`)
  const data = (await res.json()) as ImeResponse
  if (data[0] !== 'SUCCESS' || !Array.isArray(data[1]?.[0]?.[1])) {
    throw new Error('handwriting request unsuccessful')
  }
  return data[1][0][1]
}
