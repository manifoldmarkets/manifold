import { EnvConfig } from './prod'

export const ATLAS4_CONFIG: EnvConfig = {
  domain: 'atlas4.manifold.markets',
  firebaseConfig: {
    apiKey: 'AIzaSyDVS2IyYbBprFw2_EjzD7FIiyY67AsiffE',
    authDomain: 'atlas4.firebaseapp.com',
    projectId: 'atlas4',
    storageBucket: 'atlas4.appspot.com',
    messagingSenderId: '213852207227',
    appId: '1:213852207227:web:4e2d6d089c7571037a0ade',
    measurementId: 'G-8C26BB7JJG',
  },

  cloudRunId: 'o7zdjo5hka',
  cloudRunRegion: 'uc',

  adminEmails: [
    'akrolsmir@gmail.com',
    'ricki.heicklen@gmail.com',
    'ross@ftx.org',
    'gpimpale29@gmail.com',
  ],
  whitelistEmail: '',
  moneyMoniker: '📎',
  fixedAnte: 25,
  startingBalance: 250,
  referralBonus: 0,
  visibility: 'PRIVATE',
  navbarLogoPath: '/atlas/atlas-logo-white.svg',
  newQuestionPlaceholders: [
    'Will we have at least 5 new team members by the end of this quarter?',
    'Will we meet or exceed our goals this sprint?',
    'Will we sign on 3 or more new clients this month?',
    'Will Paul shave his beard by the end of the month?',
  ],
}
