import { z } from 'zod'
import {
  APIError,
  MaybeAuthedEndpoint,
  authEndpoint,
  validate,
} from './helpers'
import {
  createSupabaseClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import {
  BinaryContract,
  Contract,
  PseudoNumericContract,
} from 'common/contract'
import { getUserIsMember } from 'shared/helpers/get-user-is-member'
import { Bet } from 'common/bet'
import { removeUndefinedProps } from 'common/util/object'
import { HistoryPoint } from 'common/src/chart'
import { IDatabase } from 'pg-promise'
import { ContractMetric } from 'common/contract-metric'
import { ContractMetrics } from 'common/calculate-metrics'
import {
  ShareholderStats,
  getTotalContractMetrics,
} from 'common/supabase/contract-metrics'
import { getInitialProbability } from 'common/calculate'
import { compressPoints, pointsToBase64 } from 'common/util/og'
import { getUser } from 'shared/utils'
import { getRelatedContracts } from 'common/supabase/related-contracts'
import {
  CONTRACT_BET_FILTER,
  getBets,
  getTotalBetCount,
} from 'common/supabase/bets'
import { getAllComments } from 'common/supabase/comments'

const bodySchema = z.object({
  contractSlug: z.string(),
})

export const getcontractparams = MaybeAuthedEndpoint(async (req, auth) => {
  const { contractSlug } = validate(bodySchema, req.body)
  //   if (!auth.uid) {
  //     return false
  //   }
  //   const userCanAccess = await getUserIsMember(pg, groupId, auth.uid)
  const db = createSupabaseClient()
  const pg = createSupabaseDirectClient()
  const contract = (
    await pg.one(`select data from contracts where slug = $1`, [contractSlug])
  ).data

  // console.log('RELATED CONTRACTS', relatedContracts)
  const groupId =
    contract.groupLinks && contract.groupLinks.length > 0
      ? contract.groupLinks[0].groupId
      : undefined
  const canAccessContract =
    contract.visibility != 'private' ||
    (auth && groupId && (await getUserIsMember(pg, groupId, auth?.uid)))
  if (canAccessContract) {
    const totalBets = await getTotalBetCount(contract.id, db)
    // console.log('totalBets', totalBets)
    const shouldUseBetPoints = contract.mechanism === 'cpmm-1'

    // in original code, prioritize newer bets via descending order

    const bets = await getBets(db, {
      contractId: contract.id,
      ...CONTRACT_BET_FILTER,
      limit: shouldUseBetPoints ? 50000 : 4000,
      order: 'desc',
    })

    const betPoints = shouldUseBetPoints
      ? bets.map(
          (bet) =>
            removeUndefinedProps({
              x: bet.createdTime,
              y: bet.probAfter,
              obj:
                totalBets < 1000
                  ? { userAvatarUrl: bet.userAvatarUrl }
                  : undefined,
            }) as HistoryPoint<Partial<Bet>>
        )
      : []

    const comments = await getAllComments(db, contract.id, 100)

    const userPositionsByOutcome =
      contract.mechanism === 'cpmm-1'
        ? await fetchCPMMContractUserContractMetrics(pg, contract.id, 100)
        : {}

    const topContractMetrics = contract.resolution
      ? await fetchTopContractMetrics(pg, contract.id, 10)
      : []

    // console.log('topContractMetrics', topContractMetrics)
    let shareholderStats: ShareholderStats | undefined = undefined
    if (contract.mechanism === 'cpmm-1') {
      const yesCount = await fetchContractMetricsOutcomeCount(
        pg,
        contract.id,
        'yes'
      )
      const noCount = await fetchContractMetricsOutcomeCount(
        pg,
        contract.id,
        'no'
      )
      shareholderStats = {
        yesShareholders: yesCount,
        noShareholders: noCount,
      }
    }
    // console.log('shareholderStats', shareholderStats)
    const totalPositions =
      contract.mechanism === 'cpmm-1'
        ? await getTotalContractMetrics(contract.id, db)
        : 0

    if (shouldUseBetPoints) {
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

    const creator = await getUser(contract.creatorId)

    const relatedContracts = await getRelatedContracts(contract, 9, db)
  }
  // checks if user is member

  if (canAccessContract) {
    return contract
  }
  return null
})

function contractErrors(contract: Contract) {
  if (!contract) {
    throw new APIError(400, 'This contract does not exist!')
  }

  if (contract.visibility === 'private') {
    if (!contract.groupLinks) {
      throw new APIError(400, 'No associated group with this private contract.')
    }

    if (contract.groupLinks.length > 1) {
      throw new APIError(
        400,
        'Too many groups associated with this private contract!'
      )
    }
  }
}

async function fetchComments(
  pg: IDatabase<any>,
  contractId: string,
  limit: number
): Promise<Comment[]> {
  const sqlQuery = `
    SELECT data
    FROM contract_comments
    WHERE contract_id = $1
    ORDER BY created_time DESC
    LIMIT $2
  `

  try {
    const results = await pg.manyOrNone(sqlQuery, [contractId, limit])
    return results.map((result) => result.data)
  } catch (error) {
    console.error('Error fetching comments:', error)
    return []
  }
}

async function fetchCPMMContractUserContractMetrics(
  pg: IDatabase<any>,
  contractId: string,
  limit: number
) {
  function getQuery(outcome: 'yes' | 'no') {
    return `
      select data from user_contract_metrics 
      where contract_id = $1
      and has_${outcome}_shares = true
      order by total_shares_${outcome} desc
      limit $2
  `
  }

  try {
    const yesDocs = await pg.manyOrNone(getQuery('yes'), [contractId, limit])
    const noDocs = await pg.manyOrNone(getQuery('no'), [contractId, limit])
    return {
      YES: yesDocs.map((doc) => doc.data as ContractMetrics),
      NO: noDocs.map((doc) => doc.data as ContractMetrics),
    }
  } catch (error) {
    console.error('Error fetching user contract metrics:', error)
    return {}
  }
}

async function fetchTopContractMetrics(
  pg: IDatabase<any>,
  contractId: string,
  limit: number
) {
  const sqlQuery = `
      select data from user_contract_metrics 
      where contract_id = $1
      order by profit desc
      limit $2
  `
  try {
    const result = await pg.manyOrNone(sqlQuery, [contractId, limit])
    return result.map((doc) => doc.data as ContractMetrics)
  } catch (error) {
    console.error('Error fetching user contract metrics:', error)
    return {}
  }
}

async function fetchContractMetricsOutcomeCount(
  pg: IDatabase<any>,
  contractId: string,
  outcome: 'yes' | 'no'
): Promise<number> {
  const sqlQuery = `
    SELECT COUNT(*)
    FROM user_contract_metrics
    WHERE contract_id = $1
      AND has_${outcome}_shares = true
  `

  try {
    const result = await pg.one<{ count: number }>(sqlQuery, [contractId])
    return result.count
  } catch (error) {
    console.error('Error fetching contract metrics yes count:', error)
    return 0
  }
}
