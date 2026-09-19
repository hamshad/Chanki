import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'

// Plan 02 components consume these events for the update banner + offline toast.
const updateSW = registerSW({
  onNeedRefresh() {
    window.dispatchEvent(new CustomEvent('pwa:need-refresh'))
  },
  onOfflineReady() {
    window.dispatchEvent(new CustomEvent('pwa:offline-ready'))
  },
  onRegisteredSW(swUrl, registration) {
    // Hourly update check only *detects* new versions; user applies via prompt.
    if (registration) {
      setInterval(() => {
        void registration.update()
      }, 60 * 60 * 1000)
    }
    console.debug('[pwa] service worker registered:', swUrl)
  },
  onRegisterError(error) {
    console.error('SW registration failed:', error)
  },
})

export { updateSW }

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
