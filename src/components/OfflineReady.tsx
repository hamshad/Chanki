import { useEffect, useState } from 'react'

/**
 * Dismissable "ready to work offline" toast. Shown once the SW reports
 * offline-ready via the `pwa:offline-ready` event from src/pwa/register.ts.
 */
export function OfflineReady() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const show = () => setVisible(true)
    window.addEventListener('pwa:offline-ready', show)
    return () => window.removeEventListener('pwa:offline-ready', show)
  }, [])

  if (!visible) return null

  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        bottom: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        padding: '10px 16px',
        background: '#2d6a4f',
        color: '#fff',
        borderRadius: 8,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        zIndex: 1000,
      }}
    >
      <span>Ready to work offline</span>
      <button
        type="button"
        onClick={() => setVisible(false)}
        style={{ padding: '6px 12px', fontWeight: 600 }}
      >
        OK
      </button>
    </div>
  )
}
