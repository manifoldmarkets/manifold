// We have three kinds of rich text:
// - Contract descriptions.
// - Comment text.
// - Post contents.
// These are stored in two different ways:
// - As plaintext strings.
// - As structured ProseMirror JSON in Firestore.
// We want to make all of these into:
// - Strings containing serialized ProseMirror JSON.

import * as admin from 'firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'
import { initAdmin } from './script-init'
import { log, writeAsync } from '../utils'
import { filterDefined } from '../../../common/util/array'
import { plainTextToProseMirror } from '../../../common/util/parse'

initAdmin()
const firestore = admin.firestore()

const isValidJSON = (s: string) => {
  try {
    JSON.parse(s)
    return true
  } catch {
    return false
  }
}

const migrateContractDescriptions = async () => {
  const contractQ = await firestore.collection('contracts').get()
  console.log(`Loaded ${contractQ.size} contracts.`)
  const updates = filterDefined(
    contractQ.docs.map((doc) => {
      const fields: { [k: string]: unknown } = {}
      const oldDescription = doc.get('description')
      if (typeof oldDescription === 'string') {
        if (isValidJSON(oldDescription)) {
          // this one is already good
          return null
        } else {
          fields.description = JSON.stringify(
            plainTextToProseMirror(oldDescription)
          )
        }
      } else if (oldDescription != null) {
        // already JSON, just need to serialize into string
        fields.description = JSON.stringify(oldDescription)
      } else {
        throw new Error('Content had null description for some reason.')
      }
      return { doc: doc.ref, fields }
    })
  )
  log(`Found ${updates.length} contracts with old format descriptions.`)
  await writeAsync(firestore, updates)
}

const migrateCommentContents = async () => {
  const commentQ = await firestore.collectionGroup('comments').get()
  console.log(`Loaded ${commentQ.size} comments.`)
  const updates = filterDefined(
    commentQ.docs.map((doc) => {
      const fields: { [k: string]: unknown } = {}
      const oldText = doc.get('text')
      const oldContent = doc.get('content')
      if (typeof oldContent === 'string') {
        // this one is already good
        return null
      } else if (oldContent != null) {
        // already JSON, just need to serialize into string
        fields.content = JSON.stringify(oldContent)
      } else if (oldText != null) {
        fields.text = FieldValue.delete()
        fields.content = JSON.stringify(plainTextToProseMirror(oldText))
      } else {
        throw new Error('Comment mysteriously had neither text nor content.')
      }
      return { doc: doc.ref, fields }
    })
  )
  log(`Found ${updates.length} comments with old format content.`)
  await writeAsync(firestore, updates)
}

const migratePostContents = async () => {
  const postQ = await firestore.collection('posts').get()
  console.log(`Loaded ${postQ.size} posts.`)
  const updates = filterDefined(
    postQ.docs.map((doc) => {
      const fields: { [k: string]: unknown } = {}
      const oldContent = doc.get('content')
      if (typeof oldContent === 'string') {
        // this one is already good
        return null
      } else if (oldContent != null) {
        // already JSON, just need to serialize into string
        fields.content = JSON.stringify(oldContent)
      } else {
        throw new Error('Post had null content for some reason.')
      }
      return { doc: doc.ref, fields }
    })
  )
  log(`Found ${updates.length} posts with old format content.`)
  await writeAsync(firestore, updates)
}

if (require.main === module) {
  migrateContractDescriptions()
  migrateCommentContents()
  migratePostContents()
}
