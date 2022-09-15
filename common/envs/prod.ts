export type EnvConfig = {
  domain: string
  firebaseConfig: FirebaseConfig
  amplitudeApiKey?: string

  // IDs for v2 cloud functions -- find these by deploying a cloud function and
  // examining the URL, https://[name]-[cloudRunId]-[cloudRunRegion].a.run.app
  cloudRunId: string
  cloudRunRegion: string

  // Access controls
  adminEmails: string[]
  whitelistEmail?: string // e.g. '@theoremone.co'. If not provided, all emails are whitelisted
  visibility: 'PRIVATE' | 'PUBLIC'

  // Branding
  moneyMoniker: string // e.g. 'M$'
  bettor?: string // e.g. 'bettor' or 'predictor'
  presentBet?: string // e.g. 'bet' or 'predict'
  pastBet?: string // e.g. 'bet' or 'prediction'
  faviconPath?: string // Should be a file in /public
  navbarLogoPath?: string
  newQuestionPlaceholders: string[]

  economy?: Economy
}

export type Economy = {
  FIXED_ANTE?: number

  STARTING_BALANCE?: number
  SUS_STARTING_BALANCE?: number

  REFERRAL_AMOUNT?: number

  UNIQUE_BETTOR_BONUS_AMOUNT?: number

  BETTING_STREAK_BONUS_AMOUNT?: number
  BETTING_STREAK_BONUS_MAX?: number
  BETTING_STREAK_RESET_HOUR?: number
  FREE_MARKETS_PER_USER_MAX?: number
}

type FirebaseConfig = {
  apiKey: string
  authDomain: string
  projectId: string
  region?: string
  storageBucket: string
  messagingSenderId: string
  appId: string
  measurementId: string
}

export const PROD_CONFIG: EnvConfig = {
  domain: 'manifold.markets',
  amplitudeApiKey: '2d6509fd4185ebb8be29709842752a15',

  firebaseConfig: {
    apiKey: 'AIzaSyDp3J57vLeAZCzxLD-vcPaGIkAmBoGOSYw',
    authDomain: 'mantic-markets.firebaseapp.com',
    projectId: 'mantic-markets',
    region: 'us-central1',
    storageBucket: 'mantic-markets.appspot.com',
    messagingSenderId: '128925704902',
    appId: '1:128925704902:web:f61f86944d8ffa2a642dc7',
    measurementId: 'G-SSFK1Q138D',
  },
  cloudRunId: 'nggbo3neva',
  cloudRunRegion: 'uc',
  adminEmails: [
    'akrolsmir@gmail.com', // Austin
    'jahooma@gmail.com', // James
    'taowell@gmail.com', // Stephen
    'abc.sinclair@gmail.com', // Sinclair
    'manticmarkets@gmail.com', // Manifold
    'iansphilips@gmail.com', // Ian
    'd4vidchee@gmail.com', // D4vid
    'federicoruizcassarino@gmail.com', // Fede
    'ingawei@gmail.com', //Inga
  ],
  visibility: 'PUBLIC',

  moneyMoniker: 'M$',
  bettor: 'predictor',
  pastBet: 'prediction',
  presentBet: 'predict',
  navbarLogoPath: '',
  faviconPath: '/favicon.ico',
  newQuestionPlaceholders: [
    'Will anyone I know get engaged this year?',
    'Will humans set foot on Mars by the end of 2030?',
    'Will any cryptocurrency eclipse Bitcoin by market cap this year?',
    'Will the Democrats win the 2024 presidential election?',
  ],
}
