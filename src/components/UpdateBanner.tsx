import { useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

/**
 * User-driven update prompt. Rendered when the waiting SW signals
 * needRefresh. "Update now" applies the fresh shell; "Later" hides the
 * banner until the next needRefresh. Never force-reloads.
 */
export function UpdateBanner() {
  // vite-plugin-pwa returns needRefresh as [value, setter] tuple — destructure
  // the flag or the array itself is always truthy and the banner never hides.
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW()
  const [dismissed, setDismissed] = useState(false)

  if (!needRefresh || dismissed) return null

  return (
    <div role="alert" className="toast">
      <p>A new version of Chanki is ready.</p>
      <button
        type="button"
        className="btn-primary"
        onClick={() => {
          void updateServiceWorker()
        }}
      >
        Update
      </button>
      <button type="button" className="btn-quiet" onClick={() => setDismissed(true)}>
        Later
      </button>
    </div>
  )
}
