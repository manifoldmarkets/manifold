import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import * as _ from 'lodash'

import { chargeUser, getUser } from './utils'
import {
  Binary,
  Contract,
  CPMM,
  DPM,
  FreeResponse,
  FullContract,
  MAX_DESCRIPTION_LENGTH,
  MAX_QUESTION_LENGTH,
  MAX_TAG_LENGTH,
  outcomeType,
} from '../../common/contract'
import { slugify } from '../../common/util/slugify'
import { randomString } from '../../common/util/random'
import { getNewContract } from '../../common/new-contract'
import {
  FIXED_ANTE,
  getAnteBets,
  getCpmmInitialLiquidity,
  getFreeAnswerAnte,
  HOUSE_LIQUIDITY_PROVIDER_ID,
  MINIMUM_ANTE,
} from '../../common/antes'
import { getNoneAnswer } from '../../common/answer'

export const createContract = functions
  .runWith({ minInstances: 1 })
  .https.onCall(
    async (
      data: {
        question: string
        outcomeType: outcomeType
        description: string
        initialProb: number
        ante: number
        closeTime: number
        tags?: string[]
      },
      context
    ) => {
      const userId = context?.auth?.uid
      if (!userId) return { status: 'error', message: 'Not authorized' }

      const creator = await getUser(userId)
      if (!creator) return { status: 'error', message: 'User not found' }

      let { question, description, initialProb, closeTime, tags } = data

      if (!question || typeof question != 'string')
        return { status: 'error', message: 'Missing or invalid question field' }
      question = question.slice(0, MAX_QUESTION_LENGTH)

      if (typeof description !== 'string')
        return { status: 'error', message: 'Invalid description field' }
      description = description.slice(0, MAX_DESCRIPTION_LENGTH)

      if (tags !== undefined && !_.isArray(tags))
        return { status: 'error', message: 'Invalid tags field' }
      tags = tags?.map((tag) => tag.toString().slice(0, MAX_TAG_LENGTH))

      let outcomeType = data.outcomeType ?? 'BINARY'
      if (!['BINARY', 'MULTI', 'FREE_RESPONSE'].includes(outcomeType))
        return { status: 'error', message: 'Invalid outcomeType' }

      if (
        outcomeType === 'BINARY' &&
        (!initialProb || initialProb < 1 || initialProb > 99)
      )
        return { status: 'error', message: 'Invalid initial probability' }

      const ante = FIXED_ANTE // data.ante
      // uses utc time on server:
      const today = new Date().setHours(0, 0, 0, 0)
      const userContractsCreatedTodaySnapshot = await firestore
        .collection(`contracts`)
        .where('creatorId', '==', userId)
        .where('createdTime', '>=', today)
        .get()
      const isFree = userContractsCreatedTodaySnapshot.size === 0

      if (
        ante === undefined ||
        ante < MINIMUM_ANTE ||
        (ante > creator.balance && !isFree) ||
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
        outcomeType,
        description,
        initialProb,
        ante,
        closeTime,
        tags ?? []
      )

      if (!isFree && ante) await chargeUser(creator.id, ante)

      await contractRef.create(contract)

      if (ante) {
        if (outcomeType === 'BINARY' && contract.mechanism === 'dpm-2') {
          const yesBetDoc = firestore
            .collection(`contracts/${contract.id}/bets`)
            .doc()

          const noBetDoc = firestore
            .collection(`contracts/${contract.id}/bets`)
            .doc()

          const { yesBet, noBet } = getAnteBets(
            creator,
            contract as FullContract<DPM, Binary>,
            yesBetDoc.id,
            noBetDoc.id
          )

          await yesBetDoc.set(yesBet)
          await noBetDoc.set(noBet)
        } else if (outcomeType === 'BINARY') {
          const liquidityDoc = firestore
            .collection(`contracts/${contract.id}/liquidity`)
            .doc()

          const providerId = isFree ? HOUSE_LIQUIDITY_PROVIDER_ID : creator.id

          const lp = getCpmmInitialLiquidity(
            providerId,
            contract as FullContract<CPMM, Binary>,
            liquidityDoc.id,
            ante
          )

          await liquidityDoc.set(lp)
        } else if (outcomeType === 'FREE_RESPONSE') {
          const noneAnswerDoc = firestore
            .collection(`contracts/${contract.id}/answers`)
            .doc('0')

          const noneAnswer = getNoneAnswer(contract.id, creator)
          await noneAnswerDoc.set(noneAnswer)

          const anteBetDoc = firestore
            .collection(`contracts/${contract.id}/bets`)
            .doc()

          const anteBet = getFreeAnswerAnte(
            creator,
            contract as FullContract<DPM, FreeResponse>,
            anteBetDoc.id
          )
          await anteBetDoc.set(anteBet)
        }
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
