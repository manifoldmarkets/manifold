import { getFirestore } from '@firebase/firestore'
import { initializeApp } from 'firebase/app'
const firebaseConfig = {
  apiKey: 'AIzaSyDp3J57vLeAZCzxLD-vcPaGIkAmBoGOSYw',
  authDomain: 'mantic-markets.firebaseapp.com',
  projectId: 'mantic-markets',
  storageBucket: 'mantic-markets.appspot.com',
  messagingSenderId: '128925704902',
  appId: '1:128925704902:web:f61f86944d8ffa2a642dc7',
  measurementId: 'G-SSFK1Q138D',
}

// Initialize Firebase
export const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)

try {
  // Note: this is still throwing a console error atm...
  import('firebase/analytics').then((analytics) => {
    analytics.getAnalytics(app)
  })
} catch (e) {
  console.warn('Analytics were blocked')
}
