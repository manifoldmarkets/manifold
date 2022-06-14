import { EnvConfig, PROD_CONFIG } from './prod'

export const ATLAS_CONFIG: EnvConfig = {
  domain: 'atlas.manifold.markets',
  firebaseConfig: {
    apiKey: 'AIzaSyCQvm7AjL1NjULPaEYjAiUjiVhfXmHGh_w',
    authDomain: 'atlas-manifold.firebaseapp.com',
    projectId: 'atlas-manifold',
    storageBucket: 'atlas-manifold.appspot.com',
    messagingSenderId: '802386508975',
    appId: '1:802386508975:web:1b1ff75deec469945ca85a',
    measurementId: 'G-FR9SJTFF2K',
    region: 'us-central1',
  },
  functionEndpoints: {
    placebet: 'https://placebet-txwwmth7kq-uc.a.run.app',
    sellshares: 'https://sellshares-txwwmth7kq-uc.a.run.app',
    sellbet: 'https://sellbet-txwwmth7kq-uc.a.run.app',
    createmarket: 'https://createmarket-txwwmth7kq-uc.a.run.app',
  },
  adminEmails: [...PROD_CONFIG.adminEmails],
  whitelistEmail: '',
  moneyMoniker: 'A$',
  startingBalance: 5000,
  visibility: 'PRIVATE',
  // faviconPath: '/atlas/atlas-favicon.png',
  navbarLogoPath: '/atlas/atlas-logo-white.svg',
  newQuestionPlaceholders: [
    'Will we have at least 5 new team members by the end of this quarter?',
    'Will we meet or exceed our goals this sprint?',
    'Will we sign on 3 or more new clients this month?',
    'Will Paul shave his beard by the end of the month?',
  ],
}
