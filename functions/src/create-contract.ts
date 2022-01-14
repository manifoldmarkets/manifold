import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'

import { chargeUser, getUser } from './utils'
import { Contract } from '../../common/contract'
import { slugify } from '../../common/util/slugify'
import { randomString } from '../../common/util/random-string'
import { getNewContract } from '../../common/new-contract'
import { getAnteBets, MINIMUM_ANTE } from '../../common/antes'

export const createContract = functions
  .runWith({ minInstances: 1 })
  .https.onCall(
    async (
      data: {
        question: string
        description: string
        initialProb: number
        ante?: number
        closeTime?: number
      },
      context
    ) => {
      const userId = context?.auth?.uid
      if (!userId) return { status: 'error', message: 'Not authorized' }

      const creator = await getUser(userId)
      if (!creator) return { status: 'error', message: 'User not found' }

      const { question, description, initialProb, ante, closeTime } = data

      if (!question || !initialProb)
        return { status: 'error', message: 'Missing contract attributes' }

      if (initialProb < 1 || initialProb > 99)
        return { status: 'error', message: 'Invalid initial probability' }

      if (
        ante === undefined ||
        ante < MINIMUM_ANTE ||
        ante > creator.balance ||
        isNaN(ante) ||
        !isFinite(ante)
      )
        return { status: 'error', message: 'Invalid ante' }

      console.log(
        'creating contract for',
        creator.username,
        'on',
        question,
        'ante:',
        ante || 0
      )

      const slug = await getSlug(question)

      const contractRef = firestore.collection('contracts').doc()

      const contract = getNewContract(
        contractRef.id,
        slug,
        creator,
        question,
        description,
        initialProb,
        ante,
        closeTime
      )

      if (ante) await chargeUser(creator.id, ante)

      await contractRef.create(contract)

      if (ante) {
        const yesBetDoc = firestore
          .collection(`contracts/${contract.id}/bets`)
          .doc()

        const noBetDoc = firestore
          .collection(`contracts/${contract.id}/bets`)
          .doc()

        const { yesBet, noBet } = getAnteBets(
          creator,
          contract,
          yesBetDoc.id,
          noBetDoc.id
        )
        await yesBetDoc.set(yesBet)
        await noBetDoc.set(noBet)
      }

      return { status: 'success', contract }
    }
  )

const getSlug = async (question: string) => {
  const proposedSlug = slugify(question)

  const preexistingContract = await getContractFromSlug(proposedSlug)

  return preexistingContract
    ? proposedSlug + '-' + randomString()
    : proposedSlug
}

const firestore = admin.firestore()

export async function getContractFromSlug(slug: string) {
  const snap = await firestore
    .collection('contracts')
    .where('slug', '==', slug)
    .get()

  return snap.empty ? undefined : (snap.docs[0].data() as Contract)
}
