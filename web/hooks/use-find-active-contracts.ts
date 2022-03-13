import _ from 'lodash'
import { useMemo, useRef } from 'react'

import { Fold } from '../../common/fold'
import { User } from '../../common/user'
import { filterDefined } from '../../common/util/array'
import { Bet } from '../lib/firebase/bets'
import { Comment, getRecentComments } from '../lib/firebase/comments'
import { Contract, getActiveContracts } from '../lib/firebase/contracts'
import { listAllFolds } from '../lib/firebase/folds'
import { findActiveContracts } from '../components/activity-feed'
import { useInactiveContracts } from './use-contracts'
import { useFollowedFolds } from './use-fold'
import { useUserBetContracts } from './use-user-bets'

// used in static props
export const getAllContractInfo = async () => {
  let [contracts, folds] = await Promise.all([
    getActiveContracts().catch((_) => []),
    listAllFolds().catch(() => []),
  ])

  const recentComments = await getRecentComments()

  return { contracts, recentComments, folds }
}

const defaultExcludedTags = [
  'meta',
  'test',
  'trolling',
  'spam',
  'transaction',
  'personal',
]
const includedWithDefaultFeed = (contract: Contract) => {
  const { lowercaseTags } = contract

  if (lowercaseTags.length === 0) return false
  if (lowercaseTags.some((tag) => defaultExcludedTags.includes(tag)))
    return false
  return true
}

export const useFilterYourContracts = (
  user: User | undefined | null,
  folds: Fold[],
  contracts: Contract[]
) => {
  const followedFoldIds = useFollowedFolds(user)

  const followedFolds = filterDefined(
    (followedFoldIds ?? []).map((id) => folds.find((fold) => fold.id === id))
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
  let yourContracts: Contract[] = []
  if (yourBetContracts && followedFoldIds) {
    // Show default contracts if no folds are followed.
    if (followedFoldIds.length === 0)
      yourContracts = contracts.filter(includedWithDefaultFeed)
    else
      yourContracts = contracts.filter(
        (contract) =>
          contract.lowercaseTags.some((tag) => tagSet.has(tag)) ||
          yourBetContracts.has(contract.id)
      )
  }

  return {
    yourContracts,
    initialFollowedFoldSlugs,
  }
}

export const useFindActiveContracts = (props: {
  contracts: Contract[]
  recentBets: Bet[]
  recentComments: Comment[]
}) => {
  const { contracts, recentBets, recentComments } = props

  const activeContracts = findActiveContracts(
    contracts,
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
  }
}

export const useExploreContracts = (maxContracts = 75) => {
  const inactiveContracts = useInactiveContracts()

  const contractsDict = _.fromPairs(
    (inactiveContracts ?? []).map((c) => [c.id, c])
  )

  // Preserve random ordering once inactiveContracts loaded.
  const exploreContractIds = useMemo(
    () => _.shuffle(Object.keys(contractsDict)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [!!inactiveContracts]
  ).slice(0, maxContracts)

  if (!inactiveContracts) return undefined

  return filterDefined(exploreContractIds.map((id) => contractsDict[id]))
}
