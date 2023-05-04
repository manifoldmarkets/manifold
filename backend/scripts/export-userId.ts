import * as admin from 'firebase-admin'
import * as fs from 'fs'
import { initAdmin } from '../shared/src/init-admin'

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

  const userIds = groupMembersSnapshot.docs.map((doc) => doc.id)

  fs.writeFileSync(outputPath, userIds.join('\n'))
}

const [slug, outputDir] = process.argv.slice(2)
const outputPath = `${outputDir}\\${slug}.csv`
main(slug, outputPath)

// To run:
//firebase use prod
//ts-node export-userId.ts replace_this_with_slug replace_this_with_file_path
