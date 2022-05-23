import * as admin from 'firebase-admin'

import { initAdmin } from './script-init'
initAdmin()

import { getUserByUsername } from '../utils'
import { changeUser } from '../change-user-info'

async function main() {
  const username = process.argv[2]
  const name = process.argv[3]
  const newUsername = process.argv[4]
  const avatarUrl = process.argv[5]

  if (process.argv.length < 4) {
    console.log(
      'syntax: node change-user-info.js [current username] [new name] [new username] [new avatar]'
    )
    return
  }

  const user = await getUserByUsername(username)
  if (!user) {
    console.log('username', username, 'could not be found')
    return
  }

  await changeUser(user, { username: newUsername, name, avatarUrl })
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
