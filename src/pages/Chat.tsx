/**
 * Assistant — terse chat over OpenRouter (ling-3.0-flash-sante:free).
 *
 * Entry point is the sparkle button on the Dictionary; history persists
 * device-locally as one compact row (chatThread.ts). Owns the viewport
 * like review: no footer, no tab bar, composer pinned to the bottom.
 */
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link } from 'wouter'
import { ArrowLeft, PenLine, Send, Sparkles, Trash2, X } from 'lucide-react'
import { askChat, chatKey, fetchQuota, mergeQuota, type ChatQuota } from '../data/api/chat'
import {
  clearThread,
  loadThread,
  saveThread,
  type ChatMessage,
} from '../data/chatThread'
import { loadChatLang, saveChatLang, type ChatLang } from '../utils/chatLang'
import { ChatMarkdown } from '../components/ChatMarkdown'
import { DrawPad, type PadSize } from '../components/DrawPad'
import { LifeLoader } from '../components/LifeLoader'
import {
  loadHandwriting,
  recognizeHandwriting,
  type HandwritingIndex,
  type Stroke,
} from '../data/api/handwriting'
import { recognizeGoogleIme } from '../data/api/googleIme'

const MAX_INPUT = 4000

export function Chat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Static per build — compute during render, not in an effect.
  const [keyMissing] = useState(() => chatKey() === '')
  // Answer language persists device-locally; English default.
  const [lang, setLang] = useState<ChatLang>(loadChatLang)
  // Quota is decoration: unknown → hidden, never an error.
  const [quota, setQuota] = useState<ChatQuota | null>(null)
  const quotaDay = useRef('')
  // Draw pad — same stack as the dictionary, but tap-to-insert only: no
  // auto-commit, the ink stays until a candidate is tapped or the pad closes.
  const [drawOpen, setDrawOpen] = useState(false)
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [candidates, setCandidates] = useState<string[]>([])
  const [handwriting, setHandwriting] = useState<HandwritingIndex | null>(null)
  const [recognizing, setRecognizing] = useState(false)
  const drawAbort = useRef<AbortController | null>(null)

  const endRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  const applyQuota = (server: ChatQuota | null) => {
    if (!server) return
    const today = new Date().toISOString().slice(0, 10)
    setQuota((prev) => {
      const merged = mergeQuota(prev, quotaDay.current, server, today)
      quotaDay.current = merged.day
      return merged.quota
    })
  }

  useEffect(() => {
    void loadThread().then(setMessages)
    // Key is static per build — one check on mount is enough.
    if (chatKey() !== '') void fetchQuota().then(applyQuota)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Offline index for when Google IME is unreachable — lazy like the dictionary.
  useEffect(() => {
    if (!drawOpen || handwriting) return
    loadHandwriting().then(setHandwriting).catch(() => setHandwriting(null))
  }, [drawOpen, handwriting])

  const runDrawRecognition = async (ink: Stroke[], size: PadSize) => {
    // A newer stroke supersedes the in-flight request.
    drawAbort.current?.abort()
    if (!ink.length) {
      setCandidates([])
      return
    }
    const ac = new AbortController()
    drawAbort.current = ac
    setRecognizing(true)
    try {
      const hits = await recognizeGoogleIme(ink, { ...size, signal: ac.signal })
      if (ac.signal.aborted) return
      setCandidates(hits)
    } catch (err) {
      if (ac.signal.aborted || (err instanceof DOMException && err.name === 'AbortError'))
        return
      setCandidates(
        handwriting ? recognizeHandwriting(ink, handwriting, 8).map((h) => h.char) : [],
      )
    } finally {
      // Only the newest request owns the flag.
      if (drawAbort.current === ac) setRecognizing(false)
    }
  }

  const handleDrawChange = (next: Stroke[], size: PadSize) => {
    setStrokes(next)
    void runDrawRecognition(next, size)
  }

  const clearInk = () => {
    drawAbort.current?.abort()
    setStrokes([])
    setCandidates([])
  }

  const closeDraw = () => {
    clearInk()
    setDrawOpen(false)
  }

  const insertDrawn = (chars: string) => {
    clearInk()
    setInput((prev) => prev + chars)
    inputRef.current?.focus()
  }

  // Keep the latest turn and the composer in view.
  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end' })
  }, [messages, pending])

  // Auto-grow the field for pasted passages, capped so it never eats the thread.
  useEffect(() => {
    const ta = inputRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`
  }, [input])

  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const composerRef = useRef<HTMLFormElement | null>(null)

  /** Shared landing for a fresh reply: persist, count quota, reconcile. */
  const afterReply = async (withReply: ChatMessage[]) => {
    setMessages(withReply)
    await saveThread(withReply)
    // Count the send instantly — the server counter lags, so the fresh
    // fetch below must not overwrite this (mergeQuota keeps the lower value).
    setQuota((prev) =>
      prev && { ...prev, used: prev.used + 1, remaining: Math.max(0, prev.remaining - 1) },
    )
    void fetchQuota().then(applyQuota)
  }

  const send = async (formEvent: FormEvent) => {
    formEvent.preventDefault()
    const text = input.trim()
    if (!text || pending) return
    if ((quota?.remaining ?? 1) <= 0) {
      setError('Daily free limit reached — back at midnight UTC')
      return
    }
    setError(null)
    setInput('')
    // Editing an earlier question cuts the thread there — everything after
    // it (including its old reply) is replaced by the resend.
    const base = editingIndex !== null ? messages.slice(0, editingIndex) : messages
    setEditingIndex(null)
    const next: ChatMessage[] = [...base, { role: 'user', text }]
    setMessages(next)
    await saveThread(next)
    setPending(true)
    try {
      const reply = await askChat(next, { lang })
      await afterReply([...next, { role: 'assistant', text: reply }])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chat failed')
    } finally {
      setPending(false)
    }
  }

  /** The reply failed — resend the same question, no duplicate. */
  const retry = async () => {
    if (pending || messages.length === 0) return
    const last = messages[messages.length - 1]
    if (last.role !== 'user') return
    setError(null)
    setPending(true)
    try {
      const reply = await askChat(messages, { lang })
      await afterReply([...messages, { role: 'assistant', text: reply }])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chat failed')
    } finally {
      setPending(false)
    }
  }

  const cancelEdit = () => {
    setEditingIndex(null)
    setInput('')
  }

  const startEdit = (index: number) => {
    const msg = messages[index]
    if (!msg || msg.role !== 'user' || pending) return
    setEditingIndex(index)
    setInput(msg.text)
    inputRef.current?.focus()
    composerRef.current?.scrollIntoView?.({ block: 'end' })
  }

  const clear = () => {
    if (pending) return
    setMessages([])
    setError(null)
    setEditingIndex(null)
    setInput('')
    void clearThread()
  }

  // A question plus its reply travel together — one unit to delete.
  const pairs = useMemo(() => {
    const out: { start: number; items: ChatMessage[] }[] = []
    messages.forEach((m, idx) => {
      if (m.role === 'user' || out.length === 0) out.push({ start: idx, items: [m] })
      else out[out.length - 1].items.push(m)
    })
    return out
  }, [messages])

  const deletePair = (start: number, count: number) => {
    if (pending) return
    const next = [...messages.slice(0, start), ...messages.slice(start + count)]
    setMessages(next)
    void saveThread(next)
  }

  const switchLang = (next: ChatLang) => {
    if (next === lang) return
    saveChatLang(next)
    setLang(next)
  }

  return (
    <div className="admin-shell chat-page">
      <div className="chat-head">
        <Link href="/dict" className="icon-btn" aria-label="Back to the dictionary">
          <ArrowLeft size={18} aria-hidden="true" />
        </Link>
        <div className="chat-head__title">
          <p className="eyebrow">assistant</p>
          <h2 className="display text-3xl">Ask</h2>
          {quota && (
            <p className="faint text-sm chat-quota">
              {quota.remaining > 0
                ? `${quota.remaining} of ${quota.limit} free left today`
                : 'daily free limit reached · back at midnight UTC'}
            </p>
          )}
        </div>
        <button
          type="button"
          className="icon-btn"
          aria-label="Clear the conversation"
          onClick={clear}
          disabled={pending || messages.length === 0}
        >
          <Trash2 size={18} aria-hidden="true" />
        </button>
      </div>

      <div className="chat-lang" role="group" aria-label="Answer language">
        <button
          type="button"
          aria-label="English"
          title="English"
          aria-pressed={lang === 'en'}
          onClick={() => switchLang('en')}
        >
          EN
        </button>
        <span className="chat-lang__sep" aria-hidden="true">
          /
        </span>
        <button
          type="button"
          aria-label="Roman Hindi"
          title="Roman Hindi"
          aria-pressed={lang === 'hi-Latn'}
          onClick={() => switchLang('hi-Latn')}
        >
          HI
        </button>
      </div>

      <div className="chat-msgs">
        {messages.length === 0 && !pending && !error && (
          <div className="state-block">
            <Sparkles size={22} aria-hidden="true" />
            <p className="faint">
              Hear something you don&rsquo;t get? Paste or type it here —
              Chinese words and China culture, short answers, no small talk.
            </p>
          </div>
        )}

        {pairs.map((pair) => (
          <div key={pair.start} className="chat-pair">
            {pair.items.map((m, j) => (
              <div
                key={j}
                className={`chat-msg chat-msg--${m.role === 'user' ? 'user' : 'ai'}`}
              >
                <ChatMarkdown text={m.text} />
              </div>
            ))}
            <div className="chat-pair__actions">
              {pair.items[0]?.role === 'user' && (
                <button
                  type="button"
                  className="chat-pair__action"
                  aria-label="Edit and resend this question"
                  disabled={pending}
                  onClick={() => startEdit(pair.start)}
                >
                  <PenLine size={12} aria-hidden="true" />
                </button>
              )}
              <button
                type="button"
                className="chat-pair__action"
                aria-label="Delete this exchange"
                disabled={pending}
                onClick={() => deletePair(pair.start, pair.items.length)}
              >
                <X size={12} aria-hidden="true" />
              </button>
            </div>
          </div>
        ))}

        {pending && (
          <div className="chat-pending" role="status">
            <LifeLoader
              className="chat-life"
              label="Waiting for reply"
              intervalMs={160}
            />
          </div>
        )}

        {error && (
          <div className="chat-error" role="alert">
            <span>{error}</span>
            <button
              type="button"
              className="btn-quiet chat-error__retry"
              onClick={retry}
              disabled={pending}
            >
              Retry
            </button>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {keyMissing && (
        <p className="faint text-sm chat-keyhint" role="alert">
          Assistant key missing — add OPENROUTER_KEY to .env and rebuild.
        </p>
      )}

      {drawOpen && (
        <div className="chat-draw glass-panel">
          <div className="chat-draw__head">
            <span className="faint text-sm" aria-hidden="true">
              {recognizing ? 'Reading…' : 'Draw — tap a character to insert it'}
            </span>
            <button
              type="button"
              className="icon-btn chat-draw__close"
              aria-label="Close the drawing pad"
              onClick={closeDraw}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
          {strokes.length > 0 && candidates.length > 0 && (
            <div className="dict-suggest" aria-label="Recognized characters">
              {candidates.map((chars) => (
                <button
                  key={chars}
                  type="button"
                  className="dict-suggest__chip"
                  aria-label={`Use ${chars}`}
                  onClick={() => insertDrawn(chars)}
                >
                  <span className="dict-suggest__char">{chars}</span>
                </button>
              ))}
            </div>
          )}
          <DrawPad
            strokes={strokes}
            onChange={handleDrawChange}
            onCleanSlate={clearInk}
            fadeAfterMs={null}
          />
        </div>
      )}

      {editingIndex !== null && (
        <div className="chat-editing">
          <span className="faint text-sm">
            Editing an earlier question — resending replaces everything after it
          </span>
          <button
            type="button"
            className="icon-btn chat-draw__close"
            aria-label="Cancel editing"
            onClick={cancelEdit}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      )}

      <form ref={composerRef} className="chat-composer" onSubmit={send}>
        <button
          type="button"
          className="icon-btn"
          aria-label="Draw a character instead of typing"
          aria-pressed={drawOpen}
          onClick={() => (drawOpen ? closeDraw() : setDrawOpen(true))}
        >
          <PenLine size={18} aria-hidden="true" />
        </button>
        <textarea
          ref={inputRef}
          className="chat-input"
          rows={1}
          value={input}
          maxLength={MAX_INPUT}
          placeholder={
            keyMissing
              ? 'Set OPENROUTER_KEY to use the assistant'
              : quota && quota.remaining <= 0
                ? 'Daily free limit reached — back at midnight UTC'
                : 'Ask anything…'
          }
          aria-label="Message the assistant"
          disabled={keyMissing}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends, Shift+Enter breaks the line, Esc exits editing.
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send(e)
            } else if (e.key === 'Escape' && editingIndex !== null) {
              e.preventDefault()
              cancelEdit()
            }
          }}
        />
        <button
          type="submit"
          className="icon-btn chat-send"
          aria-label="Send message"
          disabled={keyMissing || pending || !input.trim() || (quota?.remaining ?? 1) <= 0}
        >
          <Send size={18} aria-hidden="true" />
        </button>
      </form>
    </div>
  )
}
