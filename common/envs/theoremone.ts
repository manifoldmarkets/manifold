import { EnvConfig, PROD_CONFIG } from './prod'

export const THEOREMONE_CONFIG: EnvConfig = {
  domain: 'theoremone.manifold.markets',
  firebaseConfig: {
    apiKey: 'AIzaSyBSXL6Ys7InNHnCKSy-_E_luhh4Fkj4Z6M',
    authDomain: 'theoremone-manifold.firebaseapp.com',
    projectId: 'theoremone-manifold',
    storageBucket: 'theoremone-manifold.appspot.com',
    messagingSenderId: '698012149198',
    appId: '1:698012149198:web:b342af75662831aa84b79f',
    measurementId: 'G-Y3EZ1WNT6E',
  },
  adminEmails: [...PROD_CONFIG.adminEmails, 'david.glidden@theoremone.co'],
  whitelistEmail: '@theoremone.co',
  moneyMoniker: 'T$',
  visibility: 'PRIVATE',
  faviconPath: '/theoremone/logo.ico',
}
