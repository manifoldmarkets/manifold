import * as admin from 'firebase-admin'
import * as fs from 'fs'
import { initAdmin } from '../shared/src/init-admin'

function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  const results: T[][] = []
  for (let i = 0; i < array.length; i += chunkSize) {
    results.push(array.slice(i, i + chunkSize))
  }
  return results
}

async function main(slug: string, outputPath: string) {
  if (!slug) {
    console.error('Slug cannot be undefined.')
    return
  }

  initAdmin()

  const db = admin.firestore()
  const groupsRef = db.collection('groups')
  const groupSnapshot = await groupsRef.where('slug', '==', slug).get()

  if (groupSnapshot.empty) {
    console.error(`No group found with slug '${slug}'.`)
    return
  }

  const group = groupSnapshot.docs[0]
  const groupMembersRef = group.ref.collection('groupMembers')
  const groupMembersSnapshot = await groupMembersRef.get()
  console.log(`Fetched ${groupMembersSnapshot.docs.length} group members`)

  const userIds = groupMembersSnapshot.docs.map((doc) => doc.id)
  console.log(`User IDs: ${JSON.stringify(userIds, null, 2)}`)
  const userIdChunks = chunkArray(userIds, 30)

  const privateUsersRef = admin.firestore().collection('private-users')
  const userEmails = []

  for (const userIdChunk of userIdChunks) {
    const usersSnapshot = await privateUsersRef
      .where(admin.firestore.FieldPath.documentId(), 'in', userIdChunk)
      .get()
    console.log(`Fetched ${usersSnapshot.docs.length} users`)
    const chunkEmails = usersSnapshot.docs
      .filter((doc) => doc.data().email)
      .map((doc) => doc.data().email)
    console.log(`User Emails: ${JSON.stringify(userEmails, null, 2)}`)
    userEmails.push(...chunkEmails)
  }

  fs.writeFileSync(outputPath, userEmails.join('\n'))
  console.log(`Emails exported to '${outputPath}'.`)
}

const [slug, outputDir] = process.argv.slice(2)
const outputPath = `${outputDir}\\${slug}.csv`
main(slug, outputPath)

// To run:
//firebase use prod
//ts-node export-group-emails.ts replace_this_with_group_id replace_this_with_file_path
