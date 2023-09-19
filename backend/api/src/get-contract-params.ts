import { calculateMultiBets } from 'common/bet'
import { getInitialProbability } from 'common/calculate'
import { Contract, MaybeAuthedContractParams as Ret } from 'common/contract'
import { binAvg, maxMinBin, serializeMultiPoints } from 'common/chart'
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
import { SupabaseClient } from 'common/supabase/utils'
import { buildArray } from 'common/util/array'

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

  const isCpmm1 = contract.mechanism === 'cpmm-1'
  const hasMechanism = contract.mechanism !== 'none'
  const isMulti = contract.mechanism === 'cpmm-multi-1'
  const isBinaryDpm = contract.mechanism === 'dpm-2'

  const [
    canAccessContract,
    totalBets,
    betsToPass,
    allBetPoints,
    comments,
    userPositionsByOutcome,
    topContractMetrics,
    totalPositions,
    creator,
    relatedContracts,
  ] = await Promise.all([
    getCanAccessContract(contract, auth?.uid, fromStaticProps, db),
    hasMechanism ? getTotalBetCount(contract.id, db) : 0,
    hasMechanism
      ? getBets(db, {
          contractId: contract.id,
          limit: 100,
          order: 'desc',
          filterAntes: true,
          filterRedemptions: true,
        })
      : [],
    hasMechanism
      ? getBetPoints(db, contract.id, contract.mechanism === 'cpmm-multi-1')
      : [],
    getRecentTopLevelCommentsAndReplies(db, contract.id, 25),
    isCpmm1 ? getCPMMContractUserContractMetrics(contract.id, 100, db) : {},
    contract.resolution ? getTopContractMetrics(contract.id, 10, db) : [],
    isCpmm1 ? getTotalContractMetrics(contract.id, db) : 0,
    getUser(contract.creatorId),
    getRelatedContracts(contract, 20, db, true),
  ])

  if (!canAccessContract) {
    return contract && !contract.deleted
      ? {
          state: 'not authed',
          slug: contract.slug,
          visibility: contract.visibility,
        }
      : { state: 'not found' }
  }

  let chartPoints =
    isCpmm1 || isBinaryDpm
      ? buildArray<{ x: number; y: number }>(
          isCpmm1 && {
            x: contract.createdTime,
            y: getInitialProbability(contract),
          },
          maxMinBin(allBetPoints, 500)
        ).map((p) => [p.x, p.y] as const)
      : isMulti
      ? serializeMultiPoints(calculateMultiBets(allBetPoints))
      : []

  const ogPoints =
    isCpmm1 && contract.visibility !== 'private' ? binAvg(allBetPoints) : []
  const pointsString = pointsToBase64(ogPoints.map((p) => [p.x, p.y] as const))

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
const getCanAccessContract = async (
  contract: Contract,
  uid: string | undefined,
  fromStaticProps: boolean,
  db: SupabaseClient
): Promise<boolean> => {
  const groupId = contract.groupLinks?.length
    ? contract.groupLinks[0].groupId
    : undefined
  const isAdmin = uid ? await getIsAdmin(db, uid) : false

  return (
    (!contract.deleted || isAdmin) &&
    (contract.visibility !== 'private' ||
      (!fromStaticProps &&
        groupId !== undefined &&
        uid !== undefined &&
        (isAdmin || (await getUserIsMember(db, groupId, uid)))))
  )
}
