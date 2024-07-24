import { MarketContract } from 'common/contract'
import { Answer } from 'common/answer'
import { LimitBet } from 'common/bet'
import { log } from 'shared/utils'

export type CacheEntry = {
  contract: MarketContract
  answers: Answer[] | undefined
  unfilledBets: LimitBet[]
  revalidationPromise?: () => Promise<void>
}
export const contractBetCache: {
  [contractId: string]: CacheEntry
} = {}

export const revalidateBetCache = (contractId: string) => {
  contractBetCache[contractId]?.revalidationPromise?.()
  log(`[cache] Revalidating in advance for the next run on ${contractId}`)
}

export const setRevalidateBetCachePromise = (
  contractId: string,
  revalidate: () => Promise<void>
) => {
  if (!contractBetCache[contractId]) {
    contractBetCache[contractId] = {} as CacheEntry
  }
  contractBetCache[contractId].revalidationPromise = revalidate
}

export const setBetCache = (
  contract: MarketContract,
  answers: Answer[] | undefined,
  unfilledBets: LimitBet[]
) => {
  const oldCache = contractBetCache[contract.id]
  const prevAnswers = oldCache?.answers ?? []
  contractBetCache[contract.id] = {
    contract,
    // non sums-to-one contracts can accumulate answers
    answers: prevAnswers
      .filter((a) => !(answers ?? []).find((a2) => a2.id === a.id))
      .concat(answers ?? []),
    unfilledBets,
    revalidationPromise: oldCache?.revalidationPromise,
  }
  log(`[cache] Set cache for ${contract.id}`)
}
