/**
 * Assistant answer language — DEVICE-LOCAL preference.
 *
 * Stored in `localStorage` and never synced (like the dictionary history):
 * which language someone reads explanations in stays on their device.
 * 'en' = English (default), 'hi-Latn' = Hindi in Roman/Latin script.
 */
export type ChatLang = 'en' | 'hi-Latn'

const STORAGE_KEY = 'chanki.chat.lang'
export const DEFAULT_CHAT_LANG: ChatLang = 'en'

export function loadChatLang(): ChatLang {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'hi-Latn' ? 'hi-Latn' : 'en'
  } catch {
    return DEFAULT_CHAT_LANG
  }
}

export function saveChatLang(lang: ChatLang): void {
  try {
    localStorage.setItem(STORAGE_KEY, lang)
  } catch {
    // Preference is a convenience, not a contract.
  }
}
