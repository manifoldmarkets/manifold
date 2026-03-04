import { EnvConfig, PROD_CONFIG } from './prod'

export const DEV_CONFIG: EnvConfig = {
  ...PROD_CONFIG,
  domain: 'dev.manifold.markets',
  googleAnalyticsId: '',
  firebaseConfig: {
    apiKey: 'AIzaSyB2ACzbdBVbqsg1qs_srsbHb65p33JCsrw',
    authDomain: 'manifold-fd657.firebaseapp.com',
    projectId: 'manifold-fd657',
    region: 'us-central1',
    storageBucket: 'manifold-fd657.firebasestorage.app',
    privateBucket: 'manifold-fd657-private',
    messagingSenderId: '546088015866',
    appId: '1:546088015866:web:23571f95139b212bb13643',
    measurementId: '',
  },
  cloudRunId: 'w3txbmd3ba',
  cloudRunRegion: 'uc',
  amplitudeApiKey: 'fd8cbfd964b9a205b8678a39faae71b3',
  supabaseInstanceId: 'mfodonznyfxllcezufgr',
  supabaseAnonKey:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1mb2RvbnpueWZ4bGxjZXp1ZmdyIiwicm9sZSI6ImFub24iLCJpYXQiOjE2Njc5ODgxNjcsImV4cCI6MTk4MzU2NDE2N30.RK8CA3G2_yccgiIFoxzweEuJ2XU5SoB7x7wBzMKitvo',
  twitchBotEndpoint: 'https://dev-twitch-bot.manifold.markets',
  apiEndpoint: 'api.dev.manifold.markets',
  expoConfig: {
    iosClientId:
      '134303100058-lioqb7auc8minvqt9iamuit2pg10pubt.apps.googleusercontent.com',
    iosClientId2:
      '134303100058-9464q86hhfloaij15dl9ekn6l39e3cv8.apps.googleusercontent.com',
    expoClientId:
      '134303100058-2uvio555s8mnhde20b4old97ptjnji3u.apps.googleusercontent.com',
    androidClientId:
      '134303100058-mu6dbubhks8khpqi3dq0fokqnkbputiq.apps.googleusercontent.com',
    androidClientId2:
      '134303100058-p29jv704pu0p8helj0pqruidi4lqss9j.apps.googleusercontent.com',
  },
  adminIds: [
    '00000000-0000-0000-0000-000000000000', // Default admin (seeded by migration)
  ],
}
