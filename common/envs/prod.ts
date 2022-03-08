export type EnvConfig = {
  domain: string
  firebaseConfig: FirebaseConfig

  // Access controls
  adminEmails: string[]
  whitelistEmail?: string // e.g. '@theoremone.co'. If not provided, all emails are whitelisted
  visibility: 'PRIVATE' | 'PUBLIC'

  // Branding
  moneyMoniker: string // e.g. 'M$'
  faviconPath?: string // Should be a file in /public
  navbarLogoPath?: string
}

type FirebaseConfig = {
  apiKey: string
  authDomain: string
  projectId: string
  storageBucket: string
  messagingSenderId: string
  appId: string
  measurementId: string
}

export const PROD_CONFIG: EnvConfig = {
  domain: 'manifold.markets',
  firebaseConfig: {
    apiKey: 'AIzaSyDp3J57vLeAZCzxLD-vcPaGIkAmBoGOSYw',
    authDomain: 'mantic-markets.firebaseapp.com',
    projectId: 'mantic-markets',
    storageBucket: 'mantic-markets.appspot.com',
    messagingSenderId: '128925704902',
    appId: '1:128925704902:web:f61f86944d8ffa2a642dc7',
    measurementId: 'G-SSFK1Q138D',
  },
  adminEmails: [
    'akrolsmir@gmail.com', // Austin
    'jahooma@gmail.com', // James
    'taowell@gmail.com', // Stephen
    'manticmarkets@gmail.com', // Manifold
  ],
  moneyMoniker: 'M$',
  visibility: 'PUBLIC',
  navbarLogoPath: '',
  faviconPath: '/favicon.ico',
}
