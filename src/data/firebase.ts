import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'

// Use a placeholder config for now. Real config can be injected during CI/build.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'demo-api-key',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'chanki-demo',
}

const app = initializeApp(firebaseConfig)
export const firestore = getFirestore(app)
