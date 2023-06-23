import { initAdmin } from 'shared/init-admin'
import * as admin from 'firebase-admin'
import { StonkContract } from 'common/contract'
initAdmin()

const firestore = admin.firestore()

export const convertBinaryToStonkQuestions = async () => {
  try {
    console.log('Starting conversion of binary questions to stonk questions.')
    const creatorId = 'y1hb6k7txdZPV5mgyxPFApZ7nQl2'

    const questionsSnap = await firestore
      .collection('contracts')
      .where('outcomeType', '==', 'STONK')
      .where('isResolved', '==', false)
      .where('creatorId', '==', creatorId)
      .get()
    const questionsToConvert = questionsSnap.docs.map(
      (doc) => doc.data() as StonkContract
    )

    console.log(`Found ${questionsToConvert.length} questions to convert.`)
    await Promise.all(
      questionsToConvert.map((question) => {
        return firestore.collection('contracts').doc(question.id).update({
          outcomeType: 'BINARY',
        })
      })
    )
  } catch (e) {
    console.error(e)
  }
}

if (require.main === module) {
  convertBinaryToStonkQuestions()
    .catch((e) => {
      console.error(e)
      process.exit(1)
    })
    .then(() => process.exit())
}
