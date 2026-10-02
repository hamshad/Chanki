/**
 * Device fingerprint — the app's user identity, DERIVED from stable device
 * signals instead of a random UUID that dies with local storage. Wipe
 * storage, reinstall, go incognito: the same hardware + browser recomputes
 * the same fingerprint, so the user is recognized with zero prompts.
 *
 * Signal rules (identity input only — see fingerprintInput):
 *   • STABLE across browser updates → userAgent EXCLUDED (version churn);
 *     it is still collected as metadata for the device doc.
 *   • STABLE across sessions → screen, DPR, GPU renderer, CPU concurrency,
 *     touch points, device memory, platform, locale, timezone.
 *
 * Collision note: two machines with identical hardware + locale + GPU
 * produce the same fingerprint. The signal set (GPU + screen + concurrency)
 * is chosen to make that unlikely; it is recognition, not authentication.
 */

export interface DeviceSignals {
  /** Metadata only — NOT part of the identity (churns on browser update). */
  userAgent: string
  platform: string
  language: string
  timeZone: string
  screenWidth: number
  screenHeight: number
  colorDepth: number
  pixelRatio: number
  hardwareConcurrency: number
  maxTouchPoints: number
  deviceMemory: number | null
  webglRenderer: string
}

function getWebglRenderer(): string {
  try {
    if (typeof document === 'undefined') return ''
    const canvas = document.createElement('canvas')
    const gl = (canvas.getContext('webgl') ??
      canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null
    if (!gl) return ''
    const dbg = gl.getExtension('WEBGL_debug_renderer_info')
    const renderer = dbg
      ? (gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) as string)
      : (gl.getParameter(gl.RENDERER) as string)
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return typeof renderer === 'string' ? renderer : ''
  } catch {
    return ''
  }
}

export function collectSignals(): DeviceSignals {
  const nav = typeof navigator !== 'undefined' ? navigator : undefined
  const scr = typeof screen !== 'undefined' ? screen : undefined
  let timeZone = 'UTC'
  try {
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    /* fall back to UTC */
  }
  const extended = nav as
    | (Navigator & { deviceMemory?: number; hardwareConcurrency?: number })
    | undefined
  return {
    userAgent: nav?.userAgent ?? '',
    platform: nav?.platform ?? '',
    language: nav?.language ?? '',
    timeZone,
    screenWidth: scr?.width ?? 0,
    screenHeight: scr?.height ?? 0,
    colorDepth: scr?.colorDepth ?? 0,
    pixelRatio: typeof window !== 'undefined' ? (window.devicePixelRatio ?? 1) : 1,
    hardwareConcurrency: extended?.hardwareConcurrency ?? 0,
    maxTouchPoints: nav?.maxTouchPoints ?? 0,
    deviceMemory: typeof extended?.deviceMemory === 'number' ? extended.deviceMemory : null,
    webglRenderer: getWebglRenderer(),
  }
}

/**
 * Stable serialization of IDENTITY signals — field order is part of the
 * contract. userAgent deliberately absent (browser updates change it).
 */
export function fingerprintInput(signals: DeviceSignals): string {
  return [
    signals.platform,
    signals.language,
    signals.timeZone,
    signals.screenWidth,
    signals.screenHeight,
    signals.colorDepth,
    signals.pixelRatio,
    signals.hardwareConcurrency,
    signals.maxTouchPoints,
    signals.deviceMemory ?? '',
    signals.webglRenderer,
  ].join('|')
}

function fnv1a32(input: string, seed: number): number {
  let h = seed >>> 0
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

/** 64-bit FNV-1a as two 32-bit lanes (16 hex chars) — fallback when
 *  SubtleCrypto is unavailable (insecure contexts, some test runners). */
export function fnv1aHex(input: string): string {
  const a = fnv1a32(input, 0x811c9dc5)
  const b = fnv1a32(`${input} chanki`, 0xdeadbeef)
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0')
}

/** SHA-256 hex of the signal string; FNV fallback. Never throws. */
export async function computeFingerprint(
  signals: DeviceSignals = collectSignals(),
): Promise<string> {
  const input = fingerprintInput(signals)
  const subtle = globalThis.crypto?.subtle
  if (subtle) {
    try {
      const digest = await subtle.digest('SHA-256', new TextEncoder().encode(input))
      return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
    } catch {
      /* fall through */
    }
  }
  return fnv1aHex(input)
}
