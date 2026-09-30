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
    <div role="status" className="toast">
      <p>Ready to work offline. Reviews will load without a connection.</p>
      <button type="button" className="btn-quiet" onClick={() => setVisible(false)}>
        OK
      </button>
    </div>
  )
}
