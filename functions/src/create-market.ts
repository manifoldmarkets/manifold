import * as admin from 'firebase-admin'
import { z } from 'zod'
import { FieldValue } from 'firebase-admin/firestore'
import { JSONContent } from '@tiptap/core'
import { uniq, zip } from 'lodash'

import {
  Contract,
  CPMMBinaryContract,
  FreeResponseContract,
  MAX_QUESTION_LENGTH,
  MAX_TAG_LENGTH,
  NumericContract,
  OUTCOME_TYPES,
  VISIBILITIES,
  DpmMultipleChoiceContract,
} from '../../common/contract'
import { slugify } from '../../common/util/slugify'
import { randomString } from '../../common/util/random'
import { getContract, htmlToRichText } from './utils'
import { APIError, AuthedUser, newEndpoint, validate, zTimestamp } from './api'
import { FIXED_ANTE } from '../../common/economy'
import {
  getCpmmInitialLiquidity,
  getFreeAnswerAnte,
  getMultipleChoiceAntes,
  getNumericAnte,
} from '../../common/antes'
import { Answer, getNoneAnswer } from '../../common/answer'
import { getNewContract } from '../../common/new-contract'
import { NUMERIC_BUCKET_COUNT } from '../../common/numeric-constants'
import { User } from '../../common/user'
import { Group, GroupLink, MAX_ID_LENGTH } from '../../common/group'
import { getPseudoProbability } from '../../common/pseudo-numeric'
import { getCloseDate, getGroupForMarket } from './helpers/openai-utils'
import { marked } from 'marked'
import { Bet } from 'common/bet'

const descSchema: z.ZodType<JSONContent> = z.lazy(() =>
  z.intersection(
    z.record(z.any()),
    z.object({
      type: z.string().optional(),
      attrs: z.record(z.any()).optional(),
      content: z.array(descSchema).optional(),
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
  description: descSchema.or(z.string()).optional(),
  descriptionHtml: z.string().optional(),
  descriptionMarkdown: z.string().optional(),
  tags: z.array(z.string().min(1).max(MAX_TAG_LENGTH)).optional(),
  closeTime: zTimestamp()
    .refine(
      (date) => date.getTime() > new Date().getTime(),
      'Close time must be in the future.'
    )
    .optional(),
  outcomeType: z.enum(OUTCOME_TYPES),
  groupId: z.string().min(1).max(MAX_ID_LENGTH).optional(),
  visibility: z.enum(VISIBILITIES).optional(),
  isTwitchContract: z.boolean().optional(),
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

export const createmarket = newEndpoint(
  { secrets: ['OPENAI_API_KEY'] },
  (req, auth) => {
    return createMarketHelper(req.body, auth)
  }
)

export async function createMarketHelper(body: any, auth: AuthedUser) {
  const {
    question,
    description,
    descriptionHtml,
    descriptionMarkdown,
    tags,
    closeTime,
    outcomeType,
    groupId,
    visibility = 'public',
    isTwitchContract,
  } = validate(bodySchema, body)

  let min, max, initialProb, isLogScale, answers

  if (outcomeType === 'PSEUDO_NUMERIC' || outcomeType === 'NUMERIC') {
    let initialValue
    ;({ min, max, initialValue, isLogScale } = validate(numericSchema, body))
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
    ;({ initialProb } = validate(binarySchema, body))
  }

  if (outcomeType === 'MULTIPLE_CHOICE') {
    ;({ answers } = validate(multipleChoiceSchema, body))
  }

  const userId = auth.uid

  let group: Group | null = null

  if (groupId) {
    const groupDocRef = firestore.collection('groups').doc(groupId)
    const groupDoc = await groupDocRef.get()
    if (!groupDoc.exists) {
      throw new APIError(400, 'No group exists with the given group ID.')
    }

    group = groupDoc.data() as Group
    const groupMembersSnap = await firestore
      .collection(`groups/${groupId}/groupMembers`)
      .get()
    const groupMemberDocs = groupMembersSnap.docs.map(
      (doc) => doc.data() as { userId: string; createdTime: number }
    )
    if (
      !groupMemberDocs.some((m) => m.userId === userId) &&
      !group.anyoneCanJoin &&
      group.creatorId !== userId
    ) {
      throw new APIError(
        400,
        'User must be a member/creator of the group or group must be open to add markets to it.'
      )
    }
  } else {
    // generate group using AI
    group = (await getGroupForMarket(question)) ?? null
  }

  const slug = await getSlug(question)
  const contractRef = firestore.collection('contracts').doc()

  // convert string descriptions into JSONContent
  let descriptionJson = null
  if (description) {
    if (typeof description === 'string') {
      descriptionJson = htmlToRichText(`<p>${description}</p>`)
    } else {
      descriptionJson = description
    }
  } else if (descriptionHtml) {
    descriptionJson = htmlToRichText(descriptionHtml)
  } else if (descriptionMarkdown) {
    descriptionJson = htmlToRichText(marked.parse(descriptionMarkdown))
  } else {
    // Use a single empty space as the description
    descriptionJson = htmlToRichText('<p> </p>')
  }

  const ante =
    outcomeType === 'BINARY'
      ? FIXED_ANTE
      : outcomeType === 'PSEUDO_NUMERIC'
      ? FIXED_ANTE * 5
      : FIXED_ANTE * 2

  const user = await firestore.runTransaction(async (trans) => {
    const userDoc = await trans.get(firestore.collection('users').doc(userId))
    if (!userDoc.exists)
      throw new APIError(400, 'No user exists with the authenticated user ID.')

    const user = userDoc.data() as User

    if (ante > user.balance)
      throw new APIError(400, `Balance must be at least ${ante}.`)

    trans.update(userDoc.ref, {
      balance: FieldValue.increment(-ante),
      totalDeposits: FieldValue.increment(-ante),
    })

    return user
  })

  const closeTimestamp = closeTime
    ? closeTime.getTime()
    : // Use AI to get date, default to one week after now if failure
      (await getCloseDate(question)) ?? Date.now() + 7 * 24 * 60 * 60 * 1000

  const contract = getNewContract(
    contractRef.id,
    slug,
    user,
    question,
    outcomeType,
    descriptionJson,
    initialProb ?? 0,
    ante,
    closeTimestamp,
    tags ?? [],
    NUMERIC_BUCKET_COUNT,
    min ?? 0,
    max ?? 0,
    isLogScale ?? false,
    answers ?? [],
    visibility,
    isTwitchContract ? true : undefined
  )

  await contractRef.create(contract)

  console.log(
    'created contract for',
    user.username,
    'on',
    question,
    'ante:',
    ante || 0
  )

  if (group != null) {
    const groupContractsSnap = await firestore
      .collection(`groups/${groupId}/groupContracts`)
      .get()

    const groupContracts = groupContractsSnap.docs.map(
      (doc) => doc.data() as { contractId: string; createdTime: number }
    )

    if (!groupContracts.some((c) => c.contractId === contractRef.id)) {
      await createGroupLinks(group, [contractRef.id], auth.uid)

      const groupContractRef = firestore
        .collection(`groups/${groupId}/groupContracts`)
        .doc(contract.id)

      await groupContractRef.set({
        contractId: contract.id,
        createdTime: Date.now(),
      })
    }
  }

  const providerId = userId

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
      contract as DpmMultipleChoiceContract,
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
}

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

async function createGroupLinks(
  group: Group,
  contractIds: string[],
  userId: string
) {
  for (const contractId of contractIds) {
    const contract = await getContract(contractId)
    if (!contract?.groupSlugs?.includes(group.slug)) {
      await firestore
        .collection('contracts')
        .doc(contractId)
        .update({
          groupSlugs: uniq([group.slug, ...(contract?.groupSlugs ?? [])]),
        })
    }
    if (!contract?.groupLinks?.some((gl) => gl.groupId === group.id)) {
      await firestore
        .collection('contracts')
        .doc(contractId)
        .update({
          groupLinks: [
            {
              groupId: group.id,
              name: group.name,
              slug: group.slug,
              userId,
              createdTime: Date.now(),
            } as GroupLink,
            ...(contract?.groupLinks ?? []),
          ],
        })
    }
  }
}
