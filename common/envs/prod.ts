export type EnvConfig = {
  domain: string
  firebaseConfig: FirebaseConfig
  amplitudeApiKey?: string
  supabaseUrl?: string
  twitchBotEndpoint?: string
  sprigEnvironmentId?: string

  // IDs for v2 cloud functions -- find these by deploying a cloud function and
  // examining the URL, https://[name]-[cloudRunId]-[cloudRunRegion].a.run.app
  cloudRunId: string
  cloudRunRegion: string

  // Access controls
  adminEmails: string[]
  whitelistEmail?: string // e.g. '@theoremone.co'. If not provided, all emails are whitelisted
  visibility: 'PRIVATE' | 'PUBLIC'

  // Branding
  moneyMoniker: string // e.g. 'Ṁ'
  bettor?: string // e.g. 'bettor' or 'predictor'
  presentBet?: string // e.g. 'bet' or 'predict'
  pastBet?: string // e.g. 'bet' or 'prediction'
  faviconPath?: string // Should be a file in /public
  navbarLogoPath?: string
  newQuestionPlaceholders: string[]
  expoConfig?: {
    iosClientId?: string
    expoClientId?: string
    androidClientId?: string
  }
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
  COMMENT_BOUNTY_AMOUNT?: number
  STARTING_BONUS?: number
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
  supabaseUrl: 'https://pxidrgkatumlvfqaxcll.supabase.co',
  sprigEnvironmentId: 'sQcrq9TDqkib',

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
  twitchBotEndpoint: 'https://twitch-bot.manifold.markets',
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

  moneyMoniker: 'Ṁ',
  bettor: 'trader',
  pastBet: 'traded',
  presentBet: 'trade',
  navbarLogoPath: '',
  faviconPath: '/favicon.ico',
  newQuestionPlaceholders: [
    'Will anyone I know get engaged this year?',
    'Will humans set foot on Mars by the end of 2030?',
    'Will any cryptocurrency eclipse Bitcoin by market cap this year?',
    'Will the Democrats win the 2024 presidential election?',
  ],
  expoConfig: {
    iosClientId:
      '128925704902-n0ic4j1s5tk51t2vu8anu8glh3t5jimo.apps.googleusercontent.com',
    expoClientId:
      '128925704902-bpcbnlp2gt73au3rrjjtnup6cskr89p0.apps.googleusercontent.com',
    androidClientId:
      '128925704902-ur9hevfika2rs0sni6ju236u82hbct3i.apps.googleusercontent.com',
  },
}
