// Minimal typed HTTP helper for runtime API calls (Tatoeba, CDNs).
// Every response is parsed with a Zod schema; failures are soft-failed.

import type { ZodType } from 'zod'

export class ApiError extends Error {
  readonly url: string
  readonly status: number

  constructor(url: string, status: number, message?: string) {
    super(message ?? `Request failed: ${status} for ${url}`)
    this.name = 'ApiError'
    this.url = url
    this.status = status
  }
}

export interface GetJsonOptions {
  timeoutMs?: number
  headers?: Record<string, string>
}

/**
 * Fetch JSON with timeout + Zod validation.
 * Returns `null` on 404, timeout or network failure (soft-fail for optional
 * enrichment); throws ApiError on non-OK HTTP status.
 */
export async function getJson<T>(
  url: string,
  schema: ZodType<T>,
  { timeoutMs = 8000, headers = {} }: GetJsonOptions = {},
): Promise<T | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { accept: 'application/json', ...headers },
    })
    if (res.status === 404) return null
    if (!res.ok) throw new ApiError(url, res.status)
    return schema.parse(await res.json())
  } catch (err) {
    if (err instanceof ApiError) throw err
    // AbortError (timeout), network failure and schema mismatch → soft-fail.
    console.warn(`[api] ${url} unavailable:`, err)
    return null
  } finally {
    clearTimeout(timer)
  }
}
