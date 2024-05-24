import * as admin from 'firebase-admin'
import { Transaction } from 'firebase-admin/firestore'
import { getCpmmInitialLiquidity } from 'common/antes'
import {
  add_answers_mode,
  Contract,
  CPMMBinaryContract,
  CPMMMultiContract,
  CPMMNumericContract,
  MULTI_NUMERIC_CREATION_ENABLED,
  NO_CLOSE_TIME_TYPES,
  OutcomeType,
} from 'common/contract'
import { getAnte } from 'common/economy'
import { getNewContract } from 'common/new-contract'
import { getPseudoProbability } from 'common/pseudo-numeric'
import { randomString } from 'common/util/random'
import { slugify } from 'common/util/slugify'
import { getCloseDate } from 'shared/helpers/openai-utils'
import { log, getUser, getUserByUsername, htmlToRichText } from 'shared/utils'
import { APIError, AuthedUser, type APIHandler } from './helpers/endpoint'
import { STONK_INITIAL_PROB } from 'common/stonk'
import {
  SupabaseTransaction,
  createSupabaseClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import {
  addGroupToContract,
  canUserAddGroupToMarket,
} from 'shared/update-group-contracts-internal'
import { generateContractEmbeddings } from 'shared/supabase/contracts'
import { manifoldLoveUserId } from 'common/love/constants'
import { ValidatedAPIParams } from 'common/api/schema'
import {
  createBinarySchema,
  createBountySchema,
  createMultiNumericSchema,
  createMultiSchema,
  createNumericSchema,
  createPollSchema,
  toLiteMarket,
} from 'common/api/market-types'
import { z } from 'zod'
import { anythingToRichText } from 'shared/tiptap'
import { runTxn, runTxnFromBank } from 'shared/txn/run-txn'
import { removeUndefinedProps } from 'common/util/object'
import { onCreateMarket } from 'api/helpers/on-create-market'
import { getMultiNumericAnswerBucketRangeNames } from 'common/multi-numeric'
import { MAX_GROUPS_PER_MARKET } from 'common/group'
import { broadcastNewContract } from 'shared/websockets/helpers'

type Body = ValidatedAPIParams<'market'> & {
  specialLiquidityPerAnswer?: number
}

const firestore = admin.firestore()

export const createMarket: APIHandler<'market'> = async (body, auth) => {
  const market = await createMarketHelper(body, auth)
  return {
    result: toLiteMarket(market),
    continue: async () => {
      await onCreateMarket(market, firestore)
    },
  }
}

export async function createMarketHelper(body: Body, auth: AuthedUser) {
  const {
    question,
    description,
    descriptionHtml,
    descriptionMarkdown,
    descriptionJson,
    closeTime: closeTimeRaw,
    outcomeType,
    groupIds,
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
    isAutoBounty,
    loverUserId1,
    loverUserId2,
    matchCreatorId,
    isLove,
    visibility,
    specialLiquidityPerAnswer,
  } = validateMarketBody(body)

  if (outcomeType === 'BOUNTIED_QUESTION') {
    throw new APIError(400, 'Bountied questions are not currently enabled.')
  }

  const userId = auth.uid
  const user = await getUser(userId)
  if (!user) throw new APIError(401, 'Your account was not found')

  if (visibility !== 'public') {
    throw new APIError(403, 'Only public markets can be created.')
  }
  // if (!isVerified(user)) {
  //   throw new APIError(
  //     403,
  //     'You must verify your phone number to create a market.'
  //   )
  // }

  if (loverUserId1 || loverUserId2) {
    if (auth.uid !== manifoldLoveUserId) {
      throw new Error('Only Manifold Love account can create love contracts.')
    }
  }

  const groups = groupIds
    ? await Promise.all(
        groupIds.map(async (gId) =>
          getGroupCheckPermissions(gId, visibility, userId, { isLove })
        )
      )
    : null

  const contractRef = firestore.collection('contracts').doc()

  const hasOtherAnswer = addAnswersMode !== 'DISABLED' && shouldAnswersSumToOne
  const numAnswers = (answers?.length ?? 0) + (hasOtherAnswer ? 1 : 0)
  const ante =
    (specialLiquidityPerAnswer ??
      totalBounty ??
      getAnte(outcomeType, numAnswers)) + (extraLiquidity ?? 0)

  if (ante < 1) throw new APIError(400, 'Ante must be at least 1')

  const closeTime = await getCloseTimestamp(
    closeTimeRaw,
    question,
    outcomeType,
    utcOffset
  )

  const pg = createSupabaseDirectClient()

  const contract = await pg.tx(async (tx) => {
    const user = await getUser(userId, tx)
    if (!user) throw new APIError(401, 'Your account was not found')
    if (user.isBannedFromPosting) throw new APIError(403, 'You are banned')

    if (ante > user.balance)
      throw new APIError(403, `Balance must be at least ${ante}.`)

    let answerLoverUserIds: string[] = []
    if (isLove && answers) {
      answerLoverUserIds = await getLoveAnswerUserIds(answers)
      console.log('answerLoverUserIds', answerLoverUserIds)
    }

    const contract = await firestore.runTransaction(async (trans) => {
      const slug = await getSlug(trans, question)

      const contract = getNewContract(
        removeUndefinedProps({
          id: contractRef.id,
          slug,
          creator: user,
          question,
          outcomeType,
          description:
            typeof description !== 'string' && description
              ? description
              : anythingToRichText({
                  raw: description,
                  html: descriptionHtml,
                  markdown: descriptionMarkdown,
                  jsonString: descriptionJson,
                  // default: use a single empty space as the description
                }) ?? htmlToRichText(`<p> </p>`),
          initialProb: initialProb ?? 50,
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
          isLove,
          answerLoverUserIds,
          specialLiquidityPerAnswer,
          isAutoBounty,
        })
      )

      trans.create(contractRef, contract)

      return contract
    })

    await runCreateMarketTxn({
      contractId: contract.id,
      userId,
      amountSuppliedByUser: ante,
      amountSuppliedByHouse: 0,
      transaction: tx,
    })

    return contract
  })

  log('created contract ', {
    userUserName: user.username,
    userId: user.id,
    question,
    ante: ante || 0,
  })

  if (answers && contract.mechanism === 'cpmm-multi-1')
    await createAnswers(contract)

  if (groups) {
    await Promise.all(
      groups.map(async (g) => {
        await addGroupToContract(contract, g)
      })
    )
  }

  await generateAntes(userId, contract, outcomeType, ante)

  await generateContractEmbeddings(contract, pg)

  broadcastNewContract(contract, user)
  return contract
}

const runCreateMarketTxn = async (args: {
  contractId: string
  userId: string
  amountSuppliedByUser: number
  amountSuppliedByHouse: number
  transaction: SupabaseTransaction
}) => {
  const {
    contractId,
    userId,
    amountSuppliedByUser,
    amountSuppliedByHouse,
    transaction,
  } = args

  if (amountSuppliedByUser > 0) {
    await runTxn(transaction, {
      fromId: userId,
      fromType: 'USER',
      toId: contractId,
      toType: 'CONTRACT',
      amount: amountSuppliedByUser,
      token: 'M$',
      category: 'CREATE_CONTRACT_ANTE',
    })
  }

  if (amountSuppliedByHouse > 0) {
    await runTxnFromBank(transaction, {
      amount: amountSuppliedByHouse,
      category: 'CREATE_CONTRACT_ANTE',
      toId: contractId,
      toType: 'CONTRACT',
      fromType: 'BANK',
      token: 'M$',
    })
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
    isLove,
  } = body

  if (groupIds && groupIds.length > MAX_GROUPS_PER_MARKET)
    throw new APIError(
      400,
      `You may only tag up to ${MAX_GROUPS_PER_MARKET} topics on a question`
    )

  let min: number | undefined,
    max: number | undefined,
    initialProb: number | undefined,
    isLogScale: boolean | undefined,
    answers: string[] | undefined,
    addAnswersMode: add_answers_mode | undefined,
    shouldAnswersSumToOne: boolean | undefined,
    totalBounty: number | undefined,
    isAutoBounty: boolean | undefined,
    extraLiquidity: number | undefined,
    specialLiquidityPerAnswer: number | undefined

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
  if (outcomeType === 'NUMBER') {
    if (!MULTI_NUMERIC_CREATION_ENABLED)
      throw new APIError(
        400,
        'Creating numeric markets is not currently enabled.'
      )
    ;({ min, max } = validateMarketType(
      outcomeType,
      createMultiNumericSchema,
      body
    ))
    if (min >= max)
      throw new APIError(400, 'Numeric markets must have min < max.')
    const { precision } = validateMarketType(
      outcomeType,
      createMultiNumericSchema,
      body
    )
    answers = getMultiNumericAnswerBucketRangeNames(min, max, precision)
    if (answers.length < 2)
      throw new APIError(
        400,
        'Numeric markets must have at least 2 answer buckets.'
      )
  }

  if (outcomeType === 'MULTIPLE_CHOICE') {
    ;({ answers, addAnswersMode, shouldAnswersSumToOne, extraLiquidity } =
      validateMarketType(outcomeType, createMultiSchema, body))
    if (answers.length < 2 && addAnswersMode === 'DISABLED' && !isLove)
      throw new APIError(
        400,
        'Multiple choice markets must have at least 2 answers if adding answers is disabled.'
      )
  }

  if (outcomeType === 'BOUNTIED_QUESTION') {
    ;({ totalBounty, isAutoBounty } = validateMarketType(
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
    isAutoBounty,
    loverUserId1,
    loverUserId2,
    matchCreatorId,
    isLove,
    specialLiquidityPerAnswer,
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
  userId: string,
  options: { isLove?: boolean } = {}
) {
  const { isLove } = options
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
      isLove,
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
  contract: CPMMMultiContract | CPMMNumericContract
) {
  const { isLove } = contract
  let { answers } = contract

  if (isLove) {
    // Add loverUserId to the answer.
    answers = await Promise.all(
      answers.map(async (a) => {
        // Parse username from answer text.
        const matches = a.text.match(/@(\w+)/)
        const loverUsername = matches ? matches[1] : null
        if (!loverUsername) return a
        const loverUserId = (await getUserByUsername(loverUsername))?.id
        if (!loverUserId) return a
        return {
          ...a,
          loverUserId,
        }
      })
    )
  }

  await Promise.all(
    answers.map((answer) => {
      return firestore
        .collection(`contracts/${contract.id}/answersCpmm`)
        .doc(answer.id)
        .set(answer)
    })
  )
}

async function getLoveAnswerUserIds(answers: string[]) {
  // Get the loverUserId from the answer text.
  return await Promise.all(
    answers.map(async (answerText) => {
      // Parse username from answer text.
      const matches = answerText.match(/@(\w+)/)
      console.log('matches', matches)
      const loverUsername = matches ? matches[1] : null
      if (!loverUsername)
        throw new APIError(500, 'No lover username found ' + answerText)
      const user = await getUserByUsername(loverUsername)
      if (!user)
        throw new APIError(500, 'No user found with username ' + answerText)
      return user.id
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
    contract.outcomeType === 'MULTIPLE_CHOICE' &&
    contract.mechanism === 'cpmm-multi-1' &&
    !contract.shouldAnswersSumToOne
  ) {
    const { answers } = contract
    for (const answer of answers) {
      const ante = Math.sqrt(answer.poolYes * answer.poolNo)
      const liquidityDoc = firestore
        .collection(`contracts/${contract.id}/liquidity`)
        .doc()
      const lp = getCpmmInitialLiquidity(
        providerId,
        contract,
        liquidityDoc.id,
        ante,
        contract.createdTime,
        answer.id
      )
      await liquidityDoc.set(lp)
    }
  } else if (
    outcomeType === 'BINARY' ||
    outcomeType === 'PSEUDO_NUMERIC' ||
    outcomeType === 'STONK' ||
    outcomeType === 'MULTIPLE_CHOICE' ||
    outcomeType === 'NUMBER'
  ) {
    const liquidityDoc = firestore
      .collection(`contracts/${contract.id}/liquidity`)
      .doc()

    const lp = getCpmmInitialLiquidity(
      providerId,
      contract as CPMMBinaryContract | CPMMMultiContract,
      liquidityDoc.id,
      ante,
      contract.createdTime
    )

    await liquidityDoc.set(lp)
  }
}
