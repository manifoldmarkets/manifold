import _ from 'lodash'

import { Fold } from '../../common/fold'
import { User } from '../../common/user'
import { filterDefined } from '../../common/util/array'
import { Bet, getRecentBets } from '../lib/firebase/bets'
import { Comment, getRecentComments } from '../lib/firebase/comments'
import { Contract, listAllContracts } from '../lib/firebase/contracts'
import { listAllFolds } from '../lib/firebase/folds'
import { findActiveContracts } from '../pages/activity'
import { useUpdatedContracts } from './use-contracts'
import { useFollowedFolds } from './use-fold'
import { useUserBetContracts } from './use-user-bets'

// used in static props
export const getAllContractInfo = async () => {
  let [contracts, folds] = await Promise.all([
    listAllContracts().catch((_) => []),
    listAllFolds().catch(() => []),
  ])

  const [recentBets, recentComments] = await Promise.all([
    getRecentBets(),
    getRecentComments(),
  ])

  return { contracts, recentBets, recentComments, folds }
}

export const useActiveContracts = (
  props: {
    contracts: Contract[]
    folds: Fold[]
    recentBets: Bet[]
    recentComments: Comment[]
  },
  user: User | undefined | null
) => {
  const contracts = useUpdatedContracts(props.contracts)

  const followedFoldIds = useFollowedFolds(user)

  const followedFolds = filterDefined(
    (followedFoldIds ?? []).map((id) =>
      props.folds.find((fold) => fold.id === id)
    )
  )

  const followedFoldSlugs =
    followedFoldIds === undefined ? undefined : followedFolds.map((f) => f.slug)

  const tagSet = new Set(
    _.flatten(followedFolds.map((fold) => fold.lowercaseTags))
  )

  const yourBetContractIds = useUserBetContracts(user?.id)
  const yourBetContracts = yourBetContractIds
    ? new Set(yourBetContractIds)
    : undefined

  // Show no contracts before your info is loaded.
  let feedContracts: Contract[] = []
  if (yourBetContracts && followedFoldIds) {
    // Show all contracts if no folds are followed.
    if (followedFoldIds.length === 0) feedContracts = contracts
    else
      feedContracts = contracts.filter(
        (contract) =>
          contract.lowercaseTags.some((tag) => tagSet.has(tag)) ||
          yourBetContracts.has(contract.id)
      )
  }

  const { recentComments, recentBets } = props

  const activeContracts = findActiveContracts(
    feedContracts,
    recentComments,
    recentBets,
    365
  )

  const betsByContract = _.groupBy(recentBets, (bet) => bet.contractId)

  const activeBets = activeContracts.map(
    (contract) => betsByContract[contract.id] ?? []
  )

  const commentsByContract = _.groupBy(
    recentComments,
    (comment) => comment.contractId
  )

  const activeComments = activeContracts.map(
    (contract) => commentsByContract[contract.id] ?? []
  )

  return { activeContracts, activeBets, activeComments, followedFoldSlugs }
}
