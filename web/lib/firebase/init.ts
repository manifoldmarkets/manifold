import { getFirestore } from '@firebase/firestore'
import { initializeApp } from 'firebase/app'

// TODO: Reenable this when we have a way to set the Firebase db in dev
export const isProd = process.env.NODE_ENV === 'production'
// export const isProd = true

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
export const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)
