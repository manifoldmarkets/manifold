import { EnvConfig, PROD_CONFIG } from './prod'

export const HANANIA_CONFIG: EnvConfig = {
  domain: 'hanania.manifold.markets',
  firebaseConfig: {
    apiKey: 'AIzaSyC1F3kAXZ0V0RM0Cg-xFwQn8pbOWFFDBYY',
    authDomain: 'hanania-manifold.firebaseapp.com',
    projectId: 'hanania-manifold',
    storageBucket: 'hanania-manifold.appspot.com',
    messagingSenderId: '319008991675',
    appId: '1:319008991675:web:d2dc5e72b95cdcec96fc9e',
    measurementId: 'G-VCXVKYGKTC',
  },
  // TODO replace
  functionEndpoints: {
    placebet: 'https://placebet-45jazbrfja-uc.a.run.app',
    sellshares: 'https://sellshares-45jazbrfja-uc.a.run.app',
    sellbet: 'https://sellbet-45jazbrfja-uc.a.run.app',
    createmarket: 'https://createmarket-45jazbrfja-uc.a.run.app',
    creategroup: 'https://creategroup-45jazbrfja-uc.a.run.app',
  },
  adminEmails: [...PROD_CONFIG.adminEmails],
  whitelistEmail: '',
  moneyMoniker: 'H$',
  visibility: 'PRIVATE',
}
