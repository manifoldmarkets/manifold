import * as admin from 'firebase-admin'
import * as _ from 'lodash'

// Generate your own private key, and set the path below:
// https://console.firebase.google.com/u/0/project/mantic-markets/settings/serviceaccounts/adminsdk

const serviceAccount = require('../../../../../../Downloads/dev-mantic-markets-firebase-adminsdk-sir5m-b2d27f8970.json')

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
})

import { getUserByUsername } from '../utils'
import { changeUser } from '../change-user-info'

async function main() {
  const username = process.argv[2]
  const name = process.argv[3]
  const avatarUrl = process.argv[4]
  const newUsername = process.argv[5]

  if (process.argv.length < 4) {
    console.log(
      'syntax: node change-user-info.js [current username] [new name] [new avatar] [new username]'
    )
    return
  }

  const user = await getUserByUsername(username)
  if (!user) {
    console.log('username', username, 'could not be found')
    return
  }

  await changeUser(user, { username, name, avatarUrl })
    .then(() =>
      console.log(
        'succesfully changed',
        user.username,
        'to',
        name,
        avatarUrl,
        newUsername
      )
    )
    .catch((e) => console.log(e.message))
}

if (require.main === module) main().then(() => process.exit())
