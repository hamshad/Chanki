import { registerSW } from 'virtual:pwa-register'

/**
 * Central PWA update wiring (prompt strategy).
 *
 * - onNeedRefresh → dispatches `pwa:need-refresh` for UI consumers.
 * - onOfflineReady → dispatches `pwa:offline-ready` for the ready toast.
 * - onRegisteredSW → hourly `r.update()` check. Detect-only: it asks the
 *   browser to fetch a fresh SW, it never applies it. The user applies via
 *   the UpdateBanner calling `updateServiceWorker()`.
 * - Never uses forced activation (no autoUpdate / skipWaiting / clientsClaim).
 */
export function initPwaUpdates(): void {
  registerSW({
    onNeedRefresh() {
      window.dispatchEvent(new CustomEvent('pwa:need-refresh'))
    },
    onOfflineReady() {
      window.dispatchEvent(new CustomEvent('pwa:offline-ready'))
    },
    onRegisteredSW(_swUrl, registration) {
      // Hourly detect-only check while the app is open.
      if (registration) {
        setInterval(() => {
          void registration.update()
        }, 60 * 60 * 1000)
      }
    },
    onRegisterError(error) {
      console.error('SW registration failed:', error)
    },
  })
}
