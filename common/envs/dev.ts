import { EnvConfig, PROD_CONFIG } from './prod'

export const DEV_CONFIG: EnvConfig = {
  ...PROD_CONFIG,
  firebaseConfig: {
    apiKey: 'AIzaSyBoq3rzUa8Ekyo3ZaTnlycQYPRCA26VpOw',
    authDomain: 'dev-mantic-markets.firebaseapp.com',
    projectId: 'dev-mantic-markets',
    region: 'us-central1',
    storageBucket: 'dev-mantic-markets.appspot.com',
    messagingSenderId: '134303100058',
    appId: '1:134303100058:web:27f9ea8b83347251f80323',
    measurementId: 'G-YJC9E37P37',
  },
  functionEndpoints: {
    placebet: 'https://placebet-w3txbmd3ba-uc.a.run.app',
    sellshares: 'https://sellshares-w3txbmd3ba-uc.a.run.app',
    createmarket: 'https://createmarket-w3txbmd3ba-uc.a.run.app',
  },
}
