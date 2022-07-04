import { EnvConfig, PROD_CONFIG } from './prod'

export const ATLAS2_CONFIG: EnvConfig = {
  domain: 'atlas2.manifold.markets',
  firebaseConfig: {
    apiKey: 'AIzaSyApmYeDGc4wGAAXKsdsx1h1WQBWqj5U2lA',
    authDomain: 'atlas2-manifold.firebaseapp.com',
    projectId: 'atlas2-manifold',
    storageBucket: 'atlas2-manifold.appspot.com',
    messagingSenderId: '466243568587',
    appId: '1:466243568587:web:c725617dd393bca76fec4e',
    measurementId: 'G-YL3CW8Y62X',
  },
  cloudRunId: 'bdiirjgiyq',
  cloudRunRegion: 'uc',

  adminEmails: [...PROD_CONFIG.adminEmails],
  whitelistEmail: '',
  moneyMoniker: '📎',
  fixedAnte: 25,
  startingBalance: 500,
  visibility: 'PRIVATE',
  navbarLogoPath: '/atlas/atlas-logo-white.svg',
  newQuestionPlaceholders: [
    'Will we have at least 5 new team members by the end of this quarter?',
    'Will we meet or exceed our goals this sprint?',
    'Will we sign on 3 or more new clients this month?',
    'Will Paul shave his beard by the end of the month?',
  ],
}
