import * as admin from 'firebase-admin'
import { writeCsv } from 'shared/helpers/file'

import { initAdmin } from 'shared/init-admin'
import { PrivateUser } from 'common/user'

// Initialize Firebase Admin SDK
initAdmin()

const firestore = admin.firestore()

async function main() {
  // Get the email data from the 'private-users' collection
  const emailSnap = await firestore
    .collection('private-users')
    .select('email')
    .get()
  const emailData = emailSnap.docs.reduce((acc, doc) => {
    acc[doc.id] = doc.data().email || ''
    return acc
  }, {} as { [id: string]: string })

  // Get the username data from the 'users' collection
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

  // Prepare CSV data
  const data = users.map((user) => ({
    username: user.username,
    email: user.email,
  }))

  // Update the fields and header for the CSV
  const filePath =
    'C:\\Users\\d4vid\\OneDrive\\Documents\\Manifold emails\\user-emails.csv'
  const fields = ['username', 'email']

  await writeCsv(filePath, fields, data)
  console.log('User emails have been exported to user-emails.csv')
}

if (require.main === module) {
  main().then(() => process.exit())
}
