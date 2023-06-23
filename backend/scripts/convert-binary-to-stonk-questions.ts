import { initAdmin } from 'shared/init-admin'
import * as admin from 'firebase-admin'
import { richTextToString } from 'common/util/parse'
import { BinaryContract } from 'common/contract'
import { uniqBy } from 'lodash'
import { DAY_MS } from 'common/util/time'
initAdmin()

const firestore = admin.firestore()

export const convertBinaryToStonkQuestions = async () => {
  try {
    console.log('Starting conversion of binary questions to stonk questions.')
    // get all binary questions
    const questionsSnap = await firestore
      .collection('contracts')
      .where('outcomeType', '==', 'BINARY')
      .where('isResolved', '==', false)
      .get()
    const binaryQuestions = questionsSnap.docs.map(
      (doc) => doc.data() as BinaryContract
    )
    // const contract = await getContract('F3KkEuwxBGAg6hCg3Wrj')
    // if (!contract) {
    //   console.error('Could not find contract.')
    //   return
    // }
    // const binaryQuestions = [contract]

    console.log(`Found ${binaryQuestions.length} binary questions.`)
    // filter for questions that have stock and (permanent) in the name
    const questionsWithStockTitle = binaryQuestions.filter((question) => {
      const question = question.question.toLowerCase()
      return question.includes('stock') && question.includes('permanent')
    })
    console.log(
      `Found ${questionsWithStockTitle.length} questions with the right title.`
    )
    const questionsWithStockDescription = binaryQuestions.filter((question) => {
      const desc = question.description
      const stringDesc =
        typeof desc === 'string'
          ? desc.toLowerCase()
          : richTextToString(desc).toLowerCase()
      return (
        stringDesc.includes('permanent question') ||
        stringDesc.includes('permanent stock') ||
        stringDesc.includes('yes = buy') ||
        stringDesc.includes(
          'this is a permanent question and its duration will be lengthened as long as'
        )
      )
    })
    console.log(
      `Found ${questionsWithStockDescription.length} questions with the right description.`
    )

    // combine them uniquely via id
    const uniqQuestionsToConvert = uniqBy(
      [...questionsWithStockTitle, ...questionsWithStockDescription],
      'id'
    )
    console.log(
      `Found ${uniqQuestionsToConvert.length} questions to convert without filtering.`
    )
    const slugsToIgnore = [
      'will-qorantos-stock-permanent-reach',
      'will-any-permanent-stock-with-at-le',
      'manifold-bans-permanent-stock-marke',
      'smeth-stock-hopefully-not-permanent',
      'fancysloth-stock-hopefully-not-perm',
      'will-a-crazy-sexual-partner-of-dest',
    ]
    const questionsToConvert = uniqQuestionsToConvert.filter(
      (question) => !slugsToIgnore.includes(question.slug)
    )
    console.log(`Found ${questionsToConvert.length} questions to convert.`)
    await Promise.all(
      questionsToConvert.map((question) => {
        return firestore
          .collection('contracts')
          .doc(question.id)
          .update({
            outcomeType: 'STONK',
            closeTime: Date.now() + DAY_MS * 365 * 1000,
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
