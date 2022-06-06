import { EnvConfig, PROD_CONFIG } from './prod'

export const THEOREMONE_CONFIG: EnvConfig = {
  domain: 'theoremone.manifold.markets',
  firebaseConfig: {
    apiKey: 'AIzaSyBSXL6Ys7InNHnCKSy-_E_luhh4Fkj4Z6M',
    authDomain: 'theoremone-manifold.firebaseapp.com',
    projectId: 'theoremone-manifold',
    region: 'us-central1',
    storageBucket: 'theoremone-manifold.appspot.com',
    messagingSenderId: '698012149198',
    appId: '1:698012149198:web:b342af75662831aa84b79f',
    measurementId: 'G-Y3EZ1WNT6E',
  },
  // TODO: fill in real endpoints for T1
  functionEndpoints: {
    placebet: 'https://placebet-nggbo3neva-uc.a.run.app',
    createmarket: 'https://createmarket-nggbo3neva-uc.a.run.app',
  },
  adminEmails: [...PROD_CONFIG.adminEmails, 'david.glidden@theoremone.co'],
  whitelistEmail: '@theoremone.co',
  moneyMoniker: 'T$',
  visibility: 'PRIVATE',
  faviconPath: '/theoremone/logo.ico',
  navbarLogoPath: '/theoremone/TheoremOne-Logo.svg',
  newQuestionPlaceholders: [
    'Will we have at least 5 new team members by the end of this quarter?',
    'Will we meet or exceed our goals this sprint?',
    'Will we sign on 3 or more new clients this month?',
    'Will Paul shave his beard by the end of the month?',
  ],
}
