import * as admin from 'firebase-admin'
import { z } from 'zod'

import {
  Contract,
  CPMMBinaryContract,
  FreeResponseContract,
  MAX_QUESTION_LENGTH,
  MAX_TAG_LENGTH,
  MultipleChoiceContract,
  NumericContract,
  OUTCOME_TYPES,
} from '../../common/contract'
import { slugify } from '../../common/util/slugify'
import { randomString } from '../../common/util/random'

import { chargeUser } from './utils'
import { APIError, newEndpoint, validate, zTimestamp } from './api'

import {
  FIXED_ANTE,
  getCpmmInitialLiquidity,
  getFreeAnswerAnte,
  getMultipleChoiceAntes,
  getNumericAnte,
} from '../../common/antes'
import { Answer, getNoneAnswer } from '../../common/answer'
import { getNewContract } from '../../common/new-contract'
import { NUMERIC_BUCKET_COUNT } from '../../common/numeric-constants'
import { User } from '../../common/user'
import { Group, MAX_ID_LENGTH } from '../../common/group'
import { getPseudoProbability } from '../../common/pseudo-numeric'
import { JSONContent } from '@tiptap/core'
import { zip } from 'lodash'
import { Bet } from 'common/bet'

const descScehma: z.ZodType<JSONContent> = z.lazy(() =>
  z.intersection(
    z.record(z.any()),
    z.object({
      type: z.string().optional(),
      attrs: z.record(z.any()).optional(),
      content: z.array(descScehma).optional(),
      marks: z
        .array(
          z.intersection(
            z.record(z.any()),
            z.object({
              type: z.string(),
              attrs: z.record(z.any()).optional(),
            })
          )
        )
        .optional(),
      text: z.string().optional(),
    })
  )
)

const bodySchema = z.object({
  question: z.string().min(1).max(MAX_QUESTION_LENGTH),
  description: descScehma.optional(),
  tags: z.array(z.string().min(1).max(MAX_TAG_LENGTH)).optional(),
  closeTime: zTimestamp().refine(
    (date) => date.getTime() > new Date().getTime(),
    'Close time must be in the future.'
  ),
  outcomeType: z.enum(OUTCOME_TYPES),
  groupId: z.string().min(1).max(MAX_ID_LENGTH).optional(),
})

const binarySchema = z.object({
  initialProb: z.number().min(1).max(99),
})

const finite = () =>
  z.number().gte(Number.MIN_SAFE_INTEGER).lte(Number.MAX_SAFE_INTEGER)

const numericSchema = z.object({
  min: finite(),
  max: finite(),
  initialValue: finite(),
  isLogScale: z.boolean().optional(),
})

const multipleChoiceSchema = z.object({
  answers: z.string().trim().min(1).array().min(2),
})

export const createmarket = newEndpoint({}, async (req, auth) => {
  const { question, description, tags, closeTime, outcomeType, groupId } =
    validate(bodySchema, req.body)

  let min, max, initialProb, isLogScale, answers

  if (outcomeType === 'PSEUDO_NUMERIC' || outcomeType === 'NUMERIC') {
    let initialValue
    ;({ min, max, initialValue, isLogScale } = validate(
      numericSchema,
      req.body
    ))
    if (max - min <= 0.01 || initialValue <= min || initialValue >= max)
      throw new APIError(400, 'Invalid range.')

    initialProb = getPseudoProbability(initialValue, min, max, isLogScale) * 100

    if (initialProb < 1 || initialProb > 99)
      if (outcomeType === 'PSEUDO_NUMERIC')
        throw new APIError(
          400,
          `Initial value is too ${initialProb < 1 ? 'low' : 'high'}`
        )
      else throw new APIError(400, 'Invalid initial probability.')
  }

  if (outcomeType === 'BINARY') {
    ;({ initialProb } = validate(binarySchema, req.body))
  }

  if (outcomeType === 'MULTIPLE_CHOICE') {
    ;({ answers } = validate(multipleChoiceSchema, req.body))
  }

  const userDoc = await firestore.collection('users').doc(auth.uid).get()
  if (!userDoc.exists) {
    throw new APIError(400, 'No user exists with the authenticated user ID.')
  }
  const user = userDoc.data() as User

  const ante = FIXED_ANTE

  // TODO: this is broken because it's not in a transaction
  if (ante > user.balance)
    throw new APIError(400, `Balance must be at least ${ante}.`)

  const slug = await getSlug(question)
  const contractRef = firestore.collection('contracts').doc()

  let group = null
  if (groupId) {
    const groupDocRef = firestore.collection('groups').doc(groupId)
    const groupDoc = await groupDocRef.get()
    if (!groupDoc.exists) {
      throw new APIError(400, 'No group exists with the given group ID.')
    }

    group = groupDoc.data() as Group
    if (!group.memberIds.includes(user.id)) {
      throw new APIError(
        400,
        'User must be a member of the group to add markets to it.'
      )
    }
    if (!group.contractIds.includes(contractRef.id))
      await groupDocRef.update({
        contractIds: [...group.contractIds, contractRef.id],
      })
  }

  console.log(
    'creating contract for',
    user.username,
    'on',
    question,
    'ante:',
    ante || 0
  )

  const contract = getNewContract(
    contractRef.id,
    slug,
    user,
    question,
    outcomeType,
    description ?? {},
    initialProb ?? 0,
    ante,
    closeTime.getTime(),
    tags ?? [],
    NUMERIC_BUCKET_COUNT,
    min ?? 0,
    max ?? 0,
    isLogScale ?? false,
    answers ?? []
  )

  if (ante) await chargeUser(user.id, ante, true)

  await contractRef.create(contract)

  const providerId = user.id

  if (outcomeType === 'BINARY' || outcomeType === 'PSEUDO_NUMERIC') {
    const liquidityDoc = firestore
      .collection(`contracts/${contract.id}/liquidity`)
      .doc()

    const lp = getCpmmInitialLiquidity(
      providerId,
      contract as CPMMBinaryContract,
      liquidityDoc.id,
      ante
    )

    await liquidityDoc.set(lp)
  } else if (outcomeType === 'MULTIPLE_CHOICE') {
    const betCol = firestore.collection(`contracts/${contract.id}/bets`)
    const betDocs = (answers ?? []).map(() => betCol.doc())

    const answerCol = firestore.collection(`contracts/${contract.id}/answers`)
    const answerDocs = (answers ?? []).map((_, i) =>
      answerCol.doc(i.toString())
    )

    const { bets, answerObjects } = getMultipleChoiceAntes(
      user,
      contract as MultipleChoiceContract,
      answers ?? [],
      betDocs.map((bd) => bd.id)
    )

    await Promise.all(
      zip(bets, betDocs).map(([bet, doc]) => doc?.create(bet as Bet))
    )
    await Promise.all(
      zip(answerObjects, answerDocs).map(([answer, doc]) =>
        doc?.create(answer as Answer)
      )
    )
    await contractRef.update({ answers: answerObjects })
  } else if (outcomeType === 'FREE_RESPONSE') {
    const noneAnswerDoc = firestore
      .collection(`contracts/${contract.id}/answers`)
      .doc('0')

    const noneAnswer = getNoneAnswer(contract.id, user)
    await noneAnswerDoc.set(noneAnswer)

    const anteBetDoc = firestore
      .collection(`contracts/${contract.id}/bets`)
      .doc()

    const anteBet = getFreeAnswerAnte(
      providerId,
      contract as FreeResponseContract,
      anteBetDoc.id
    )
    await anteBetDoc.set(anteBet)
  } else if (outcomeType === 'NUMERIC') {
    const anteBetDoc = firestore
      .collection(`contracts/${contract.id}/bets`)
      .doc()

    const anteBet = getNumericAnte(
      providerId,
      contract as NumericContract,
      ante,
      anteBetDoc.id
    )

    await anteBetDoc.set(anteBet)
  }

  return contract
})

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
