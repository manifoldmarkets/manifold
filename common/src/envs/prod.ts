export type EnvConfig = {
  domain: string
  firebaseConfig: FirebaseConfig
  amplitudeApiKey: string
  supabaseInstanceId: string
  supabaseAnonKey: string
  twitchBotEndpoint: string
  sprigEnvironmentId: string

  // IDs for v2 cloud functions -- find these by deploying a cloud function and
  // examining the URL, https://[name]-[cloudRunId]-[cloudRunRegion].a.run.app
  cloudRunId: string
  cloudRunRegion: string

  // Access controls
  adminIds: string[]
  visibility: 'PRIVATE' | 'PUBLIC'

  // Branding
  moneyMoniker: string // e.g. 'Ṁ'
  bettor: string // e.g. 'predictor'
  nounBet: string // e.g. 'prediction'
  verbPastBet: string // e.g. 'predicted'
  faviconPath: string // Should be a file in /public
  newQuestionPlaceholders: string[]
  expoConfig: {
    iosClientId?: string
    expoClientId?: string
    androidClientId?: string
  }
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
  domain: 'manifold-js9u.vercel.app',
  amplitudeApiKey: '',
  supabaseInstanceId: 'qfoxftkiomoymchnaozl',
  supabaseAnonKey:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFmb3hmdGtpb21veW1jaG5hb3psIiwicm9sZSI6ImFub24iLCJpYXQiOjE2ODk0MDg3MDMsImV4cCI6MjAwNDk4NDcwM30.t7sKEO_DmvFfDdevAUUrQfYEK5Ao-DZbuua5Tetdg34',
  sprigEnvironmentId: '',

  firebaseConfig: {
    apiKey: 'AIzaSyCIku78FsmCjSFbkRN-nzkileDt9H9jIJg',
    authDomain: 'mantic-market.firebaseapp.com',
    projectId: 'mantic-market',
    region: 'us-central1',
    storageBucket: 'mantic-market.appspot.com',
    messagingSenderId: '388635777394',
    appId: '1:388635777394:web:30adbc21e04b723c6325eb',
    measurementId: 'G-PE0QZXTQ0Y',
  },
  twitchBotEndpoint: '',
  cloudRunId: '47u4ztjqea',
  cloudRunRegion: 'uc',

  adminIds: [
    // 'igi2zGXsfxYPgB0DJTXVJVmwCOr2', // Austin
    // '5LZ4LgYuySdL1huCWe7bti02ghx2', // James
    // 'tlmGNz9kjXc2EteizMORes4qvWl2', // Stephen
    // '0k1suGSJKVUnHbCPEhHNpgZPkUP2', // Sinclair
    // 'IPTOzEqrpkWmEzh6hwvAyY9PqFb2', // Manifold
    // 'AJwLWoo3xue32XIiAVrL5SyR1WB2', // Ian
    // 'uglwf3YKOZNGjjEXKc5HampOFRE2', // D4vid
    // 'GRwzCexe5PM6ThrSsodKZT9ziln2', //Inga
    // '62TNqzdBx7X2q621HltsJm8UFht2', // Marshall
  ],
  visibility: 'PUBLIC',

  moneyMoniker: 'Ṁ',
  bettor: 'trader',
  verbPastBet: 'traded',
  nounBet: 'trade',
  faviconPath: '/favicon.ico',
  newQuestionPlaceholders: [
    'Will anyone I know get engaged this year?',
    'Will humans set foot on Mars by the end of 2030?',
    'Will any cryptocurrency eclipse Bitcoin by market cap this year?',
    'Will the Democrats win the 2024 presidential election?',
  ],
  expoConfig: {
    // iosClientId:
    // '128925704902-n0ic4j1s5tk51t2vu8anu8glh3t5jimo.apps.googleusercontent.com',
    // expoClientId:
    // '128925704902-bpcbnlp2gt73au3rrjjtnup6cskr89p0.apps.googleusercontent.com',
    // androidClientId:
    // '128925704902-ur9hevfika2rs0sni6ju236u82hbct3i.apps.googleusercontent.com',
  },
}
