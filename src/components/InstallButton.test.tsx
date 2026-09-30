import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { InstallButton } from './InstallButton'

const originalUserAgent = navigator.userAgent

const CHROME_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const IOS_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
const SAFARI_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
const FIREFOX_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  window.__chankiInstall = null
  Object.defineProperty(navigator, 'userAgent', {
    value: originalUserAgent,
    configurable: true,
  })
})

function setUserAgent(value: string) {
  Object.defineProperty(navigator, 'userAgent', { value, configurable: true })
}

function stubDisplayMode(standalone: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({ matches: standalone }),
  )
}

function makeInstallEvent(promptMock: ReturnType<typeof vi.fn>) {
  const event = new Event('beforeinstallprompt', {
    cancelable: true,
  }) as Event & {
    prompt: ReturnType<typeof vi.fn>
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
  }
  event.prompt = promptMock
  event.userChoice = Promise.resolve({ outcome: 'accepted' as const })
  return event
}

describe('InstallButton', () => {
  it('renders nothing when already installed (standalone)', () => {
    stubDisplayMode(true)
    setUserAgent(CHROME_UA)
    const { container } = render(<InstallButton />)
    expect(container.firstChild).toBeNull()
  })

  it('always shows an entry point even before any install event (Safari)', async () => {
    stubDisplayMode(false)
    setUserAgent(SAFARI_UA)
    render(<InstallButton />)

    const button = await waitFor(() =>
      screen.getByRole('button', { name: /install app/i }),
    )
    fireEvent.click(button)
    await waitFor(() =>
      expect(screen.getByRole('note').textContent).toMatch(/share.*add to home screen/i),
    )
  })

  it('iOS: click reveals Share → Add to Home Screen steps', async () => {
    stubDisplayMode(false)
    setUserAgent(IOS_UA)
    render(<InstallButton />)

    const button = await waitFor(() =>
      screen.getByRole('button', { name: /install app/i }),
    )
    fireEvent.click(button)
    await waitFor(() =>
      expect(screen.getByRole('note').textContent).toMatch(
        /tap share.*add to home screen.*add/i,
      ),
    )
  })

  it('Firefox: click reveals menu install steps', async () => {
    stubDisplayMode(false)
    setUserAgent(FIREFOX_UA)
    render(<InstallButton />)

    fireEvent.click(screen.getByRole('button', { name: /install app/i }))
    await waitFor(() =>
      expect(screen.getByRole('note').textContent).toMatch(/install this site as an app/i),
    )
  })

  it('Chromium with prompt available: one click runs the native prompt', async () => {
    stubDisplayMode(false)
    setUserAgent(CHROME_UA)
    render(<InstallButton />)

    const promptMock = vi.fn().mockResolvedValue(undefined)
    window.dispatchEvent(makeInstallEvent(promptMock))

    await waitFor(() => expect(screen.getByRole('button', { name: /install app/i })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: /install app/i }))

    await waitFor(() => expect(promptMock).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('note')).toBeNull()
  })

  it('uses a prompt captured by the inline head script before React mounted', async () => {
    stubDisplayMode(false)
    setUserAgent(CHROME_UA)

    // Inline <script> in index.html stores the event before the bundle boots —
    // no window event is dispatched after render.
    const promptMock = vi.fn().mockResolvedValue(undefined)
    window.__chankiInstall = makeInstallEvent(promptMock)

    render(<InstallButton />)
    fireEvent.click(screen.getByRole('button', { name: /install app/i }))

    await waitFor(() => expect(promptMock).toHaveBeenCalledTimes(1))
    expect(window.__chankiInstall).toBeNull()
    expect(screen.queryByRole('note')).toBeNull()
  })

  it('hides after appinstalled', async () => {
    stubDisplayMode(false)
    setUserAgent(CHROME_UA)
    render(<InstallButton />)

    window.dispatchEvent(makeInstallEvent(vi.fn().mockResolvedValue(undefined)))
    await waitFor(() => expect(screen.getByRole('button', { name: /install app/i })).toBeTruthy())

    window.dispatchEvent(new Event('appinstalled'))
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /install app/i })).toBeNull(),
    )
  })
})
