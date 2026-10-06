/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY: string
  readonly VITE_FIREBASE_AUTH_DOMAIN: string
  readonly VITE_FIREBASE_DATABASE_URL: string
  readonly VITE_FIREBASE_PROJECT_ID: string
  readonly VITE_FIREBASE_STORAGE_BUCKET: string
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string
  readonly VITE_FIREBASE_APP_ID: string
  readonly VITE_FIREBASE_MEASUREMENT_ID: string
  // Optional: assistant screen soft-fails to a setup hint when absent.
  // Exposed via envPrefix in vite.config.ts (no VITE_ prefix on purpose).
  readonly OPENROUTER_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
