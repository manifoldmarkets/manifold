import { Bet } from 'common/bet'
import { getInitialProbability } from 'common/calculate'
import { BinaryContract, PseudoNumericContract } from 'common/contract'
import { HistoryPoint } from 'common/src/chart'
import {
  CONTRACT_BET_FILTER,
  getBets,
  getTotalBetCount,
} from 'common/supabase/bets'
import { getAllComments } from 'common/supabase/comments'
import {
  ShareholderStats,
  getCPMMContractUserContractMetrics,
  getContractMetricsOutcomeCount,
  getTopContractMetrics,
  getTotalContractMetrics,
} from 'common/supabase/contract-metrics'
import {
  getContractAnswers,
  getContractFromSlug,
} from 'common/supabase/contracts'
import { getUserIsMember } from 'common/supabase/groups'
import { getRelatedContracts } from 'common/supabase/related-contracts'
import { removeUndefinedProps } from 'common/util/object'
import { compressPoints, pointsToBase64 } from 'common/util/og'
import { createSupabaseClient } from 'shared/supabase/init'
import { getUser } from 'shared/utils'
import { z } from 'zod'
import { APIError, MaybeAuthedEndpoint, validate } from './helpers'
import { getIsAdmin } from 'common/supabase/is-admin'

const bodySchema = z.object({
  contractSlug: z.string(),
  fromStaticProps: z.boolean(),
})

export const getcontractparams = MaybeAuthedEndpoint(async (req, auth) => {
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
      ? { contractSlug: contract.slug, visibility: contract.visibility }
      : { contractSlug, visibility: null }
  }

  if (contract.mechanism === 'cpmm-multi-1') {
    // Denormalize answers for CPMM multi.
    const answers = await getContractAnswers(db, contract.id)
    if (answers) contract.answers = answers
  }

  const totalBets = await getTotalBetCount(contract.id, db)
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

  const relatedContracts = await getRelatedContracts(contract, 20, db, true)
  return {
    contractSlug: contract.slug,
    visibility: contract.visibility,
    contractParams: removeUndefinedProps({
      contract,
      historyData: {
        bets: shouldUseBetPoints ? bets.slice(0, 100) : bets,
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
      shareholderStats,
    }),
  }
})
