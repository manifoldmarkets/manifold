import { calculateMultiBets } from 'common/bet'
import { getInitialProbability } from 'common/calculate'
import { MaybeAuthedContractParams as Ret } from 'common/contract'
import { binAvg, maxMinBin } from 'common/chart'
import { getBets, getBetPoints, getTotalBetCount } from 'common/supabase/bets'
import { getAllComments } from 'common/supabase/comments'
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
  const isSingle = contract.mechanism === 'cpmm-1'
  const isMulti = contract.mechanism === 'cpmm-multi-1'

  const betsToPass =
    contract.mechanism == 'none'
      ? []
      : await getBets(db, {
          contractId: contract.id,
          limit: isSingle ? 100 : isMulti ? 50000 : 4000,
          order: 'desc',
        })

  const allBetPoints =
    contract.mechanism == 'none'
      ? []
      : await getBetPoints(db, {
          contractId: contract.id,
          filterRedemptions: !isMulti,
          order: 'asc',
        })

  const last = allBetPoints[allBetPoints.length - 1]

  let chartPoints = isSingle
    ? [
        { x: contract.createdTime, y: getInitialProbability(contract) },
        ...maxMinBin(allBetPoints, 500),
        last,
      ].map((p) => [p.x, p.y] as const)
    : isMulti
    ? calculateMultiBets(
        allBetPoints,
        contract.answers.map((a) => a.id)
      )
    : []

  const ogPoints =
    isSingle && contract.visibility !== 'private' ? binAvg(allBetPoints) : []
  const pointsString = pointsToBase64(ogPoints.map((p) => [p.x, p.y] as const))

  const comments = await getAllComments(db, contract.id, 100)

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
