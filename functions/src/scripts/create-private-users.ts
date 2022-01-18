import * as admin from 'firebase-admin'
import * as _ from 'lodash'

import { PrivateUser, User } from '../../../common/user'

// Generate your own private key, and set the path below:
// https://console.firebase.google.com/u/0/project/mantic-markets/settings/serviceaccounts/adminsdk

const serviceAccount = require('../../../../../../Downloads/dev-mantic-markets-firebase-adminsdk-sir5m-b2d27f8970.json')

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
})

const firestore = admin.firestore()

async function main() {
  const snap = await firestore.collection('users').get()
  const users = snap.docs.map((d) => d.data() as User)

  for (let user of users) {
    const fbUser = await admin.auth().getUser(user.id)
    const email = fbUser.email
    const { username } = user

    const privateUser: PrivateUser = {
      id: user.id,
      email,
      username,
    }

    try {
      await firestore
        .collection('private-users')
        .doc(user.id)
        .create(privateUser)

      console.log('created private user for:', user.username)
    } catch (_) {
      // private user already created
    }
  }
}

if (require.main === module) main().then(() => process.exit())
