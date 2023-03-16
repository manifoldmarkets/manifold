import {
  BinaryContract,
  CPMMContract,
  PseudoNumericContract,
  visibility,
} from 'common/contract'
import { run, selectJson, SupabaseClient } from 'common/supabase/utils'
import { filterDefined } from 'common/util/array'
import { removeUndefinedProps } from 'common/util/object'
import {
  getBetPoints,
  getHistoryDataBets,
  shouldUseBetPoints,
} from 'web/components/contract/contract-page-helpers'
import {
  ContractParams,
  CONTRACT_BET_FILTER,
} from 'web/pages/[username]/[contractSlug]'
import { Contract } from '../firebase/contracts'
import { getBets, getTotalBetCount } from './bets'
import { getUseBetLimit } from 'web/components/contract/contract-page-helpers'
import { db } from './db'
import { getAllComments } from './comments'
import {
  getBinaryContractUserContractMetrics,
  getTopContractMetrics,
} from '../firebase/contract-metrics'
import { getTotalContractMetrics } from 'common/supabase/contract-metrics'
import { getInitialProbability } from 'common/calculate'
import { getUser } from 'web/lib/supabase/user'
import { getInitialRelatedMarkets } from 'web/hooks/use-related-contracts'
import { compressPoints, pointsToBase64 } from 'common/util/og'

export const getContract = async (id: string) => {
  const q = selectJson(db, 'contracts').eq('id', id)
  const { data } = await run(q)
  return data.length > 0 ? data[0].data : null
}

export const getContracts = async (options: {
  limit: number
  beforeTime?: number
  order?: 'asc' | 'desc'
}) => {
  let q = selectJson(db, 'contracts')
  q = q.order('data->>createdTime', {
    ascending: options?.order === 'asc',
  } as any)
  if (options.beforeTime) {
    q = q.lt('data->>createdTime', options.beforeTime)
  }
  q = q.limit(options.limit)
  const { data } = await run(q)
  return data.map((r) => r.data)
}

export async function getYourRecentContracts(
  db: SupabaseClient,
  userId: string,
  count: number
) {
  const { data } = await db.rpc('get_your_recent_contracts', {
    uid: userId,
    n: count,
    start: 0,
  })

  if (!data) return null

  const contracts = filterDefined(data.map((d) => (d as any).data))
  return contracts
}

export async function getYourDailyChangedContracts(
  db: SupabaseClient,
  userId: string,
  count: number
) {
  const { data } = await db.rpc('get_your_daily_changed_contracts', {
    uid: userId,
    n: count,
    start: 0,
  })

  if (!data) return null

  const contracts = filterDefined(
    data.map((d) => (d as any).data)
  ) as CPMMContract[]
  return contracts
}

export async function getYourTrendingContracts(
  db: SupabaseClient,
  userId: string,
  count: number
) {
  const { data } = await db.rpc('get_your_trending_contracts', {
    uid: userId,
    n: count,
    start: 0,
  })

  return data?.map((d) => (d as any).data as Contract)
}

export async function getContractFromSlug(contractSlug: string) {
  const { data: contract } = await run(
    db.from('contracts').select('data').eq('data->>slug', contractSlug)
  )
  return (contract[0] as unknown as { data: Contract }).data
}

export async function getContractVisibilityFromSlug(contractSlug: string) {
  const { data: contractVisibility } = await run(
    db
      .from('contracts')
      .select('data->>visibility')
      .eq('data->>slug', contractSlug)
  )
  return (contractVisibility[0] as unknown as { visibility: visibility })
    .visibility
}

export async function getContractParams(contract: Contract) {
  const contractId = contract?.id
  const totalBets = contractId ? await getTotalBetCount(contractId) : 0
  const useBetPoints = shouldUseBetPoints(contract)
  // Prioritize newer bets via descending order
  const bets = contractId
    ? await getBets({
        contractId,
        ...CONTRACT_BET_FILTER,
        limit: getUseBetLimit(useBetPoints),
        order: 'desc',
      })
    : []
  const includeAvatar = totalBets < 1000
  const betPoints = useBetPoints ? getBetPoints(bets, includeAvatar) : []
  const comments = contractId ? await getAllComments(contractId, 100) : []

  const userPositionsByOutcome =
    contractId && contract?.outcomeType === 'BINARY'
      ? await getBinaryContractUserContractMetrics(contractId, 100)
      : {}
  const topContractMetrics = contract?.resolution
    ? await getTopContractMetrics(contract.id, 10)
    : []
  const totalPositions =
    contractId && contract?.outcomeType === 'BINARY'
      ? await getTotalContractMetrics(contractId, db)
      : 0

  if (useBetPoints && contract) {
    const firstPoint = {
      x: contract.createdTime,
      y: getInitialProbability(
        contract as BinaryContract | PseudoNumericContract
      ),
    }
    betPoints.push(firstPoint)
    betPoints.reverse()
  }

  const pointsString =
    contract.visibility != 'private'
      ? pointsToBase64(compressPoints(betPoints))
      : undefined

  const creator = contract && (await getUser(contract.creatorId))

  const relatedContracts = contract
    ? await getInitialRelatedMarkets(contract)
    : []

  return removeUndefinedProps({
    contract,
    historyData: {
      bets: getHistoryDataBets(useBetPoints, bets),
      points: betPoints,
    },
    pointsString,
    comments,
    userPositionsByOutcome,
    totalPositions,
    totalBets,
    topContractMetrics,
    creatorTwitter: creator?.twitterHandle,
    relatedContracts,
  }) as ContractParams
}
