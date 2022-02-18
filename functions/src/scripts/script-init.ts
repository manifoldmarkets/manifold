import * as admin from 'firebase-admin'

// Generate your own private key, and set the path below:
// Prod:
// https://console.firebase.google.com/u/0/project/mantic-markets/settings/serviceaccounts/adminsdk
// Dev:
// https://console.firebase.google.com/u/0/project/dev-mantic-markets/settings/serviceaccounts/adminsdk

const pathsToPrivateKey = {
  james:
    '/Users/jahooma/mantic-markets-firebase-adminsdk-1ep46-820891bb87.json',
  jamesDev:
    '/Users/jahooma/dev-mantic-markets-firebase-adminsdk-sir5m-f38cdbee37.json',
  stephen:
    '../../../../../../Downloads/mantic-markets-firebase-adminsdk-1ep46-351a65eca3.json',
  stephenDev:
    '../../../../../../Downloads/dev-mantic-markets-firebase-adminsdk-sir5m-b2d27f8970.json',
}

export const initAdmin = (who: keyof typeof pathsToPrivateKey) => {
  const serviceAccount = require(pathsToPrivateKey[who])

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  })
}

// Then:
// yarn watch (or yarn build)
// firebase use dev (or firebase use prod)
// Run script:
// node lib/functions/src/scripts/update-contract-tags.js
