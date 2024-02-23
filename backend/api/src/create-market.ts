import * as admin from 'firebase-admin'
import { FieldValue, Transaction } from 'firebase-admin/firestore'
import { getCpmmInitialLiquidity } from 'common/antes'
import {
  add_answers_mode,
  Contract,
  CPMMBinaryContract,
  CPMMMultiContract,
  CPMMNumericContract,
  NO_CLOSE_TIME_TYPES,
  OutcomeType,
} from 'common/contract'
import { getAnte } from 'common/economy'
import { getNewContract } from 'common/new-contract'
import { getPseudoProbability } from 'common/pseudo-numeric'
import { marketCreationCosts, User } from 'common/user'
import { randomString } from 'common/util/random'
import { slugify } from 'common/util/slugify'
import { getCloseDate } from 'shared/helpers/openai-utils'
import {
  GCPLog,
  getUser,
  getUserByUsername,
  htmlToRichText,
} from 'shared/utils'
import { APIError, AuthedUser, type APIHandler } from './helpers/endpoint'
import { STONK_INITIAL_PROB } from 'common/stonk'
import {
  createSupabaseClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import {
  addGroupToContract,
  canUserAddGroupToMarket,
} from 'shared/update-group-contracts-internal'
import { generateContractEmbeddings } from 'shared/supabase/contracts'
import { manifoldLoveUserId } from 'common/love/constants'
import { BTE_USER_ID } from 'common/envs/constants'
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

type Body = ValidatedAPIParams<'market'>

export const createMarket: APIHandler<'market'> = async (
  body,
  auth,
  { log }
) => {
  const market = await createMarketHelper(body, auth, log)
  return toLiteMarket(market)
}

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
    isLove,
    specialLiquidityPerAnswer,
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

  const contract = await firestore.runTransaction(async (trans) => {
    const userDoc = await trans.get(firestore.collection('users').doc(userId))
    if (!userDoc.exists) throw new APIError(401, 'Your account was not found')

    const user = userDoc.data() as User

    if (user.isBannedFromPosting) throw new APIError(403, 'You are banned')

    const { amountSuppliedByUser } = marketCreationCosts(
      user,
      ante,
      !!specialLiquidityPerAnswer
    )

    if (amountSuppliedByUser > user.balance && user.id !== BTE_USER_ID)
      throw new APIError(
        403,
        `Balance must be at least ${amountSuppliedByUser}.`
      )

    const slug = await getSlug(trans, question)

    let answerLoverUserIds: string[] = []
    if (isLove && answers) {
      answerLoverUserIds = await getLoveAnswerUserIds(answers)
      console.log('answerLoverUserIds', answerLoverUserIds)
    }

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
      })
    )

    const res = await runCreateMarketTxn(
      contract,
      ante,
      user,
      userDoc.ref,
      contractRef,
      trans
    )
    trans.create(contractRef, contract)
    return res
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
        await addGroupToContract(contract, g)
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
  trans: Transaction
) => {
  const { amountSuppliedByUser, amountSuppliedByHouse } = marketCreationCosts(
    user,
    ante
  )

  if (amountSuppliedByHouse > 0) {
    await runTxnFromBank(trans, {
      amount: amountSuppliedByHouse,
      category: 'CREATE_CONTRACT_ANTE',
      toId: contract.id,
      toType: 'CONTRACT',
      fromType: 'BANK',
      token: 'M$',
    })
  }

  if (amountSuppliedByUser > 0) {
    await runTxn(trans, {
      fromId: user.id,
      fromType: 'USER',
      toId: contract.id,
      toType: 'CONTRACT',
      amount: amountSuppliedByUser,
      token: 'M$',
      category: 'CREATE_CONTRACT_ANTE',
    })
  }

  if (amountSuppliedByHouse > 0)
    trans.update(userDocRef, {
      freeQuestionsCreated: FieldValue.increment(1),
    })

  return contract
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
    isLove,
  } = body

  let min: number | undefined,
    max: number | undefined,
    initialProb: number | undefined,
    isLogScale: boolean | undefined,
    answers: string[] | undefined,
    addAnswersMode: add_answers_mode | undefined,
    shouldAnswersSumToOne: boolean | undefined,
    totalBounty: number | undefined,
    extraLiquidity: number | undefined,
    specialLiquidityPerAnswer: number | undefined,
    numericAnswers: number[] | undefined

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
    if ('numericAnswers' in body) {
      ;({
        numericAnswers,
        addAnswersMode,
        shouldAnswersSumToOne,
        extraLiquidity,
      } = validateMarketType(outcomeType, createMultiNumericSchema, body))
      if (numericAnswers.length < 2 && addAnswersMode === 'DISABLED')
        throw new APIError(
          400,
          'Multiple choice markets must have at least 2 answers if adding answers is disabled.'
        )
      answers = numericAnswers.map((n) => n.toString())
    } else {
      ;({ answers, addAnswersMode, shouldAnswersSumToOne, extraLiquidity } =
        validateMarketType(outcomeType, createMultiSchema, body))
      if (answers.length < 2 && addAnswersMode === 'DISABLED')
        throw new APIError(
          400,
          'Multiple choice markets must have at least 2 answers if adding answers is disabled.'
        )
    }
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

  if (body.specialLiquidityPerAnswer) {
    if (outcomeType !== 'MULTIPLE_CHOICE' || body.shouldAnswersSumToOne)
      throw new APIError(
        400,
        'specialLiquidityPerAnswer can only be used with independent MULTIPLE_CHOICE markets'
      )
    specialLiquidityPerAnswer = body.specialLiquidityPerAnswer
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
      ante,
      contract.createdTime
    )

    await liquidityDoc.set(lp)
  }
}
