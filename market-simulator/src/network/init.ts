import { initializeApp } from 'firebase/app'
const firebaseConfig = {
  apiKey: 'AIzaSyB1p-PbBT1EcCfJoGtSeZbxlYVvagOoTaY',
  authDomain: 'starter-project-7fba2.firebaseapp.com',
  projectId: 'starter-project-7fba2',
  storageBucket: 'starter-project-7fba2.appspot.com',
  messagingSenderId: '751858706800',
  appId: '1:751858706800:web:1a69cfbd58c7acbafd87b5',
  measurementId: 'G-HPK27K51WM',
}

// Initialize Firebase
export const app = initializeApp(firebaseConfig)
try {
  // Note: this is still throwing a console error atm...
  import('firebase/analytics').then((analytics) => {
    analytics.getAnalytics(app)
  })
} catch (e) {
  console.warn('Analytics were blocked')
}
