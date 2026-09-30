import { useLocation } from 'wouter'

interface LegalProps {
  kind: 'privacy' | 'terms'
}

export function Legal({ kind }: LegalProps) {
  const [, setLocation] = useLocation()

  if (kind === 'privacy') {
    return (
      <article className="legal">
        <a className="back-link" href="/" onClick={(e) => { e.preventDefault(); setLocation('/') }}>
          ← Back
        </a>
        <h1>Privacy</h1>
        <p className="eyebrow">Last updated 29 September 2026</p>

        <h2>What stays on your device</h2>
        <p>
          Chanki stores your cards, review history and settings in your browser's local storage
          (IndexedDB). None of it leaves the device while you use the app in a browser tab.
        </p>

        <h2>Device identity</h2>
        <p>
          The app generates a random identifier for your device so it can tell your progress apart
          from another install. It is a random number, not derived from your name, email or phone
          number, and it cannot be traced back to you.
        </p>

        <h2>Sync</h2>
        <p>
          If you install the app as a PWA, review progress can sync to Firebase under that random
          device identifier so your history survives a reinstall. Card content and progress only —
          no account, no email, no payment details.
        </p>

        <h2>Microphone</h2>
        <p>
          The tone trainer reads microphone input to draw your pitch contour. Audio is processed on
          your device and is never recorded or uploaded. Closing the trainer releases the
          microphone.
        </p>

        <h2>Cookies and tracking</h2>
        <p>
          No cookies, no analytics, no advertising, no third-party trackers. The app works offline
          after the first visit.
        </p>

        <h2>Removing your data</h2>
        <p>
          Clearing your browser's site data for Chanki removes everything, including the device
          identifier. There is no server-side copy to request.
        </p>
      </article>
    )
  }

  return (
    <article className="legal">
      <a className="back-link" href="/" onClick={(e) => { e.preventDefault(); setLocation('/') }}>
        ← Back
      </a>
      <h1>Terms</h1>
      <p className="eyebrow">Last updated 29 September 2026</p>

      <h2>What Chanki is</h2>
      <p>
        Chanki is a study tool for Chinese vocabulary and tones. It is provided as-is, with no
        guarantee that it will be available, error-free, or that spaced repetition scheduling will
        produce any particular learning outcome.
      </p>

      <h2>Your content</h2>
      <p>
        Cards you create in the hidden admin panel belong to you. Export your deck to JSON before
        clearing browser data — Chanki cannot recover it afterwards.
      </p>

      <h2>Responsibility</h2>
      <p>
        You are responsible for how you use the app and for verifying the accuracy of card content.
        Chanki is a supplement to study, not a substitute for a course or a teacher.
      </p>

      <h2>Changes</h2>
      <p>
        These terms may change as the app changes. Continued use after an update means you accept
        the current version.
      </p>
    </article>
  )
}
