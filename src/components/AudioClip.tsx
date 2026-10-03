import { useEffect, useMemo, useRef, useState } from 'react'
import { Pause, Play } from 'lucide-react'
import { startAudio, type AudioPlayback } from '../utils/audio'

interface AudioClipProps {
  /** Text to speak (TTS fallback and accessibility label). */
  text: string
  /** Optional pre-recorded clip; falls back to TTS when missing or failing. */
  url?: string
  size?: 'sm' | 'md'
  label?: string
}

const BAR_COUNT = 13

/** Deterministic per-text waveform so a card's clip keeps its shape. */
function waveBars(text: string): number[] {
  let seed = 2166136261
  for (let i = 0; i < text.length; i++) {
    seed = ((seed ^ text.charCodeAt(i)) * 16777619) >>> 0
  }
  return Array.from({ length: BAR_COUNT }, () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return 0.3 + ((seed % 1000) / 1000) * 0.7
  })
}

/**
 * WhatsApp/Instagram-style voice clip: circular play button + waveform.
 * Bars sit still when idle and bounce while audio plays; tapping again stops.
 */
export function AudioClip({ text, url, size = 'md', label }: AudioClipProps) {
  const [playing, setPlaying] = useState(false)
  const playbackRef = useRef<AudioPlayback | null>(null)

  const bars = useMemo(() => waveBars(text), [text])

  const stop = () => {
    playbackRef.current?.stop()
    playbackRef.current = null
    setPlaying(false)
  }

  // Leaving the card (or swapping text) must not keep speaking.
  useEffect(() => stop, [text, url]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (playing) {
      stop()
      return
    }
    const playback = startAudio(url, text)
    playbackRef.current = playback
    setPlaying(true)
    playback.done.then(() => {
      if (playbackRef.current === playback) {
        playbackRef.current = null
        setPlaying(false)
      }
    })
  }

  const playingLabel = label ? `Stop ${label}` : 'Stop audio'
  const idleLabel = label ? `Play ${label}` : 'Play audio'

  return (
    <button
      type="button"
      className={`audio-clip audio-clip--${size}${playing ? ' is-playing' : ''}`}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={toggle}
      aria-label={playing ? playingLabel : idleLabel}
      aria-pressed={playing}
    >
      <span className="audio-clip__btn" aria-hidden="true">
        {playing ? (
          <Pause size={size === 'sm' ? 14 : 18} fill="currentColor" strokeWidth={1.5} />
        ) : (
          <Play size={size === 'sm' ? 14 : 18} fill="currentColor" strokeWidth={1.5} />
        )}
      </span>
      <span className="audio-clip__wave" aria-hidden="true">
        {bars.map((height, i) => (
          <span
            key={i}
            className="audio-clip__bar"
            style={{ height: `${Math.round(height * 100)}%`, animationDelay: `${i * 65}ms` }}
          />
        ))}
      </span>
    </button>
  )
}
