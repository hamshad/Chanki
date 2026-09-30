import { useEffect, useState } from 'react'

const DISMISS_KEY = 'chanki:ios-hint-dismissed'

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone ===
      true
  )
}

/**
 * iOS install guidance. iOS fires no beforeinstallprompt, so the install
 * path is Share → Add to Home Screen → Add. Rendered only on iOS outside
 * standalone mode; never when already installed. Copy stays browser-neutral
 * (iOS 16.4+ allows install from any browser).
 */
export function IosInstallHint() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!isIos() || isStandalone()) return
    try {
      if (localStorage.getItem(DISMISS_KEY) === '1') return
    } catch {
      // Storage unavailable — still show the hint.
    }
    setVisible(true)
  }, [])

  if (!visible) return null

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      // Ignore persistence failure — just hide it for this session.
    }
    setVisible(false)
  }

  return (
    <div role="note" className="notice-bar">
      <p>Install Chanki: tap Share → Add to Home Screen → Add</p>
      <button type="button" className="btn-quiet" onClick={dismiss}>
        Dismiss
      </button>
    </div>
  )
}
