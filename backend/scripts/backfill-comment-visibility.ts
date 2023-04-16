import * as admin from 'firebase-admin'
import { initAdmin } from 'shared/init-admin'
import { log, writeAsync } from 'shared/utils'
import { visibility } from 'common/contract'

initAdmin()
const firestore = admin.firestore()

if (require.main === module) {
  async function backfillVisibilityFields() {
    const commentsRef = firestore.collectionGroup('comments')
    const commentsSnapshot = await commentsRef.get()
    console.log('Total comments:', commentsSnapshot.size)

    let batch = firestore.batch()
    let counter = 0

    for (const commentDoc of commentsSnapshot.docs) {
      const parentRef = commentDoc.ref.parent.parent
      const commentData = commentDoc.data()

      if (commentData.visibility) {
        // Skip comments that already have visibility field
        continue
      }

      if (!parentRef) {
        console.error(
          `Failed to get the parent document for comment: ${commentDoc.id}`
        )
        continue
      }

      const parentSnapshot = await parentRef.get()
      const parentData = parentSnapshot.data()
      const commentType = commentData.commentType

      let visibility: visibility | undefined

      if (commentType === 'group') {
        const privacyStatus = parentData?.privacyStatus
        visibility = privacyStatus === 'private' ? 'private' : 'public'
        console.log('groups', privacyStatus, visibility)
      } else if (commentType === 'contract' || commentType === 'contract') {
        visibility = parentData?.visibility ?? 'public'
        console.log('contracts/posts', visibility)
      }

      if (visibility) {
        batch.update(commentDoc.ref, { visibility })
        counter++

        if (counter === 500) {
          // Maximum batch size is 500 operations
          await batch.commit()
          batch = firestore.batch()
          counter = 0
        }
      }
    }

    if (counter > 0) {
      await batch.commit()
    }
    console.log('Processed comments count:', counter)
  }

  backfillVisibilityFields()
    .then(() => {
      console.log('Successfully backfilled visibility fields for comments.')
    })
    .catch((error) => {
      console.error('Failed to backfill visibility fields for comments:', error)
    })
}
