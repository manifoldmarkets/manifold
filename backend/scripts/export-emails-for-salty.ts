import * as admin from 'firebase-admin'
import { writeCsv } from 'shared/helpers/file'

import { initAdmin } from 'shared/init-admin'

initAdmin()

const firestore = admin.firestore()

async function main() {
  const emailSnap = await firestore
    .collection('private-users')
    .select('email')
    .get()
  const emailData = emailSnap.docs.reduce((acc, doc) => {
    acc[doc.id] = doc.data().email || ''
    return acc
  }, {} as { [id: string]: string })

  const usersSnap = await firestore
    .collection('users')
    .select('username', 'createdTime')
    .orderBy('createdTime', 'desc')
    .get()

  const users = usersSnap.docs.slice(20000).map((doc) => ({
    id: doc.id,
    username: doc.data().username || '',
    email: emailData[doc.id] || '',
  }))

  const data = users.map((user) => ({
    username: user.username,
    email: user.email,
  }))

  const filePath =
    'C:\\Users\\d4vid\\OneDrive\\Documents\\Manifold emails\\user-emails.csv'
  const fields = ['username', 'email']

  await writeCsv(filePath, fields, data)
  console.log('User emails have been exported to user-emails.csv')
}

if (require.main === module) {
  main().then(() => process.exit())
}
