import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

interface InfoSheetProps {
  title: string
  onClose: () => void
  children: ReactNode
}

/**
 * Bottom-sheet popup for extra card info (examples, measure words).
 * Portalled to document.body — the card animates with transforms, which
 * would otherwise trap `position: fixed` inside the card.
 */
export function InfoSheet({ title, onClose, children }: InfoSheetProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
    }
  }, [onClose])

  return createPortal(
    <div className="sheet-backdrop" onClick={onClose} role="presentation">
      <div
        className="info-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="info-sheet-head">
          <h3>{title}</h3>
          <button
            type="button"
            className="info-sheet-close"
            aria-label="Close"
            onClick={onClose}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="info-sheet-body">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
