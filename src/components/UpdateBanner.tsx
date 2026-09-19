import { useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

/**
 * User-driven update prompt. Rendered when the waiting SW signals
 * needRefresh. "Update now" applies the fresh shell; "Dismiss" hides the
 * banner until the next needRefresh. Never force-reloads.
 */
export function UpdateBanner() {
  const { needRefresh, updateServiceWorker } = useRegisterSW()
  const [dismissed, setDismissed] = useState(false)

  if (!needRefresh || dismissed) return null

  return (
    <div
      role="alert"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        padding: '12px 16px',
        background: '#1a1a2e',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        zIndex: 1000,
      }}
    >
      <p style={{ margin: 0, flex: 1 }}>A new version is available</p>
      <button
        type="button"
        onClick={() => {
          void updateServiceWorker()
        }}
        style={{ padding: '8px 16px', fontWeight: 600 }}
      >
        Update now
      </button>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        style={{ padding: '8px 12px', background: 'transparent', color: '#fff' }}
      >
        Dismiss
      </button>
    </div>
  )
}
