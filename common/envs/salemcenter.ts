import { EnvConfig, PROD_CONFIG } from './prod'

export const SALEM_CENTER_CONFIG: EnvConfig = {
  domain: 'salemcenter.manifold.markets',
  firebaseConfig: {
    apiKey: 'AIzaSyBxisXMHPJDtM7ZseaOOlLAM_T7QHP_QvA',
    authDomain: 'salem-center-manifold.firebaseapp.com',
    projectId: 'salem-center-manifold',
    region: 'us-central1',
    storageBucket: 'salem-center-manifold.appspot.com',
    messagingSenderId: '522400938664',
    appId: '1:522400938664:web:300eaedb8446818d61a09d',
    measurementId: 'G-Y3EZ1WNT6E',
  },
  cloudRunId: 'nggbo3neva', // TODO: fill in real ID for T1
  cloudRunRegion: 'uc',
  adminEmails: [...PROD_CONFIG.adminEmails, 'richardh0828@gmail.com'],
  moneyMoniker: 'S$',
  visibility: 'PRIVATE',
  faviconPath: '/theoremone/logo.ico',
  navbarLogoPath: '/theoremone/TheoremOne-Logo.svg',
  newQuestionPlaceholders: [],
}
