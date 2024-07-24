import { Contract, MarketContract } from 'common/contract'
import { Answer } from 'common/answer'
import { LimitBet } from 'common/bet'
import { getContract, getUser, log } from 'shared/utils'
import { SupabaseDirectClient, SupabaseTransaction } from 'shared/supabase/init'
import { sortBy, uniq, uniqBy } from 'lodash'
import { APIError } from 'common/api/utils'
import { getAnswer, getAnswersForContract } from 'shared/supabase/answers'
import { BLESSED_BANNED_USER_IDS } from 'common/envs/constants'
import { convertBet } from 'common/supabase/bets'

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

const fetchCachableData = async (
  pgTrans: SupabaseDirectClient,
  contractId: string,
  answerId?: string,
  answerIds?: string[]
) => {
  const contract = await getContract(pgTrans, contractId)
  if (!contract) throw new APIError(404, 'Contract not found.')
  if (contract.mechanism === 'none' || contract.mechanism === 'qf')
    throw new APIError(400, 'This is not a market')

  const { closeTime } = contract
  if (closeTime && Date.now() > closeTime)
    throw new APIError(403, 'Trading is closed.')

  const [answers, unfilledBets] = await Promise.all([
    getAnswersForBet(pgTrans, contract, answerId, answerIds),
    getUnfilledBets(
      pgTrans,
      contractId,
      'shouldAnswersSumToOne' in contract && contract.shouldAnswersSumToOne
        ? undefined
        : answerId
    ),
  ])

  return { contract, answers, unfilledBets }
}

const getAnswersForBet = async (
  pgTrans: SupabaseDirectClient,
  contract: Contract,
  answerId: string | undefined,
  answerIds: string[] | undefined
) => {
  const { mechanism } = contract
  const contractId = contract.id
  if (
    (mechanism === 'cpmm-multi-1' && contract.shouldAnswersSumToOne) ||
    answerIds
  ) {
    return await getAnswersForContract(pgTrans, contractId)
  }
  if (answerId && mechanism === 'cpmm-multi-1') {
    // Only fetch the one answer if it's independent multi.
    const answer = await getAnswer(pgTrans, answerId)
    if (answer)
      return sortBy(
        uniqBy([answer, ...contract.answers], (a) => a.id),
        (a) => a.index
      )
  }
  return undefined
}

export const fetchContractBetDataAndValidate = async (
  pgTrans: SupabaseDirectClient,
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

  // const answersNeeded = buildArray(
  //   'answerId' in body ? body.answerId : undefined,
  //   'answerIds' in body ? body.answerIds : undefined
  // )

  const awaitStart = Date.now()
  const cached = await getCachedResult(
    contractId,
    pgTrans,
    contractId,
    body.answerId,
    body.answerIds
  )
  log(`[cache] Revalidation took ${Date.now() - awaitStart}ms for`)
  // const missingAnswersInCache = answersNeeded.some(
  //   (answerId) =>
  //     !cached?.answers || !cached.answers.find((a) => a.id === answerId)
  // )
  const { contract, answers, unfilledBets } = cached

  const unfilledBetUserIds = uniq(unfilledBets.map((bet) => bet.userId))

  const uncachedStart = Date.now()
  const [user, balanceByUserId] = await Promise.all([
    validateBet(pgTrans, uid, amount, contract, isApi),
    getUserBalances(pgTrans, unfilledBetUserIds),
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

const createCacheHelper = <T>(fn: (...args: any[]) => Promise<T>) => {
  const caches = new Map<
    string,
    {
      data: T | null
      isRevalidating: boolean
      waitingPromises: ((value: T | PromiseLike<T>) => void)[]
    }
  >()

  const getCachedResult = async (key: string, ...args: any[]): Promise<T> => {
    if (!caches.has(key)) {
      caches.set(key, {
        data: null,
        isRevalidating: false,
        waitingPromises: [],
      })
    }
    const cache = caches.get(key)!

    if (cache.data && !cache.isRevalidating) {
      log(`[cache] Returning cached data for ${key}`)
      return cache.data
    }

    if (cache.isRevalidating) {
      log(`[cache] Waiting in line for revalidation for ${key}`)
      return new Promise<T>((resolve) => {
        cache.waitingPromises.push(resolve)
      })
    }

    cache.isRevalidating = true
    try {
      log(`[cache] Revalidating cache for ${key}`)
      const result = await fn(...args)
      log(`[cache] Revalidation complete for ${key}`)
      cache.data = result
      log(`[cache] Resolving ${cache.waitingPromises.length} promises`)
      cache.waitingPromises.forEach((resolve) => resolve(result))
      cache.waitingPromises = []
      return result
    } finally {
      cache.isRevalidating = false
    }
  }
  const invalidateCache = (key: string): void => {
    log(`[cache] Invalidating cache for ${key}`)
    if (caches.has(key)) {
      const cache = caches.get(key)!
      cache.data = null
      cache.isRevalidating = false
      cache.waitingPromises = []
    }
  }
  const getKeys = (): string[] => Array.from(caches.keys())

  return {
    getKeys,
    getCachedResult,
    invalidateCache,
  }
}

type CacheEntry = {
  contract: MarketContract
  answers: Answer[] | undefined
  unfilledBets: LimitBet[]
}
export const { getCachedResult, invalidateCache, getKeys } =
  createCacheHelper<CacheEntry>(fetchCachableData)
