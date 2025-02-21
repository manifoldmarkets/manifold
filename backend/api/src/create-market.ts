import { onCreateMarket } from 'api/helpers/on-create-market'
import {
  createBinarySchema,
  createBountySchema,
  createNumberSchema,
  createMultiSchema,
  createNumericSchema,
  createPollSchema,
  toLiteMarket,
  createMultiNumericSchema,
} from 'common/api/market-types'
import { ValidatedAPIParams } from 'common/api/schema'
import {
  Contract,
  NO_CLOSE_TIME_TYPES,
  OutcomeType,
  add_answers_mode,
  contractUrl,
  nativeContractColumnsArray,
  NUMBER_CREATION_ENABLED,
} from 'common/contract'
import { getAnte } from 'common/economy'
import { MAX_GROUPS_PER_MARKET } from 'common/group'
import { getNewContract } from 'common/new-contract'
import { getPseudoProbability } from 'common/pseudo-numeric'
import { STONK_INITIAL_PROB } from 'common/stonk'
import { removeUndefinedProps } from 'common/util/object'
import { randomString } from 'common/util/random'
import { slugify } from 'common/util/slugify'
import { getCloseDate } from 'shared/helpers/openai-utils'
import {
  generateContractEmbeddings,
  getContractsDirect,
} from 'shared/supabase/contracts'
import {
  SupabaseDirectClient,
  createSupabaseDirectClient,
  pgp,
} from 'shared/supabase/init'
import { anythingToRichText } from 'shared/tiptap'
import { runTxnOutsideBetQueue } from 'shared/txn/run-txn'
import {
  addGroupToContract,
  canUserAddGroupToMarket,
} from 'shared/update-group-contracts-internal'
import { contractColumnsToSelect, htmlToRichText, log } from 'shared/utils'
import {
  broadcastNewAnswer,
  broadcastNewContract,
} from 'shared/websockets/helpers'
import { APIError, AuthedUser, type APIHandler } from './helpers/endpoint'
import { Row } from 'common/supabase/utils'
import { bulkInsertQuery } from 'shared/supabase/utils'
import { z } from 'zod'
import { answerToRow } from 'shared/supabase/answers'
import { convertAnswer } from 'common/supabase/contracts'
import { generateAntes } from 'shared/create-contract-helpers'
import { betsQueue } from 'shared/helpers/fn-queue'
import { convertUser } from 'common/supabase/users'
import { camelCase, first } from 'lodash'
import { getTieredCost } from 'common/tier'
import { getMultiNumericAnswerBucketRangeNames } from 'common/multi-numeric'

type Body = ValidatedAPIParams<'market'>

export const createMarket: APIHandler<'market'> = async (body, auth) => {
  const pg = createSupabaseDirectClient()
  const { groupIds } = body
  const groups = groupIds
    ? await Promise.all(
        groupIds.map(async (gId) => getGroupCheckPermissions(pg, gId, auth.uid))
      )
    : null

  const { contract: market, user } = await createMarketHelper(body, auth)
  // TODO upload answer images to GCP if provided
  if (groups) {
    await Promise.allSettled(
      groups.map(async (g) => {
        await addGroupToContract(pg, market, g)
      })
    )
  }
  // Should have the embedding ready for the related contracts cache
  return {
    result: toLiteMarket(market),
    continue: async () => {
      const embedding = await generateContractEmbeddings(market, pg).catch(
        (e) =>
          log.error(`Failed to generate embeddings, returning ${market.id} `, e)
      )
      broadcastNewContract(market, user)
      if ('answers' in market) {
        market.answers.forEach(broadcastNewAnswer)
      }
      await onCreateMarket(market, embedding)
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
    visibility,
    marketTier,
    idempotencyKey,
    sportsStartTimestamp,
    sportsEventId,
    sportsLeague,
    answerShortTexts,
    answerImageUrls,
    takerAPIOrdersDisabled,
    unit,
  } = validateMarketBody(body)

  const userId = auth.uid

  const pg = createSupabaseDirectClient()

  const hasOtherAnswer = addAnswersMode !== 'DISABLED' && shouldAnswersSumToOne
  const numAnswers = (answers?.length ?? 0) + (hasOtherAnswer ? 1 : 0)

  const unmodifiedAnte =
    (totalBounty ?? getAnte(outcomeType, numAnswers)) + (extraLiquidity ?? 0)

  if (unmodifiedAnte < 1) throw new APIError(400, 'Ante must be at least 1')

  const closeTime = await getCloseTimestamp(
    closeTimeRaw,
    question,
    outcomeType,
    utcOffset
  )

  if (closeTime && closeTime < Date.now())
    throw new APIError(400, 'Question must close in the future')

  const totalMarketCost = marketTier
    ? getTieredCost(unmodifiedAnte, marketTier, outcomeType)
    : unmodifiedAnte
  const ante =
    outcomeType === 'MULTIPLE_CHOICE' && !shouldAnswersSumToOne
      ? totalMarketCost
      : Math.min(unmodifiedAnte, totalMarketCost)

  const duplicateSubmissionUrl = await getDuplicateSubmissionUrl(
    idempotencyKey,
    pg
  )
  if (duplicateSubmissionUrl) {
    throw new APIError(
      400,
      'Contract has already been created at ' + duplicateSubmissionUrl
    )
  }

  return await betsQueue.enqueueFn(async () => {
    return pg.tx(async (tx) => {
      const proposedSlug = slugify(question)

      const userAndSlugResult = await tx.multi(
        `select * from users where id = $1 limit 1;
        select 1 from contracts where slug = $2 limit 1;`,
        [userId, proposedSlug]
      )
      const user = first(userAndSlugResult[0].map(convertUser))
      if (!user) throw new APIError(401, 'Your account was not found')
      if (user.isBannedFromPosting) throw new APIError(403, 'You are banned')

      if (totalMarketCost > user.balance)
        throw new APIError(403, `Balance must be at least ${totalMarketCost}.`)

      const slug = getSlug(!!first(userAndSlugResult[1]), proposedSlug)

      const contract = getNewContract(
        removeUndefinedProps({
          id: idempotencyKey ?? randomString(),
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
          answerShortTexts,
          answerImageUrls,
          addAnswersMode,
          shouldAnswersSumToOne,
          isAutoBounty,
          marketTier,
          token: 'MANA',
          sportsStartTimestamp,
          sportsEventId,
          sportsLeague,
          takerAPIOrdersDisabled,
          unit: unit ?? '',
        })
      )
      const nativeKeys = nativeContractColumnsArray.map(camelCase)
      const nativeValues = nativeKeys
        .filter((col) => col in contract)
        .map((col) => contract[col as keyof Contract])

      const contractDataToInsert = Object.fromEntries(
        Object.entries(contract).filter(([key]) => !nativeKeys.includes(key))
      )
      const insertAnswersQuery =
        contract.mechanism === 'cpmm-multi-1'
          ? bulkInsertQuery('answers', contract.answers.map(answerToRow), true)
          : 'select 1 where false'
      const contractQuery = pgp.as.format(
        `insert into contracts 
        (id, ${contractColumnsToSelect})
         values ($1, $2, ${nativeValues.map((_, i) => `$${i + 3}`)});`,
        [contract.id, JSON.stringify(contractDataToInsert), ...nativeValues]
      )
      const result = await tx.multi(
        `${contractQuery};
       ${insertAnswersQuery};`
      )

      if (result[1].length > 0 && contract.mechanism === 'cpmm-multi-1') {
        contract.answers = result[1].map(convertAnswer)
      }
      await runTxnOutsideBetQueue(tx, {
        fromId: userId,
        fromType: 'USER',
        toId: contract.id,
        toType: 'CONTRACT',
        amount: ante,
        token: 'M$',
        category: 'CREATE_CONTRACT_ANTE',
      })

      log('created contract ', {
        userUserName: user.username,
        userId: user.id,
        question,
        ante: ante || 0,
      })

      await generateAntes(
        tx,
        userId,
        contract,
        outcomeType,
        ante,
        totalMarketCost
      )

      return { contract, user }
    })
  }, [userId])
}

async function getDuplicateSubmissionUrl(
  idempotencyKey: string | undefined,
  pg: SupabaseDirectClient
): Promise<string | undefined> {
  if (!idempotencyKey) return undefined
  const contracts = await getContractsDirect([idempotencyKey], pg)
  if (contracts.length > 0) {
    return contractUrl(contracts[0])
  }
  return undefined
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

const getSlug = (preexistingContract: boolean, proposedSlug: string) => {
  return preexistingContract
    ? proposedSlug + '-' + randomString()
    : proposedSlug
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
    marketTier,
    idempotencyKey,
    sportsStartTimestamp,
    sportsEventId,
    sportsLeague,
    takerAPIOrdersDisabled,
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
    answerShortTexts: string[] | undefined,
    answerImageUrls: string[] | undefined,
    addAnswersMode: add_answers_mode | undefined,
    shouldAnswersSumToOne: boolean | undefined,
    totalBounty: number | undefined,
    isAutoBounty: boolean | undefined,
    extraLiquidity: number | undefined,
    unit: string | undefined

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
    if (!NUMBER_CREATION_ENABLED)
      throw new APIError(
        400,
        'Creating numeric markets is not currently enabled.'
      )
    ;({ min, max } = validateMarketType(outcomeType, createNumberSchema, body))
    if (min >= max)
      throw new APIError(400, 'Numeric markets must have min < max.')
    const { precision } = validateMarketType(
      outcomeType,
      createNumberSchema,
      body
    )
    answers = getMultiNumericAnswerBucketRangeNames(min, max, precision)
    if (answers.length < 2)
      throw new APIError(
        400,
        'Numeric markets must have at least 2 answer buckets.'
      )
  }
  if (outcomeType === 'MULTI_NUMERIC') {
    const {
      min: minInput,
      max: maxInput,
      answers: numericAnswers,
      midpoints,
      unit: unitInput,
    } = validateMarketType(outcomeType, createMultiNumericSchema, body)
    if (minInput >= maxInput)
      throw new APIError(400, 'Numeric markets must have min < max.')
    if (numericAnswers.length < 2)
      throw new APIError(
        400,
        'Numeric markets must have at least 2 answer buckets.'
      )
    if (numericAnswers.length !== midpoints.length)
      throw new APIError(
        400,
        'Number of answers must match number of midpoints.'
      )
    answers = numericAnswers
    min = minInput
    max = maxInput
    unit = unitInput
  }

  if (outcomeType === 'MULTIPLE_CHOICE') {
    ;({
      answers,
      answerShortTexts,
      answerImageUrls,
      addAnswersMode,
      shouldAnswersSumToOne,
      extraLiquidity,
    } = validateMarketType(outcomeType, createMultiSchema, body))
    if (answers.length < 2 && addAnswersMode === 'DISABLED')
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
    marketTier,
    idempotencyKey,
    sportsStartTimestamp,
    sportsEventId,
    sportsLeague,
    answerShortTexts,
    answerImageUrls,
    takerAPIOrdersDisabled,
    unit,
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
  pg: SupabaseDirectClient,
  groupId: string,
  userId: string
) {
  const result = await pg.oneOrNone<
    Row<'groups'> & { member_role: string | null }
  >(
    `
    select g.*, gm.role as member_role
    from groups g
    left join group_members gm on g.id = gm.group_id and gm.member_id = $2
    where g.id = $1
  `,
    [groupId, userId]
  )

  if (!result) {
    throw new APIError(404, 'No group exists with the given group ID.')
  }

  const { member_role, ...group } = result
  const membership = member_role
    ? {
        role: member_role,
        group_id: group.id,
        member_id: userId,
        created_time: null,
      }
    : undefined

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
