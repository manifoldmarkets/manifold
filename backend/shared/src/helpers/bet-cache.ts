import { Contract, MarketContract } from 'common/contract'
import { Answer } from 'common/answer'
import { LimitBet } from 'common/bet'
import { getContract, getUser, log } from 'shared/utils'
import {
  SupabaseDirectClient,
  SupabaseTransaction,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import { sortBy, uniq, uniqBy } from 'lodash'
import { APIError } from 'common/api/utils'
import {
  getAnswer,
  getAnswersForContract,
  getSpecificAnswersForContract,
} from 'shared/supabase/answers'
import { BLESSED_BANNED_USER_IDS } from 'common/envs/constants'
import { convertBet } from 'common/supabase/bets'
import { buildArray, filterDefined } from 'common/util/array'

export const validateBet = async (
  pgTrans: SupabaseTransaction | SupabaseDirectClient,
  uid: string,
  amount: number | undefined,
  contract: Contract,
  isApi: boolean
) => {
  const user = await getUser(uid, pgTrans)
  if (!user) throw new APIError(404, 'User not found.')

  if (amount !== undefined && user.balance < amount)
    throw new APIError(403, 'Insufficient balance.')
  if (
    (user.isBannedFromPosting || user.userDeleted) &&
    !BLESSED_BANNED_USER_IDS.includes(uid)
  ) {
    throw new APIError(403, 'You are banned or deleted. And not #blessed.')
  }
  // if (!isVerified(user)) {
  //   throw new APIError(403, 'You must verify your phone number to bet.')
  // }
  log(
    `Loaded user ${user.username} with id ${user.id} betting on slug ${contract.slug} with contract id: ${contract.id}.`
  )
  if (contract.outcomeType === 'STONK' && isApi) {
    throw new APIError(403, 'API users cannot bet on STONK contracts.')
  }
  log(
    `Loaded user ${user.username} with id ${user.id} betting on slug ${contract.slug} with contract id: ${contract.id}.`
  )

  return user
}

export const getUnfilledBets = async (
  pg: SupabaseDirectClient,
  contractId: string,
  answerId?: string
) => {
  return await pg.map(
    `select *
     from contract_bets
     where contract_id = $1
       and (data -> 'isFilled')::boolean = false
       and (data -> 'isCancelled')::boolean = false
         ${answerId ? `and answer_id = $2` : ''}`,
    [contractId, answerId],
    (r) => convertBet(r) as LimitBet
  )
}

export const getUserBalances = async (
  pgTrans: SupabaseTransaction | SupabaseDirectClient,
  userIds: string[]
) => {
  const users =
    userIds.length === 0
      ? []
      : await pgTrans.map(
          `select balance, id
         from users
         where id = any ($1)`,
          [userIds],
          (r) => r as { balance: number; id: string }
        )

  return Object.fromEntries(users.map((user) => [user.id, user.balance]))
}

const getAnswersForBet = async (
  pgTrans: SupabaseDirectClient,
  contract: Contract,
  answerId: string | undefined,
  answerIds: string[] | undefined
) => {
  const { mechanism } = contract
  const contractId = contract.id
  if (mechanism === 'cpmm-multi-1' && contract.shouldAnswersSumToOne) {
    return await getAnswersForContract(pgTrans, contractId)
  }
  if (answerIds) {
    return await getSpecificAnswersForContract(pgTrans, answerIds)
  }
  if (answerId && mechanism === 'cpmm-multi-1') {
    // Only fetch the one answer if it's independent multi.
    const answer = await getAnswer(pgTrans, answerId)
    return filterDefined([answer])
  }
  return undefined
}

const fetchCachableData = async ({
  pg,
  contractId,
  answerId,
  answerIds,
}: FetchProps) => {
  const contract = await getContract(pg, contractId)
  if (!contract) throw new APIError(404, 'Contract not found.')
  if (contract.mechanism === 'none' || contract.mechanism === 'qf')
    throw new APIError(400, 'This is not a market')

  const { closeTime } = contract
  if (closeTime && Date.now() > closeTime)
    throw new APIError(403, 'Trading is closed.')

  const [answers, unfilledBets] = await Promise.all([
    getAnswersForBet(pg, contract, answerId, answerIds),
    getUnfilledBets(
      pg,
      contractId,
      'shouldAnswersSumToOne' in contract && contract.shouldAnswersSumToOne
        ? undefined
        : answerId
    ),
  ])

  return { contract, answers, unfilledBets }
}
type FetchProps = {
  pg: SupabaseDirectClient
  contractId: string
  answerId?: string
  answerIds?: string[]
}
export const fetchContractBetDataAndValidate = async (
  pg: SupabaseDirectClient,
  body: {
    contractId: string
    amount: number | undefined
    answerId?: string
    answerIds?: string[]
  },
  uid: string,
  isApi: boolean
) => {
  const { amount, contractId } = body

  const answerIdsNeeded = uniq(
    buildArray(body.answerId, ...(body.answerIds ?? []))
  )

  const { answerId, answerIds } = body
  const awaitStart = Date.now()
  let cached = await getCachedResult({
    pg,
    contractId,
    answerId,
    answerIds,
  })
  log(
    `[cache] Revalidation took ${Date.now() - awaitStart}ms for ${contractId}`
  )

  const missingAnswerIdsFromLastCache = answerIdsNeeded.filter(
    (id) => !cached.answers?.some((a) => a.id === id)
  )
  const answersFromGlobalCache = filterDefined(
    missingAnswerIdsFromLastCache.map((id) => allCachedAnswers[id])
  )
  const uncachedAnswerIds = missingAnswerIdsFromLastCache.filter(
    (id) => !answersFromGlobalCache.some((a) => a.id === id)
  )
  const cachedAnswers = [
    ...(cached.answers ?? []),
    ...answersFromGlobalCache,
  ].filter((a) => answerIdsNeeded.includes(a.id))
  const refetchAnswers = uncachedAnswerIds.length > 0
  if (refetchAnswers) {
    // revalidate cache with missing answers
    cached = await invalidateCache(contractId, {
      contractId,
      pg,
      answerId: undefined,
      answerIds: answerIdsNeeded,
    })
  }
  const { contract, unfilledBets } = cached
  const contractAnswers =
    contract.mechanism === 'cpmm-multi-1' ? contract.answers ?? [] : []
  const freshAnswers = refetchAnswers ? cached.answers ?? [] : cachedAnswers
  const answers = sortBy(
    uniqBy([...freshAnswers, ...contractAnswers], (a) => a.id),
    (a) => a.index
  )
  if (contract.mechanism === 'cpmm-multi-1') {
    contract.answers = answers
  }
  const unfilledBetUserIds = uniq(unfilledBets.map((bet) => bet.userId))

  const uncachedStart = Date.now()
  const [user, balanceByUserId] = await Promise.all([
    validateBet(pg, uid, amount, contract, isApi),
    getUserBalances(pg, unfilledBetUserIds),
  ])
  log(`[cache] Uncache-able request took ${Date.now() - uncachedStart}ms`)

  return {
    user,
    contract,
    answers,
    unfilledBets,
    balanceByUserId,
    unfilledBetUserIds,
  }
}

const createCacheHelper = (fn: (args: FetchProps) => Promise<CacheEntry>) => {
  const caches = new Map<
    string,
    {
      data: CacheEntry | null
      isRevalidating: boolean
      waitingPromises: ((value: CacheEntry | PromiseLike<CacheEntry>) => void)[]
      args: Omit<FetchProps, 'pg'>
    }
  >()
  const allCachedAnswers: { [answerId: string]: Answer } = {}

  const getCachedResult = async (args: FetchProps) => {
    const key = args.contractId
    if (!caches.has(key)) {
      const { pg: _, ...rest } = args
      caches.set(key, {
        data: null,
        isRevalidating: false,
        waitingPromises: [],
        args: rest,
      })
    }
    const cache = caches.get(key)!

    if (cache.data && !cache.isRevalidating) {
      log(`[cache] Returning cached data for ${key}`)
      return cache.data
    }

    if (cache.isRevalidating) {
      log(`[cache] Waiting in line for revalidation for ${key}`)
      return new Promise<CacheEntry>((resolve) => {
        cache.waitingPromises.push(resolve)
      })
    }

    cache.isRevalidating = true
    try {
      log(`[cache] Revalidating cache for ${key}`)
      const result = await fn(args)
      log(`[cache] Revalidation complete for ${key}`)
      cache.data = result
      log(`[cache] Resolving ${cache.waitingPromises.length} promises`)
      cache.waitingPromises.forEach((resolve) => resolve(result))
      cache.waitingPromises = []
      result.answers?.forEach((a) => (allCachedAnswers[a.id] = a))
      return result
    } finally {
      cache.isRevalidating = false
    }
  }

  const invalidateCache = async (key: string, newArgs?: FetchProps) => {
    log(`[cache] Invalidating cache for ${key}`)
    if (caches.has(key)) {
      const cache = caches.get(key)!
      cache.data = null
      cache.isRevalidating = false
      cache.waitingPromises = []

      // Revalidate the cache with stored arguments
      const pg = createSupabaseDirectClient()
      return await getCachedResult(newArgs ?? { ...cache.args, pg })
    }
    if (!newArgs) {
      throw new Error(`Cache for ${key} not found and no new args provided`)
    }
    return await getCachedResult(newArgs)
  }
  const getKeys = (): string[] => Array.from(caches.keys())

  return {
    getKeys,
    getCachedResult,
    invalidateCache,
    allCachedAnswers,
  }
}

type CacheEntry = {
  contract: MarketContract
  answers: Answer[] | undefined
  unfilledBets: LimitBet[]
}
export const { getCachedResult, invalidateCache, getKeys, allCachedAnswers } =
  createCacheHelper(fetchCachableData)
