/**
 * Plays the provided audio URL. If the URL fails to load (e.g. offline and not cached),
 * falls back to the Web Speech API (TTS) using a 'zh-CN' voice.
 */
export async function playAudio(url: string | undefined, fallbackText: string): Promise<void> {
  if (url) {
    try {
      const audio = new Audio(url)
      await new Promise<void>((resolve, reject) => {
        audio.onended = () => resolve()
        audio.onerror = (e) => reject(e)
        // Some browsers require play() to be caught
        audio.play().catch(reject)
      })
      return // Success!
    } catch (err) {
      console.warn('Audio playback failed, falling back to TTS:', err)
    }
  }

  // Fallback to Web Speech API
  if ('speechSynthesis' in window) {
    // Cancel any ongoing speech
    window.speechSynthesis.cancel()
    
    const utterance = new SpeechSynthesisUtterance(fallbackText)
    utterance.lang = 'zh-CN'
    // Optionally find a specific zh-CN voice, but default usually works
    window.speechSynthesis.speak(utterance)
  }
}
