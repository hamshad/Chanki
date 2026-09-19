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
 * iOS install guidance. iOS fires no beforeinstallprompt, so this is the
 * install path: Share → Add to Home Screen → Add. Rendered only on iOS
 * outside standalone mode; never when already installed. Copy stays
 * browser-neutral (iOS 16.4+ allows install from any browser).
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
      // Ignore persistence failure; just hide for this session.
    }
    setVisible(false)
  }

  return (
    <div
      role="note"
      style={{
        padding: '12px 16px',
        background: '#e9ecef',
        color: '#1a1a2e',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <p style={{ margin: 0, flex: 1 }}>
        Install Chanki: Tap Share → Add to Home Screen → Add
      </p>
      <button type="button" onClick={dismiss} style={{ padding: '6px 12px' }}>
        Dismiss
      </button>
    </div>
  )
}
