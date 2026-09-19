import './App.css'
import { InstallButton } from './components/InstallButton.tsx'
import { IosInstallHint } from './components/IosInstallHint.tsx'
import { OfflineReady } from './components/OfflineReady.tsx'
import { UpdateBanner } from './components/UpdateBanner.tsx'

function App() {
  return (
    <>
      <header>
        <h1>Chanki</h1>
      </header>
      <main>
        <p>Review sessions will live here. Install the app to study offline.</p>
        <InstallButton />
      </main>
      <IosInstallHint />
      <UpdateBanner />
      <OfflineReady />
    </>
  )
}

export default App
