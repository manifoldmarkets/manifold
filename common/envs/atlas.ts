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
  // TODO: fill in real endpoints for atlas
  // Where do we get these?
  functionEndpoints: {
    placebet: 'https://placebet-nggbo3neva-uc.a.run.app',
    sellshares: 'https://sellshares-nggbo3neva-uc.a.run.app',
    sellbet: 'https://sellbet-nggbo3neva-uc.a.run.app',
    createmarket: 'https://createmarket-nggbo3neva-uc.a.run.app',
  },
  adminEmails: [...PROD_CONFIG.adminEmails],
  whitelistEmail: '',
  moneyMoniker: 'A$',
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
