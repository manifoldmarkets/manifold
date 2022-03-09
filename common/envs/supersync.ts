import { EnvConfig, PROD_CONFIG } from './prod'

export const SUPERSYNC_CONFIG: EnvConfig = {
  domain: 'supersync.manifold.markets',
  firebaseConfig: {
    apiKey: 'AIzaSyCV2THIZ_DPuFe4SI033uE13XNjzBLHPGM',
    authDomain: 'supersync-manifold.firebaseapp.com',
    projectId: 'supersync-manifold',
    storageBucket: 'supersync-manifold.appspot.com',
    messagingSenderId: '385180520313',
    appId: '1:385180520313:web:e4d99bf5b888d76b43a9a8',
    measurementId: 'G-C28MP0GSDJ',
  },
  adminEmails: [...PROD_CONFIG.adminEmails],
  whitelistEmail: '@supsync.com',
  moneyMoniker: 'S$',
  visibility: 'PRIVATE',
  faviconPath: '/favicon.ico',
  navbarLogoPath:
    'https://supsync.com/content/images/2021/03/supsync-logo-invert-1.svg',
  newQuestionPlaceholders: [
    'Will we have at least 5 new team members by the end of this quarter?',
    'Will we meet or exceed our goals this sprint?',
    'Will we sign on 3 or more new clients this month?',
    'Will Paul shave his beard by the end of the month?',
  ],
}
