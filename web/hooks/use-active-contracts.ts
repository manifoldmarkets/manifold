import _ from 'lodash'
import { useRef } from 'react'

import { Fold } from '../../common/fold'
import { User } from '../../common/user'
import { filterDefined } from '../../common/util/array'
import { Bet, getRecentBets } from '../lib/firebase/bets'
import { Comment, getRecentComments } from '../lib/firebase/comments'
import { Contract, getActiveContracts } from '../lib/firebase/contracts'
import { listAllFolds } from '../lib/firebase/folds'
import { findActiveContracts } from '../pages/activity'
import { useActiveContracts } from './use-contracts'
import { useFollowedFolds } from './use-fold'
import { useUserBetContracts } from './use-user-bets'

// used in static props
export const getAllContractInfo = async () => {
  let [contracts, folds] = await Promise.all([
    getActiveContracts().catch((_) => []),
    listAllFolds().catch(() => []),
  ])

  const [recentBets, recentComments] = await Promise.all([
    getRecentBets(),
    getRecentComments(),
  ])

  return { contracts, recentBets, recentComments, folds }
}

export const useFindActiveContracts = (
  props: {
    contracts: Contract[]
    folds: Fold[]
    recentBets: Bet[]
    recentComments: Comment[]
  },
  user: User | undefined | null
) => {
  const { recentBets, recentComments } = props
  const contracts = useActiveContracts() ?? props.contracts

  const followedFoldIds = useFollowedFolds(user)

  const followedFolds = filterDefined(
    (followedFoldIds ?? []).map((id) =>
      props.folds.find((fold) => fold.id === id)
    )
  )

  // Save the initial followed fold slugs.
  const followedFoldSlugsRef = useRef<string[] | undefined>()
  if (followedFoldIds && !followedFoldSlugsRef.current)
    followedFoldSlugsRef.current = followedFolds.map((f) => f.slug)
  const initialFollowedFoldSlugs = followedFoldSlugsRef.current

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

  const activeContracts = findActiveContracts(
    feedContracts,
    recentComments,
    recentBets
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

  return {
    activeContracts,
    activeBets,
    activeComments,
    initialFollowedFoldSlugs,
  }
}
