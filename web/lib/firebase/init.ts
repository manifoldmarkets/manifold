import { getFirestore } from '@firebase/firestore'
import { initializeApp, getApps, getApp } from 'firebase/app'

export const isProd = process.env.NEXT_PUBLIC_FIREBASE_ENV !== 'DEV'

const firebaseConfig = isProd
  ? {
      apiKey: 'AIzaSyDp3J57vLeAZCzxLD-vcPaGIkAmBoGOSYw',
      authDomain: 'mantic-markets.firebaseapp.com',
      projectId: 'mantic-markets',
      storageBucket: 'mantic-markets.appspot.com',
      messagingSenderId: '128925704902',
      appId: '1:128925704902:web:f61f86944d8ffa2a642dc7',
      measurementId: 'G-SSFK1Q138D',
    }
  : {
      apiKey: 'AIzaSyBoq3rzUa8Ekyo3ZaTnlycQYPRCA26VpOw',
      authDomain: 'dev-mantic-markets.firebaseapp.com',
      projectId: 'dev-mantic-markets',
      storageBucket: 'dev-mantic-markets.appspot.com',
      messagingSenderId: '134303100058',
      appId: '1:134303100058:web:27f9ea8b83347251f80323',
      measurementId: 'G-YJC9E37P37',
    }

// Initialize Firebase
export const app = getApps().length ? getApp() : initializeApp(firebaseConfig)

export const db = getFirestore(app)
