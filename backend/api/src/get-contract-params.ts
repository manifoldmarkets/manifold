import { calculateMultiBets } from 'common/bet'
import { getInitialProbability } from 'common/calculate'
import { MaybeAuthedContractParams as Ret } from 'common/contract'
import { binAvg, maxMinBin } from 'common/chart'
import { getBets, getBetPoints, getTotalBetCount } from 'common/supabase/bets'
import { getRecentTopLevelCommentsAndReplies } from 'common/supabase/comments'
import {
  getCPMMContractUserContractMetrics,
  getTopContractMetrics,
  getTotalContractMetrics,
} from 'common/supabase/contract-metrics'
import { getContractFromSlug } from 'common/supabase/contracts'
import { getUserIsMember } from 'common/supabase/groups'
import { getRelatedContracts } from 'common/supabase/related-contracts'
import { removeUndefinedProps } from 'common/util/object'
import { createSupabaseClient } from 'shared/supabase/init'
import { getUser } from 'shared/utils'
import { z } from 'zod'
import { APIError, MaybeAuthedEndpoint, validate } from './helpers'
import { getIsAdmin } from 'common/supabase/is-admin'
import { pointsToBase64 } from 'common/util/og'
import { getChartPoints } from 'common/supabase/chart-points'

const bodySchema = z.object({
  contractSlug: z.string(),
  fromStaticProps: z.boolean(),
})

export const getcontractparams = MaybeAuthedEndpoint<Ret>(async (req, auth) => {
  const { contractSlug, fromStaticProps } = validate(bodySchema, req.body)
  const db = createSupabaseClient()
  const contract = await getContractFromSlug(contractSlug, db)

  if (!contract) {
    throw new APIError(404, 'This contract does not exist')
  }

  if (contract.visibility === 'private') {
    if (!contract.groupLinks) {
      throw new APIError(500, 'No associated group with this private contract')
    }

    if (contract.groupLinks.length > 1) {
      throw new APIError(
        500,
        'Too many groups associated with this private contract'
      )
    }
  }
  const groupId =
    contract.groupLinks && contract.groupLinks.length > 0
      ? contract.groupLinks[0].groupId
      : undefined

  const isAdmin = await getIsAdmin(db, auth?.uid)
  const canAccessContract =
    // can't access if contract is deleted
    (!contract.deleted || isAdmin) &&
    // can access if contract is not private
    (contract.visibility != 'private' ||
      // if contract is private, can't access if in static props
      (!fromStaticProps &&
        // otherwise, can access if user can access contract's group
        auth &&
        groupId &&
        (await getUserIsMember(db, groupId, auth?.uid))))

  if (!canAccessContract && !isAdmin) {
    return contract && !contract.deleted
      ? {
          state: 'not authed',
          slug: contract.slug,
          visibility: contract.visibility,
        }
      : { state: 'not found' }
  }

  const totalBets =
    contract.mechanism == 'none' ? 0 : await getTotalBetCount(contract.id, db)

  const comments = await getRecentTopLevelCommentsAndReplies(
    db,
    contract.id,
    50
  )

  const userPositionsByOutcome =
    contract.mechanism === 'cpmm-1'
      ? await getCPMMContractUserContractMetrics(contract.id, 100, db)
      : {}

  const topContractMetrics = contract.resolution
    ? await getTopContractMetrics(contract.id, 10, db)
    : []

  const totalPositions =
    contract.mechanism === 'cpmm-1'
      ? await getTotalContractMetrics(contract.id, db)
      : 0

  const creator = await getUser(contract.creatorId)

  const relatedContracts = await getRelatedContracts(contract, 20, db, true)

  const isSingle = contract.mechanism === 'cpmm-1'

  const { allBetPoints, chartPoints } = await getChartPoints(contract, db)

  const ogPoints =
    isSingle && contract.visibility !== 'private' ? binAvg(allBetPoints) : []

  const pointsString = pointsToBase64(ogPoints.map((p) => [p.x, p.y] as const))

  const betsToPass =
    contract.mechanism == 'none'
      ? []
      : await getBets(db, {
          contractId: contract.id,
          limit: 100,
          order: 'desc',
          filterAntes: true,
          filterRedemptions: true,
        })

  return {
    state: 'authed',
    params: removeUndefinedProps({
      outcomeType: contract.outcomeType,
      contract,
      historyData: {
        bets: betsToPass,
        points: chartPoints,
      },
      pointsString,
      comments,
      userPositionsByOutcome,
      totalPositions,
      totalBets,
      topContractMetrics,
      creatorTwitter: creator?.twitterHandle,
      relatedContracts,
    }),
  }
})
