import { Bet, calculateMultiBets } from 'common/bet'
import { getInitialProbability } from 'common/calculate'
import {
  BinaryContract,
  MaybeAuthedContractParams as Ret,
  PseudoNumericContract,
} from 'common/contract'
import { MultiSerializedPoint, SerializedPoint } from 'common/src/chart'
import { getBets, getTotalBetCount } from 'common/supabase/bets'
import { getAllComments } from 'common/supabase/comments'
import {
  ShareholderStats,
  getCPMMContractUserContractMetrics,
  getContractMetricsOutcomeCount,
  getTopContractMetrics,
  getTotalContractMetrics,
} from 'common/supabase/contract-metrics'
import { getContractFromSlug } from 'common/supabase/contracts'
import { getUserIsMember } from 'common/supabase/groups'
import { getRelatedContracts } from 'common/supabase/related-contracts'
import { removeUndefinedProps } from 'common/util/object'
import { compressItems, pointsToBase64 } from 'common/util/og'
import { createSupabaseClient } from 'shared/supabase/init'
import { getUser } from 'shared/utils'
import { z } from 'zod'
import { APIError, MaybeAuthedEndpoint, validate } from './helpers'
import { getIsAdmin } from 'common/supabase/is-admin'
import { groupBy } from 'lodash'
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
    throw new APIError(404, 'This contract does not exist!')
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
  const includingSingleBetPts = contract.mechanism === 'cpmm-1'
  const includingMultiBetPts = contract.mechanism === 'cpmm-multi-1'

  // prioritize newer bets via descending order
  const bets =
    contract.mechanism == 'none'
      ? []
      : await getBets(db, {
          contractId: contract.id,
          filterRedemptions: !includingMultiBetPts,
          limit: includingSingleBetPts ? 50000 : 4000,
          order: 'desc',
        })

  const betPoints: SerializedPoint<Partial<Bet>>[] = includingSingleBetPts
    ? bets.map(
        (bet) =>
          buildArray([
            bet.createdTime,
            bet.probAfter,
            totalBets < 1000 ? { userAvatarUrl: bet.userAvatarUrl } : undefined,
          ]) as any
      )
    : []

  let multiBetPoints: MultiSerializedPoint[] = []
  if (includingMultiBetPts) {
    multiBetPoints = calculateMultiBets(
      bets,
      contract.answers.map((a) => a.id)
    )
  }

  const comments = await getAllComments(db, contract.id, 100)

  const userPositionsByOutcome =
    contract.mechanism === 'cpmm-1'
      ? await getCPMMContractUserContractMetrics(contract.id, 100, db)
      : {}

  const topContractMetrics = contract.resolution
    ? await getTopContractMetrics(contract.id, 10, db)
    : []

  let shareholderStats: ShareholderStats | undefined = undefined
  if (contract.mechanism === 'cpmm-1') {
    const yesCount = await getContractMetricsOutcomeCount(
      contract.id,
      'yes',
      db
    )
    const noCount = await getContractMetricsOutcomeCount(contract.id, 'no', db)
    shareholderStats = {
      yesShareholders: yesCount,
      noShareholders: noCount,
    }
  }
  const totalPositions =
    contract.mechanism === 'cpmm-1'
      ? await getTotalContractMetrics(contract.id, db)
      : 0

  if (includingSingleBetPts) {
    const firstPoint = [
      contract.createdTime,
      getInitialProbability(contract as BinaryContract | PseudoNumericContract),
    ] as const

    betPoints.push(firstPoint)
    betPoints.reverse()
  }

  const pointsString =
    contract.visibility != 'private'
      ? pointsToBase64(compressItems(betPoints))
      : undefined

  const creator = await getUser(contract.creatorId)

  const relatedContracts = await getRelatedContracts(contract, 20, db, true)
  return {
    state: 'authed',
    params: removeUndefinedProps({
      outcomeType: contract.outcomeType,
      contract,
      historyData: {
        bets: includingSingleBetPts
          ? bets.slice(0, 100)
          : includingMultiBetPts
          ? bets.filter((b) => !b.isRedemption)
          : bets,
        points: includingMultiBetPts ? multiBetPoints : betPoints,
      },
      pointsString,
      comments,
      userPositionsByOutcome,
      totalPositions,
      totalBets,
      topContractMetrics,
      creatorTwitter: creator?.twitterHandle,
      relatedContracts,
      shareholderStats,
    }),
  }
})
