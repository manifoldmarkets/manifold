import * as admin from 'firebase-admin'
import * as _ from 'lodash'

import { initAdmin } from './script-init'
initAdmin()

import { getValues } from '../utils'
import { Fold } from '../../../common/fold'

async function lowercaseFoldTags() {
  const firestore = admin.firestore()
  console.log('Updating fold tags')

  const folds = await getValues<Fold>(firestore.collection('folds'))

  console.log('Loaded', folds.length, 'folds')

  for (const fold of folds) {
    const foldRef = firestore.doc(`folds/${fold.id}`)

    const { tags } = fold
    const lowercaseTags = _.uniq(tags.map((tag) => tag.toLowerCase()))

    console.log('Adding lowercase tags', fold.slug, lowercaseTags)

    await foldRef.update({
      lowercaseTags,
    } as Partial<Fold>)
  }
}

if (require.main === module) {
  lowercaseFoldTags().then(() => process.exit())
}
