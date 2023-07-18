import * as admin from 'firebase-admin'
import { JSONContent } from '@tiptap/core'
import { FieldValue, Transaction } from 'firebase-admin/firestore'
import { z } from 'zod'
import { marked } from 'marked'
import { runPostBountyTxn } from 'shared/txn/run-bounty-txn'

import {
  Answer,
  MULTIPLE_CHOICE_MAX_ANSWERS,
  getNoneAnswer,
} from 'common/answer'
import {
  getCpmmInitialLiquidity,
  getFreeAnswerAnte,
  getNumericAnte,
} from 'common/antes'
import {
  Contract,
  CPMMBinaryContract,
  CPMMMultiContract,
  FreeResponseContract,
  MAX_QUESTION_LENGTH,
  NumericContract,
  OUTCOME_TYPES,
  PollContract,
  VISIBILITIES,
} from 'common/contract'
import { getAnte } from 'common/economy'
import { MAX_ID_LENGTH } from 'common/group'
import { getNewContract } from 'common/new-contract'
import { NUMERIC_BUCKET_COUNT } from 'common/numeric-constants'
import { getPseudoProbability } from 'common/pseudo-numeric'
import { QfAddPoolTxn } from 'common/txn'
import { User } from 'common/user'
import { randomString } from 'common/util/random'
import { slugify } from 'common/util/slugify'
import { mintAndPoolCert } from 'shared/helpers/cert-txns'
import { generateEmbeddings, getCloseDate } from 'shared/helpers/openai-utils'
import { getUser, htmlToRichText } from 'shared/utils'
import { canUserAddGroupToMarket } from './add-contract-to-group'
import { APIError, AuthedUser, authEndpoint, validate } from './helpers'
import { STONK_INITIAL_PROB } from 'common/stonk'
import { createSupabaseClient } from 'shared/supabase/init'
import { contentSchema } from 'shared/zod-types'
import { createNewContractFromPrivateGroupNotification } from 'shared/create-notification'
import { addGroupToContract } from 'shared/update-group-contracts-internal'
import { getMultiCpmmLiquidity } from 'common/calculate-cpmm'
import { PollOption } from 'common/poll-option'

export const createmarket = authEndpoint(async (req, auth) => {
  return createMarketHelper(req.body, auth)
})

export async function createMarketHelper(body: schema, auth: AuthedUser) {
  const {
    question,
    description,
    descriptionHtml,
    descriptionMarkdown,
    closeTime,
    outcomeType,
    groupId,
    visibility,
    isTwitchContract,
    utcOffset,
    min,
    max,
    initialProb,
    isLogScale,
    answers,
    shouldAnswersSumToOne,
    totalBounty,
  } = validateMarketBody(body)

  const userId = auth.uid

  let group = groupId ? await getGroup(groupId, visibility, userId) : null

  const contractRef = firestore.collection('contracts').doc()

  const ante = getAnte(outcomeType, answers?.length, visibility === 'private')

  const closeTimestamp = await getCloseTimestamp(closeTime, question, utcOffset)

  const { user, contract } = await firestore.runTransaction(async (trans) => {
    const userDoc = await trans.get(firestore.collection('users').doc(userId))
    if (!userDoc.exists)
      throw new APIError(400, 'No user exists with the authenticated user ID.')

    const user = userDoc.data() as User

    if (user.isBannedFromPosting)
      throw new APIError(400, 'User banned from creating markets.')

    if (ante > user.balance)
      throw new APIError(400, `Balance must be at least ${ante}.`)

    const slug = await getSlug(trans, question)

    const contract = getNewContract(
      contractRef.id,
      slug,
      user,
      question,
      outcomeType,
      getDescriptionJson(description, descriptionHtml, descriptionMarkdown),
      initialProb ?? 0,
      ante,
      closeTimestamp,
      visibility,
      isTwitchContract ? true : undefined,
      NUMERIC_BUCKET_COUNT,
      min ?? 0,
      max ?? 0,
      isLogScale ?? false,
      shouldAnswersSumToOne,
      answers ?? []
    )

    trans.create(contractRef, contract)

    if (!totalBounty) {
      trans.update(userDoc.ref, {
        balance: FieldValue.increment(-ante),
        totalDeposits: FieldValue.increment(-ante),
      })
    }

    if (totalBounty && totalBounty > 0) {
      if (totalBounty > user.balance)
        throw new APIError(400, `Balance must be at least ${totalBounty}.`)
      const { status, txn } = await runPostBountyTxn(
        trans,
        {
          fromId: userId,
          fromType: 'USER',
          toId: contract.id,
          toType: 'CONTRACT',
          amount: totalBounty,
          token: 'M$',
          category: 'BOUNTY_POSTED',
        },
        contractRef,
        userDoc.ref
      )
    }

    return { user, contract }
  })

  console.log(
    'created contract for',
    user.username,
    'on',
    question,
    'ante:',
    ante || 0
  )

  if (group) {
    await addGroupToContract(contract, group)
    if (contract.visibility == 'private') {
      const contractCreator = await getUser(contract.creatorId)
      if (!contractCreator) throw new Error('Could not find contract creator')
      await createNewContractFromPrivateGroupNotification(
        contractCreator,
        contract,
        group
      )
    }
  }

  if (answers && contract.mechanism === 'cpmm-multi-1')
    await createAnswers(user, contract, ante, answers)

  await generateAntes(userId, user, contract, outcomeType, ante)

  await generateContractEmbeddings(contract)

  return contract
}

const generateContractEmbeddings = async (contract: Contract) => {
  const embedding = await generateEmbeddings(contract.question)
  if (!embedding) return

  await createSupabaseClient()
    .from('contract_embeddings')
    .insert({ contract_id: contract.id, embedding: embedding as any })
}

function getDescriptionJson(
  description?: string | JSONContent,
  descriptionHtml?: string,
  descriptionMarkdown?: string
): JSONContent {
  if (description) {
    if (typeof description === 'string') {
      return htmlToRichText(`<p>${description}</p>`)
    } else {
      return description
    }
  } else if (descriptionHtml) {
    return htmlToRichText(descriptionHtml)
  } else if (descriptionMarkdown) {
    return htmlToRichText(marked.parse(descriptionMarkdown))
  } else {
    // Use a single empty space as the description
    return htmlToRichText('<p> </p>')
  }
}

async function getCloseTimestamp(
  closeTime: number | Date | undefined,
  question: string,
  utcOffset?: number
): Promise<number> {
  return closeTime
    ? typeof closeTime === 'number'
      ? closeTime
      : closeTime.getTime()
    : (await getCloseDate(question, utcOffset)) ??
        Date.now() + 7 * 24 * 60 * 60 * 1000
}

const getSlug = async (trans: Transaction, question: string) => {
  const proposedSlug = slugify(question)

  const preexistingContract = await getContractFromSlug(trans, proposedSlug)

  return preexistingContract
    ? proposedSlug + '-' + randomString()
    : proposedSlug
}

const firestore = admin.firestore()

async function getContractFromSlug(trans: Transaction, slug: string) {
  const contractsRef = firestore.collection('contracts')
  const query = contractsRef.where('slug', '==', slug)

  const snap = await trans.get(query)

  return snap.empty ? undefined : (snap.docs[0].data() as Contract)
}

function validateMarketBody(body: any) {
  const {
    question,
    description,
    descriptionHtml,
    descriptionMarkdown,
    closeTime,
    outcomeType,
    groupId,
    visibility = 'public',
    isTwitchContract,
    utcOffset,
  } = validate(bodySchema, body)

  let min: number | undefined,
    max: number | undefined,
    initialProb: number | undefined,
    isLogScale: boolean | undefined,
    answers: string[] | undefined,
    shouldAnswersSumToOne: boolean | undefined,
    totalBounty: number | undefined

  if (visibility == 'private' && !groupId) {
    throw new APIError(
      400,
      'Private markets cannot exist outside a private group.'
    )
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
  if (outcomeType === 'STONK') {
    initialProb = STONK_INITIAL_PROB
  }

  if (outcomeType === 'BINARY') {
    ;({ initialProb } = validate(binarySchema, body))
  }

  if (outcomeType === 'MULTIPLE_CHOICE') {
    ;({ answers, shouldAnswersSumToOne } = validate(multipleChoiceSchema, body))
    if (shouldAnswersSumToOne === false)
      throw new APIError(
        400,
        'Multiple choice answers that do not sum to one are not implemented.'
      )
  }

  if (outcomeType === 'BOUNTIED_QUESTION') {
    ;({ totalBounty } = validate(bountiedQuestionSchema, body))
  }
  return {
    question,
    description,
    descriptionHtml,
    descriptionMarkdown,
    closeTime,
    outcomeType,
    groupId,
    visibility,
    isTwitchContract,
    utcOffset,
    min,
    max,
    initialProb,
    isLogScale,
    answers,
    shouldAnswersSumToOne,
    totalBounty,
  }
}

async function getGroup(groupId: string, visibility: string, userId: string) {
  const db = createSupabaseClient()

  const groupQuery = await db.from('groups').select().eq('id', groupId).limit(1)
  if (groupQuery.error) throw new APIError(500, groupQuery.error.message)
  if (!groupQuery.data.length) {
    throw new APIError(404, 'No group exists with the given group ID.')
  }
  const group = groupQuery.data[0]

  const membershipQuery = await db
    .from('group_members')
    .select()
    .eq('member_id', userId)
    .eq('group_id', groupId)
    .limit(1)
  const membership = membershipQuery.data?.[0]

  if (
    (group.privacy_status == 'private' && visibility != 'private') ||
    (group.privacy_status != 'private' && visibility == 'private')
  ) {
    throw new APIError(
      400,
      `Both "${group.name}" and market must be of the same private visibility.`
    )
  }

  if (
    !canUserAddGroupToMarket({
      userId,
      group,
      membership,
    })
  ) {
    throw new APIError(
      403,
      `User does not have permission to add this market to group "${group.name}".`
    )
  }

  return group
}

async function createAnswers(
  user: User,
  contract: CPMMMultiContract,
  ante: number,
  answers: string[]
) {
  const { shouldAnswersSumToOne } = contract
  const ids = answers.map(() => randomString())

  let prob = 0.5
  let poolYes = ante
  let poolNo = ante

  if (shouldAnswersSumToOne) {
    const n = answers.length
    prob = 1 / n
    // Maximize use of ante given constraint that one answer resolves YES and
    // the rest resolve NO.
    // Means that:
    //   ante = poolYes + (n - 1) * poolNo
    // because this pays out ante mana to winners in this case.
    // Also, cpmm identity for probability:
    //   1 / n = poolNo / (poolYes + poolNo)
    poolNo = ante / (2 * n - 2)
    poolYes = ante / 2

    // Naive solution that doesn't maximize liquidity:
    // poolYes = ante * prob
    // poolNo = ante * (prob ** 2 / (1 - prob))
  }

  const now = Date.now()

  await Promise.all(
    answers.map((text, i) => {
      const id = ids[i]
      const answer: Answer = {
        id,
        index: i,
        contractId: contract.id,
        userId: user.id,
        text,
        createdTime: now,

        poolYes,
        poolNo,
        prob,
        totalLiquidity: getMultiCpmmLiquidity({ YES: poolYes, NO: poolNo }),
        subsidyPool: 0,
      }
      return firestore
        .collection(`contracts/${contract.id}/answersCpmm`)
        .doc(id)
        .set(answer)
    })
  )
}

async function generateAntes(
  providerId: string,
  user: User,
  contract: Contract,
  outcomeType: string,
  ante: number
) {
  if (
    outcomeType === 'BINARY' ||
    outcomeType === 'PSEUDO_NUMERIC' ||
    outcomeType === 'STONK' ||
    outcomeType === 'MULTIPLE_CHOICE'
  ) {
    const liquidityDoc = firestore
      .collection(`contracts/${contract.id}/liquidity`)
      .doc()

    const lp = getCpmmInitialLiquidity(
      providerId,
      contract as CPMMBinaryContract | CPMMMultiContract,
      liquidityDoc.id,
      ante
    )

    await liquidityDoc.set(lp)
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
}

const bodySchema = z.object({
  question: z.string().min(1).max(MAX_QUESTION_LENGTH),
  description: contentSchema.or(z.string()).optional(),
  descriptionHtml: z.string().optional(),
  descriptionMarkdown: z.string().optional(),
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
  utcOffset: z.number().optional(),
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
  answers: z
    .string()
    .trim()
    .min(1)
    .array()
    .min(2)
    .max(MULTIPLE_CHOICE_MAX_ANSWERS),
  shouldAnswersSumToOne: z.boolean().optional(),
})

const bountiedQuestionSchema = z.object({
  totalBounty: z.number().min(1),
})

type schema = z.infer<typeof bodySchema> &
  (z.infer<typeof binarySchema> | {}) &
  (z.infer<typeof numericSchema> | {}) &
  (z.infer<typeof multipleChoiceSchema> | {}) &
  (z.infer<typeof bountiedQuestionSchema> | {})
