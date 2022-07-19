import { EnvConfig } from './prod'

export const ATLAS3_CONFIG: EnvConfig = {
  domain: 'atlas2.manifold.markets',
  firebaseConfig: {
    apiKey: 'AIzaSyAAsJPN_4HAvmWtsdW2EIY2iRRbyTxEZQI',
    authDomain: 'atlas3-manifold.firebaseapp.com',
    projectId: 'atlas3-manifold',
    storageBucket: 'atlas3-manifold.appspot.com',
    messagingSenderId: '453445191752',
    appId: '1:453445191752:web:f7a899553e702d6d48b07d',
    measurementId: 'G-0F3F5X37YN',
  },

  cloudRunId: 'todo',
  cloudRunRegion: 'uc',

  adminEmails: [
    'akrolsmir@gmail.com',
    'ricki.heicklen@gmail.com',
    'ross@ftx.org',
    'gpimpale29@gmail.com',
  ],
  whitelistEmail: '',
  moneyMoniker: '📎',
  fixedAnte: 250,
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
