import { Contract } from 'common/contract'

// Immutable per-contract metadata, used to choose the queue key *before* the
// contract is fetched. `mechanism` and `shouldAnswersSumToOne` are fixed at
// creation, so this cache never needs invalidation.
type ContractMeta = { mechanism: string; shouldAnswersSumToOne: boolean }
const metaCache = new Map<string, ContractMeta>()

export const cacheContractMeta = (contract: Contract) => {
  if (metaCache.has(contract.id)) return
  metaCache.set(contract.id, {
    mechanism: contract.mechanism,
    shouldAnswersSumToOne:
      'shouldAnswersSumToOne' in contract
        ? !!contract.shouldAnswersSumToOne
        : false,
  })
}

// True when an independent answer of this contract may be keyed/persisted on its
// own: a known (cached) multiple-choice market whose answers do not sum to one
// (sum-to-one answers are arbitrage-coupled and must stay coupled). On a cache
// miss we return false and fall back to the coarse contract key, which is always
// safe; the cache warms from the first fetch of the contract.
export const canParallelizeAnswer = (
  contractId: string,
  answerId: string | undefined
) => {
  if (!answerId) return false
  const meta = metaCache.get(contractId)
  return (
    !!meta && meta.mechanism === 'cpmm-multi-1' && !meta.shouldAnswersSumToOne
  )
}

// The queue dependency token for an answer's pool. Independent answers get their
// own token so operations on different answers run in parallel; binary /
// sum-to-one / unknown fall back to the coarse contract token. Falling back is
// always safe — it can only serialize more operations together, never fewer.
//
// Invariant: every transaction that writes an answer's pool (bets, sells) must
// enqueue with that answer's pool token. Pool exclusion comes from the queue, not
// the database — single-answer ops on independent answers run at READ COMMITTED,
// where a concurrent read-compute-write of the same pool would silently lose an
// update. Ops that touch several answers (multi-bet, multi-sell) take one token
// per touched answer plus the coarse contract token, which also keeps them
// serialized among themselves.
export const getPoolDepToken = (
  contractId: string,
  answerId: string | undefined
) =>
  canParallelizeAnswer(contractId, answerId)
    ? `${contractId}:${answerId}`
    : contractId
