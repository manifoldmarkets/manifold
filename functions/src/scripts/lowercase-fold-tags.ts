import * as admin from 'firebase-admin'
import { uniq } from 'lodash'

import { initAdmin } from './script-init'
initAdmin()

import { getValues } from '../utils'
import { Group } from 'common/group'

async function lowercaseFoldTags() {
  const firestore = admin.firestore()
  console.log('Updating fold tags')

  const folds = await getValues<Group>(firestore.collection('folds'))

  console.log('Loaded', folds.length, 'folds')

  for (const fold of folds) {
    const foldRef = firestore.doc(`folds/${fold.id}`)

    const { tags } = fold
    const lowercaseTags = uniq(tags.map((tag) => tag.toLowerCase()))

    console.log('Adding lowercase tags', fold.slug, lowercaseTags)

    await foldRef.update({
      lowercaseTags,
    } as Partial<Group>)
  }
}

if (require.main === module) {
  lowercaseFoldTags().then(() => process.exit())
}
