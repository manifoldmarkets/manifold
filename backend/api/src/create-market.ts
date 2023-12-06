import * as admin from 'firebase-admin'
import { JSONContent } from '@tiptap/core'
import { FieldValue, Transaction } from 'firebase-admin/firestore'
import { marked } from 'marked'
import { runPostBountyTxn } from 'shared/txn/run-bounty-txn'
import {
  DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
  getCpmmInitialLiquidity,
  HOUSE_LIQUIDITY_PROVIDER_ID,
} from 'common/antes'
import {
  add_answers_mode,
  Contract,
  CPMMBinaryContract,
  CPMMMultiContract,
  NO_CLOSE_TIME_TYPES,
  OutcomeType,
} from 'common/contract'
import { getAnte } from 'common/economy'
import { getNewContract } from 'common/new-contract'
import { getPseudoProbability } from 'common/pseudo-numeric'
import {
  getAvailableBalancePerQuestion,
  marketCreationCosts,
  User,
} from 'common/user'
import { randomString } from 'common/util/random'
import { slugify } from 'common/util/slugify'
import { getCloseDate } from 'shared/helpers/openai-utils'
import { GCPLog, getUser, htmlToRichText, isProd } from 'shared/utils'
import { canUserAddGroupToMarket } from './add-contract-to-group'
import { APIError, AuthedUser, typedEndpoint } from './helpers'
import { STONK_INITIAL_PROB } from 'common/stonk'
import {
  createSupabaseClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import { addGroupToContract } from 'shared/update-group-contracts-internal'
import { generateContractEmbeddings } from 'shared/supabase/contracts'
import { manifoldLoveUserId } from 'common/love/constants'
import { ValidatedAPIParams } from 'common/api/schema'
import {
  createBinarySchema,
  createBountySchema,
  createMultiSchema,
  createNumericSchema,
  createPollSchema,
  toLiteMarket,
} from 'common/api/market-types'
import { z } from 'zod'

type Body = ValidatedAPIParams<'create-market'>

export const createMarket = typedEndpoint(
  'create-market',
  async (body, auth, { log }) => {
    const market = await createMarketHelper(body, auth, log)
    return toLiteMarket(market)
  }
)

export async function createMarketHelper(
  body: Body,
  auth: AuthedUser,
  log: GCPLog
) {
  const {
    question,
    description,
    descriptionHtml,
    descriptionMarkdown,
    descriptionJson,
    closeTime: closeTimeRaw,
    outcomeType,
    groupIds,
    visibility,
    extraLiquidity,
    isTwitchContract,
    utcOffset,
    min,
    max,
    initialProb,
    isLogScale,
    answers,
    addAnswersMode,
    shouldAnswersSumToOne,
    totalBounty,
    loverUserId1,
    loverUserId2,
    matchCreatorId,
  } = validateMarketBody(body)

  const userId = auth.uid
  const user = await getUser(userId)
  if (!user) throw new APIError(401, 'Your account was not found')

  if (loverUserId1 || loverUserId2) {
    if (auth.uid !== manifoldLoveUserId) {
      throw new Error('Only Manifold Love account can create love contracts.')
    }
  }

  const groups = groupIds
    ? await Promise.all(
        groupIds.map(async (gId) =>
          getGroupCheckPermissions(gId, visibility, userId)
        )
      )
    : null

  const contractRef = firestore.collection('contracts').doc()

  const hasOtherAnswer = addAnswersMode !== 'DISABLED' && shouldAnswersSumToOne
  const numAnswers = (answers?.length ?? 0) + (hasOtherAnswer ? 1 : 0)
  const ante =
    (totalBounty ?? getAnte(outcomeType, numAnswers)) + (extraLiquidity ?? 0)

  if (ante < 1) throw new APIError(400, 'Ante must be at least 1')

  const closeTime = await getCloseTimestamp(
    closeTimeRaw,
    question,
    outcomeType,
    utcOffset
  )

  const contract = await firestore.runTransaction(async (trans) => {
    const userDoc = await trans.get(firestore.collection('users').doc(userId))
    if (!userDoc.exists) throw new APIError(401, 'Your account was not found')

    const user = userDoc.data() as User

    if (user.isBannedFromPosting) throw new APIError(403, 'You are banned')

    const { amountSuppliedByUser, amountSuppliedByHouse } = marketCreationCosts(
      user,
      ante
    )

    if (ante > getAvailableBalancePerQuestion(user))
      throw new APIError(
        403,
        `Balance must be at least ${amountSuppliedByUser}.`
      )

    const slug = await getSlug(trans, question)

    const contract = getNewContract({
      id: contractRef.id,
      slug,
      creator: user,
      question,
      outcomeType,
      description: getDescriptionJson(
        description,
        descriptionHtml,
        descriptionMarkdown,
        descriptionJson
      ),
      initialProb: initialProb ?? 0,
      ante,
      closeTime,
      visibility,
      isTwitchContract,
      min: min ?? 0,
      max: max ?? 0,
      isLogScale: isLogScale ?? false,
      answers: answers ?? [],
      addAnswersMode,
      shouldAnswersSumToOne,
      loverUserId1,
      loverUserId2,
      matchCreatorId,
    })

    const houseId = isProd()
      ? HOUSE_LIQUIDITY_PROVIDER_ID
      : DEV_HOUSE_LIQUIDITY_PROVIDER_ID
    const houseDoc =
      amountSuppliedByHouse > 0
        ? await trans.get(firestore.collection('users').doc(houseId))
        : undefined
    trans.create(contractRef, contract)
    return runCreateMarketTxn(
      contract,
      ante,
      user,
      userDoc.ref,
      contractRef,
      houseDoc,
      trans
    )
  })

  log('created contract ', {
    userUserName: user.username,
    userId: user.id,
    question,
    ante: ante || 0,
  })

  if (answers && contract.mechanism === 'cpmm-multi-1')
    await createAnswers(contract)

  const pg = createSupabaseDirectClient()
  if (groups) {
    await Promise.all(
      groups.map(async (g) => {
        await addGroupToContract(contract, g, pg)
      })
    )
  }

  await generateAntes(userId, contract, outcomeType, ante)

  await generateContractEmbeddings(contract, pg)

  return contract
}

const runCreateMarketTxn = async (
  contract: Contract,
  ante: number,
  user: User,
  userDocRef: admin.firestore.DocumentReference,
  contractRef: admin.firestore.DocumentReference,
  houseDoc: admin.firestore.DocumentSnapshot | undefined,
  trans: Transaction
) => {
  const { amountSuppliedByUser, amountSuppliedByHouse } = marketCreationCosts(
    user,
    ante
  )

  if (contract.outcomeType !== 'BOUNTIED_QUESTION') {
    if (amountSuppliedByHouse > 0 && houseDoc)
      trans.update(houseDoc.ref, {
        balance: FieldValue.increment(-amountSuppliedByHouse),
        totalDeposits: FieldValue.increment(-amountSuppliedByHouse),
      })

    if (amountSuppliedByUser > 0)
      trans.update(userDocRef, {
        balance: FieldValue.increment(-amountSuppliedByUser),
        totalDeposits: FieldValue.increment(-amountSuppliedByUser),
      })
  } else {
    // Even if their debit is 0, it seems important that the user posts the bounty
    await runPostBountyTxn(
      trans,
      {
        fromId: user.id,
        fromType: 'USER',
        toId: contract.id,
        toType: 'CONTRACT',
        amount: amountSuppliedByUser,
        token: 'M$',
        category: 'BOUNTY_POSTED',
      },
      contractRef,
      userDocRef
    )

    if (amountSuppliedByHouse > 0 && houseDoc)
      await runPostBountyTxn(
        trans,
        {
          fromId: houseDoc.id,
          fromType: 'USER',
          toId: contract.id,
          toType: 'CONTRACT',
          amount: amountSuppliedByHouse,
          token: 'M$',
          category: 'BOUNTY_ADDED',
        },
        contractRef,
        houseDoc.ref
      )
  }

  if (amountSuppliedByHouse > 0)
    trans.update(userDocRef, {
      freeQuestionsCreated: FieldValue.increment(1),
    })

  return contract
}

function getDescriptionJson(
  description?: string | JSONContent,
  descriptionHtml?: string,
  descriptionMarkdown?: string,
  descriptionJson?: string
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
  } else if (descriptionJson) {
    return JSON.parse(descriptionJson)
  } else {
    // Use a single empty space as the description
    return htmlToRichText('<p> </p>')
  }
}

async function getCloseTimestamp(
  closeTime: number | Date | undefined,
  question: string,
  outcomeType: OutcomeType,
  utcOffset?: number
): Promise<number | undefined> {
  return closeTime
    ? typeof closeTime === 'number'
      ? closeTime
      : closeTime.getTime()
    : NO_CLOSE_TIME_TYPES.includes(outcomeType)
    ? closeTime
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

function validateMarketBody(body: Body) {
  const {
    question,
    description,
    descriptionHtml,
    descriptionMarkdown,
    descriptionJson,
    closeTime,
    outcomeType,
    groupIds,
    visibility = 'public',
    isTwitchContract,
    utcOffset,
    loverUserId1,
    loverUserId2,
    matchCreatorId,
  } = body

  let min: number | undefined,
    max: number | undefined,
    initialProb: number | undefined,
    isLogScale: boolean | undefined,
    answers: string[] | undefined,
    addAnswersMode: add_answers_mode | undefined,
    shouldAnswersSumToOne: boolean | undefined,
    totalBounty: number | undefined,
    extraLiquidity: number | undefined

  if (outcomeType === 'PSEUDO_NUMERIC') {
    const parsed = validateMarketType(outcomeType, createNumericSchema, body)

    ;({ min, max, isLogScale, extraLiquidity } = parsed)
    const { initialValue } = parsed

    if (max - min <= 0.01)
      throw new APIError(400, 'Max must be greater than min by more than 0.01')
    if (initialValue <= min || initialValue >= max)
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
    const parsed = validateMarketType(outcomeType, createBinarySchema, body)

    ;({ initialProb, extraLiquidity } = parsed)
  }

  if (outcomeType === 'MULTIPLE_CHOICE') {
    ;({ answers, addAnswersMode, shouldAnswersSumToOne, extraLiquidity } =
      validateMarketType(outcomeType, createMultiSchema, body))
    if (answers.length < 2 && addAnswersMode === 'DISABLED')
      throw new APIError(
        400,
        'Multiple choice markets must have at least 2 answers if adding answers is disabled.'
      )
  }

  if (outcomeType === 'BOUNTIED_QUESTION') {
    ;({ totalBounty } = validateMarketType(
      outcomeType,
      createBountySchema,
      body
    ))
  }

  if (outcomeType === 'POLL') {
    ;({ answers } = validateMarketType(outcomeType, createPollSchema, body))
  }
  return {
    question,
    description,
    descriptionHtml,
    descriptionMarkdown,
    descriptionJson,
    closeTime,
    outcomeType,
    groupIds,
    visibility,
    extraLiquidity,
    isTwitchContract,
    utcOffset,
    min,
    max,
    initialProb,
    isLogScale,
    answers,
    addAnswersMode,
    shouldAnswersSumToOne,
    totalBounty,
    loverUserId1,
    loverUserId2,
    matchCreatorId,
  }
}

function validateMarketType<T extends z.ZodType>(
  outcome: string,
  schema: T,
  val: unknown
) {
  const result = schema.safeParse(val)
  if (result.success) return result.data as z.infer<T>
  throw new APIError(
    400,
    `Wrong props for ${outcome} question.`,
    result.error.message
  )
}

async function getGroupCheckPermissions(
  groupId: string,
  visibility: string,
  userId: string
) {
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
      403,
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

async function createAnswers(contract: CPMMMultiContract) {
  const { answers } = contract
  await Promise.all(
    answers.map((answer) => {
      return firestore
        .collection(`contracts/${contract.id}/answersCpmm`)
        .doc(answer.id)
        .set(answer)
    })
  )
}

async function generateAntes(
  providerId: string,
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
  }
}
