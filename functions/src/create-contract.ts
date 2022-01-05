import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'

import { randomString } from './util/random-string'
import { slugify } from './util/slugify'
import { Contract } from './types/contract'
import { getUser } from './utils'
import { payUser } from '.'
import { User } from './types/user'

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

      if (ante !== undefined && (ante < 0 || ante > creator.balance))
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

      if (ante) await payUser([creator.id, -ante])

      await contractRef.create(contract)
      return { status: 'success', contract }
    }
  )

const getSlug = async (question: string) => {
  const proposedSlug = slugify(question).substring(0, 35)

  const preexistingContract = await getContractFromSlug(proposedSlug)

  return preexistingContract
    ? proposedSlug + '-' + randomString()
    : proposedSlug
}

function getNewContract(
  id: string,
  slug: string,
  creator: User,
  question: string,
  description: string,
  initialProb: number,
  ante?: number,
  closeTime?: number
) {
  const { startYes, startNo, poolYes, poolNo } = calcStartPool(
    initialProb,
    ante
  )

  const contract: Contract = {
    id,
    slug,
    outcomeType: 'BINARY',

    creatorId: creator.id,
    creatorName: creator.name,
    creatorUsername: creator.username,

    question: question.trim(),
    description: description.trim(),

    startPool: { YES: startYes, NO: startNo },
    pool: { YES: poolYes, NO: poolNo },
    totalShares: { YES: 0, NO: 0 },
    totalBets: { YES: 0, NO: 0 },
    isResolved: false,

    createdTime: Date.now(),
    lastUpdatedTime: Date.now(),
  }

  if (closeTime) contract.closeTime = closeTime

  return contract
}

const calcStartPool = (
  initialProbInt: number,
  ante?: number,
  phantomAnte = 200
) => {
  const p = initialProbInt / 100.0
  const totalAnte = phantomAnte + (ante || 0)

  const poolYes =
    p === 0.5
      ? p * totalAnte
      : -(totalAnte * (-p + Math.sqrt((-1 + p) * -p))) / (-1 + 2 * p)

  const poolNo = totalAnte - poolYes

  const f = phantomAnte / totalAnte
  const startYes = f * poolYes
  const startNo = f * poolNo

  return { startYes, startNo, poolYes, poolNo }
}

const firestore = admin.firestore()

export async function getContractFromSlug(slug: string) {
  const snap = await firestore
    .collection('contracts')
    .where('slug', '==', slug)
    .get()

  return snap.empty ? undefined : (snap.docs[0].data() as Contract)
}
