import { JSONContent } from '@tiptap/core'
import * as admin from 'firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'
import { uniq, zip } from 'lodash'
import { z } from 'zod'

import { Answer, getNoneAnswer } from 'common/answer'
import {
  getCpmmInitialLiquidity,
  getFreeAnswerAnte,
  getMultipleChoiceAntes,
  getNumericAnte,
} from 'common/antes'
import { Bet } from 'common/bet'
import {
  Contract,
  CPMMBinaryContract,
  DpmMultipleChoiceContract,
  FreeResponseContract,
  MAX_QUESTION_LENGTH,
  MAX_TAG_LENGTH,
  NumericContract,
  OUTCOME_TYPES,
  VISIBILITIES,
} from 'common/contract'
import { ANTES } from 'common/economy'
import { isAdmin, isManifoldId } from 'common/envs/constants'
import { Group, GroupLink, MAX_ID_LENGTH } from 'common/group'
import { getNewContract } from 'common/new-contract'
import { NUMERIC_BUCKET_COUNT } from 'common/numeric-constants'
import { getPseudoProbability } from 'common/pseudo-numeric'
import { QfAddPoolTxn } from 'common/txn'
import { User } from 'common/user'
import { randomString } from 'common/util/random'
import { slugify } from 'common/util/slugify'
import { marked } from 'marked'
import { mintAndPoolCert } from 'shared/helpers/cert-txns'
import { getCloseDate } from 'shared/helpers/openai-utils'
import { getContract, htmlToRichText } from 'shared/utils'
import { canUserAddGroupToMarket } from './add-contract-to-group'
import { APIError, AuthedUser, authEndpoint, validate } from './helpers'

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
  closeTime: z
    .union([z.date(), z.number()])
    .refine(
      (date) => (typeof date === 'number' ? date : date.getTime()) > Date.now(),
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

type schema = z.infer<typeof bodySchema> &
  (z.infer<typeof binarySchema> | {}) &
  (z.infer<typeof numericSchema> | {}) &
  (z.infer<typeof multipleChoiceSchema> | {})

export const createmarket = authEndpoint(async (req, auth) => {
  return createMarketHelper(req.body, auth)
})

export async function createMarketHelper(body: schema, auth: AuthedUser) {
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

  if (visibility == 'private') {
    if (!groupId) {
      throw new APIError(
        400,
        'Private markets cannot exist outside a private group.'
      )
    }
  }

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
    const firebaseUser = await admin.auth().getUser(auth.uid)
    if (!groupDoc.exists) {
      throw new APIError(400, 'No group exists with the given group ID.')
    }

    group = groupDoc.data() as Group
    const groupMembersSnap = await firestore
      .collection(`groups/${groupId}/groupMembers`)
      .get()
    const groupMemberDocs = groupMembersSnap.docs.map(
      (doc) =>
        doc.data() as { userId: string; createdTime: number; role?: string }
    )
    const userGroupMemberDoc = groupMemberDocs.filter(
      (m) => m.userId === userId
    )
    const groupMemberRole =
      userGroupMemberDoc.length >= 1
        ? userGroupMemberDoc[0].role
          ? (userGroupMemberDoc[0].role as 'admin' | 'moderator')
          : undefined
        : undefined

    if (
      (group.privacyStatus == 'private' && visibility != 'private') ||
      (group.privacyStatus != 'private' && visibility == 'private')
    ) {
      throw new APIError(
        400,
        `Both "${group.name}" and market must be of the same private visibility.`
      )
    }
    if (
      !canUserAddGroupToMarket({
        userId: auth.uid,
        group: group,
        isMarketCreator: true,
        isManifoldAdmin: isManifoldId(auth.uid) || isAdmin(firebaseUser.email),
        userGroupRole: groupMemberRole,
      })
    ) {
      throw new APIError(
        400,
        `User does not have permission to add this market to group "${group.name}".`
      )
    }
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

  const ante = ANTES[outcomeType]

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
    ? typeof closeTime === 'number'
      ? closeTime
      : closeTime.getTime()
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
  } else if (outcomeType === 'CERT') {
    const DEFAULT_SHARES = 10_000
    // Unlike other contracts which initializing info into the contract's doc or subcollection,
    // certs have the mint and pool specified in txn
    await mintAndPoolCert(providerId, contract.id, DEFAULT_SHARES, ante)
  } else if (outcomeType === 'QUADRATIC_FUNDING') {
    const txnDoc = firestore.collection('txns').doc()
    const txn: QfAddPoolTxn = {
      id: txnDoc.id,
      category: 'QF_ADD_POOL',
      createdTime: Date.now(),
      fromId: providerId,
      fromType: 'USER',
      toId: contract.id,
      toType: 'CONTRACT',
      amount: ante,
      token: 'M$',
      qfId: contract.id,
    }
    await txnDoc.set(txn)
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
