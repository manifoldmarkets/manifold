import { EnvConfig, PROD_CONFIG } from './prod'

export const ALVEA_CONFIG: EnvConfig = {
  domain: 'alvea.manifold.markets',
  firebaseConfig: {
    apiKey: 'AIzaSyDT5D8IUGRfT9a1bNYb-1b-RGm1JOHoW7Y',
    authDomain: 'alvea-manifold.firebaseapp.com',
    projectId: 'alvea-manifold',
    storageBucket: 'alvea-manifold.appspot.com',
    messagingSenderId: '854070403258',
    appId: '1:854070403258:web:b8b5f303bc97d010882283',
    measurementId: 'G-QHP8V3BM54',
  },
  cloudRunId: '', // TODO: fill in real ID
  cloudRunRegion: 'uc',
  adminEmails: [...PROD_CONFIG.adminEmails],
  whitelistEmail: '@alveavax.com',
  moneyMoniker: 'A$',
  visibility: 'PRIVATE',
  // faviconPath: '/theoremone/logo.ico',
  navbarLogoPath: '/alvea/alvea-logo.svg',
  newQuestionPlaceholders: [
    'Will we have at least 5 new team members by the end of this quarter?',
  ],
}
