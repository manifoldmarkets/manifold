import { useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useFirestoreQueryData } from '@react-query-firebase/firestore'
import { countBy, sampleSize, shuffle, sortBy, uniq, uniqBy } from 'lodash'

import {
  collection,
  doc,
  limit,
  orderBy,
  Query,
  query,
  where,
} from 'firebase/firestore'
import { listenForUser, users } from 'web/lib/firebase/users'
import { AuthContext } from 'web/components/auth-context'
import { ContractMetrics } from 'common/calculate-metrics'
import { getUserContractMetricsQuery } from 'web/lib/firebase/contract-metrics'
import { buildArray, filterDefined } from 'common/util/array'
import { Contract, CPMMBinaryContract } from 'common/contract'
import { useContracts } from './use-contracts'
import { useStore, useStoreItems } from './use-store'
import { safeLocalStorage } from 'web/lib/util/local'
import { useEffectCheckEquality } from './use-effect-check-equality'
import { listenForValue } from 'web/lib/firebase/utils'
import { db } from 'web/lib/firebase/init'
import { getValues } from 'web/lib/firebase/utils'
import { ContractMetric } from 'common/contract-metric'
import { HOME_BLOCKED_GROUP_SLUGS } from 'common/envs/constants'
import { ContractCardView, ContractView } from 'common/events'
import { DAY_MS } from 'common/util/time'

export const useUser = () => {
  const authUser = useContext(AuthContext)
  return authUser ? authUser.user : authUser
}

export const usePrivateUser = () => {
  const authUser = useContext(AuthContext)
  return authUser ? authUser.privateUser : authUser
}

export const useUserById = (userId: string | undefined) => {
  return useStore(userId, listenForUser)
}

export const useUsersById = (userIds: string[]) => {
  return useStoreItems(userIds, listenForUser)
}

export const usePrefetchUsers = (userIds: string[]) => {
  useStoreItems(userIds, listenForUser)
}

// Note: we don't filter out blocked contracts/users/groups here like we do in unbet-on contracts
export const useUserContractMetricsByProfit = (userId = '_', count = 50) => {
  const positiveResult = useFirestoreQueryData<ContractMetrics>(
    ['contract-metrics-descending', userId, count],
    getUserContractMetricsQuery(userId, count, 'desc')
  )
  const negativeResult = useFirestoreQueryData<ContractMetrics>(
    ['contract-metrics-ascending', userId, count],
    getUserContractMetricsQuery(userId, count, 'asc')
  )

  const metrics = buildArray(positiveResult.data, negativeResult.data).filter(
    (m) => m.from && Math.abs(m.from.day.profit) >= 1
  )

  const contractIds = sortBy(metrics.map((m) => m.contractId))
  const contracts = useContracts(contractIds, { loadOnce: true })

  const isReady =
    positiveResult.data &&
    negativeResult.data &&
    !contracts.some((c) => c === undefined)

  const savedResult = useRef<
    | {
        metrics: ContractMetrics[]
        contracts: (Contract | null)[]
      }
    | undefined
  >(undefined)

  const result = isReady
    ? {
        metrics,
        contracts: contracts as (Contract | null)[],
      }
    : savedResult.current

  useEffectCheckEquality(() => {
    if (userId === '_') return

    const key = `user-contract-metrics-${userId}`
    if (isReady) {
      safeLocalStorage()?.setItem(key, JSON.stringify(result))
    } else if (!result) {
      const saved = safeLocalStorage()?.getItem(key)
      if (saved) {
        savedResult.current = JSON.parse(saved)
      }
    }
  }, [isReady, result, userId])

  if (!result) return undefined

  const filteredContracts = filterDefined(
    result.contracts
  ) as CPMMBinaryContract[]
  const filteredMetrics = result.metrics.filter((m) =>
    filteredContracts.find((c) => c.id === m.contractId)
  )

  return { contracts: filteredContracts, metrics: filteredMetrics }
}

export const useUserContractMetrics = (userId = '_', contractId: string) => {
  const metricsDoc = doc(users, userId, 'contract-metrics', contractId)

  const data = useStore<ContractMetrics | null>(
    ['user-contract-metrics', userId, contractId].join('/'),
    (_, setValue) => listenForValue(metricsDoc, setValue)
  )

  if (userId === '_') return undefined

  return data
}

// Note: we don't filter out blocked contracts/users/groups here like we do in unbet-on contracts
export const useUserRecommendedMarkets = (
  userId = '_',
  count = 500,
  excludeContractIds: string[] = []
) => {
  const viewedMarketsQuery = query(
    collection(db, `users/${userId}/events`),
    where('name', '==', 'view market'),
    orderBy('timestamp', 'desc'),
    limit(count)
  ) as Query<ContractView>
  const viewedMarketEvents = useFirestoreQueryData<ContractView>(
    ['user-viewed-markets', userId, count],
    viewedMarketsQuery
  )

  // Filter repeatedly seen market cards within the last week
  const viewedMarketCardsQuery = query(
    collection(db, `users/${userId}/events`),
    where('name', '==', 'view market card'),
    where('timestamp', '>', Date.now() - 7 * DAY_MS),
    orderBy('timestamp', 'desc'),
    limit(count)
  ) as Query<ContractCardView>
  const viewedMarketCardEvents = useFirestoreQueryData<ContractCardView>(
    ['user-recently-viewed-market-cards', userId, count],
    viewedMarketCardsQuery
  )
  const viewedMarketCardIds =
    viewedMarketCardEvents.data?.map((e) => e.contractId) ?? []
  // get the count the number of times each market card was viewed
  const marketCardViewCounts = countBy(viewedMarketCardIds)
  // filter out market cards that were viewed 6+ times
  const viewedMultipleTimesMarketIds = uniq(viewedMarketCardIds).filter(
    (id) => marketCardViewCounts[id] < 6
  )

  const recentBetOnContractMetrics = query(
    collection(db, `users/${userId}/contract-metrics`),
    orderBy('lastBetTime', 'desc'),
    limit(count)
  ) as Query<ContractMetric>
  const recentContractMetrics = useFirestoreQueryData<ContractMetric>(
    ['user-recent-contract-markets', userId, count],
    recentBetOnContractMetrics
  )

  const betOnContractIds =
    recentContractMetrics.data?.map((m) => m.contractId) ?? []
  const contractsRelatedToUser = sampleSize(betOnContractIds, 10)

  if (contractsRelatedToUser.length < 10) {
    // TODO: we shouldn't just get unique ids here, but weight them by how many times they've been viewed
    const allSeenContractIds = uniq(
      viewedMarketEvents.data?.map((e) => e.contractId) ?? []
    )
    contractsRelatedToUser.push(
      ...sampleSize(allSeenContractIds, 10 - contractsRelatedToUser.length)
    )
  }

  // get recommended contracts with count inversely proportional to the unique contract ids,
  // with the goal of getting 500 unique contracts
  const recommendedContracts = useRecommendedContracts(
    contractsRelatedToUser,
    userId,
    count,
    excludeContractIds.concat(
      betOnContractIds.concat(viewedMultipleTimesMarketIds)
    )
  )

  return recommendedContracts
}

const getSimilarBettorsToUserMarkets = async (
  userId: string,
  contractsThatAppealToUser?: Contract[]
) => {
  const userMarkets =
    contractsThatAppealToUser ??
    (await getValues<Contract>(
      query(
        collection(db, 'contracts'),
        where('uniqueBettorIds', 'array-contains', userId),
        orderBy('createdTime', 'desc'),
        limit(150)
      )
    ))
  return await getSimilarBettorsMarkets(userId, userMarkets)
}

const getSimilarBettorIds = (
  contractsAppealingToUser: Contract[],
  userId: string
) => {
  // get contracts with unique bettor ids
  if (contractsAppealingToUser.length === 0) return []
  // count the number of times each unique bettor id appears on those contracts
  const bettorIdsToCounts = countBy(
    contractsAppealingToUser.map((contract) => contract.uniqueBettorIds).flat(),
    (bettorId) => bettorId
  )

  // sort by number of times they appear with at least 1 appearance
  const sortedBettorIds = Object.entries(bettorIdsToCounts)
    .sort((a, b) => b[1] - a[1])
    .filter((bettorId) => bettorId[1] > 0)
    .map((entry) => entry[0])
    .filter((bettorId) => bettorId !== userId)

  // get the top 10 most similar bettors (excluding this user)
  const similarBettorIds = sortedBettorIds.slice(0, 10)
  return similarBettorIds
}

// Gets markets followed by similar bettors and bet on by similar bettors
const getSimilarBettorsMarkets = async (
  userId: string,
  contractsUserHasBetOn: Contract[]
) => {
  const similarBettorIds = getSimilarBettorIds(contractsUserHasBetOn, userId)
  if (similarBettorIds.length === 0) return []

  // get contracts with unique bettor ids with this user
  const contractsSimilarBettorsHaveBetOn = uniqBy(
    (
      await getValues<Contract>(
        query(
          collection(db, 'contracts'),
          where(
            'uniqueBettorIds',
            'array-contains-any',
            similarBettorIds.slice(0, 10)
          ),
          orderBy('popularityScore', 'desc'),
          limit(200)
        )
      )
    ).filter(
      (contract) =>
        !contract.uniqueBettorIds?.includes(userId) &&
        !contractsUserHasBetOn.find((c) => c.id === contract.id)
    ),
    (contract) => contract.id
  )

  // sort the contracts by how many times similar bettor ids are in their unique bettor ids array
  const sortedContractsInSimilarBettorsBets = contractsSimilarBettorsHaveBetOn
    .map((contract) => {
      const appearances = contract.uniqueBettorIds?.filter((bettorId) =>
        similarBettorIds.includes(bettorId)
      ).length
      return [contract, appearances] as [Contract, number]
    })
    .sort((a, b) => b[1] - a[1])
    .map((entry) => entry[0])

  return sortedContractsInSimilarBettorsBets
}

const useRecommendedContracts = (
  similarToContractIds: string[],
  excludeBettorId: string,
  maxCount: number,
  excludingContractIds: string[]
) => {
  const [recommendedContracts, setRecommendedContracts] = useState<
    Contract[] | undefined
  >(undefined)

  const privateUser = usePrivateUser()
  // get creators markets from the user's viewed markets
  // get markets from groups that the user has viewed
  // get markets that have similar bettors that the user has viewed
  const getRecommendedContracts = useCallback(async () => {
    const contracts = await getValues<Contract>(
      query(
        collection(db, 'contracts'),
        where('id', 'in', similarToContractIds)
      )
    )
    const creatorIds = uniq(contracts.map((contract) => contract.creatorId))
    const groupSlugs = filterDefined(
      uniq(contracts.map((contract) => contract.groupSlugs)).flat()
    )

    const creatorContractsQuery = query(
      collection(db, 'contracts'),
      where('isResolved', '==', false),
      where('creatorId', 'in', creatorIds),
      orderBy('createdTime', 'desc'),
      limit(maxCount)
    )
    const creatorContracts = await getValues<Contract>(creatorContractsQuery)
    const groupContractsQuery = query(
      collection(db, 'contracts'),
      where('groupSlugs', 'array-contains-any', sampleSize(groupSlugs, 10)),
      where('isResolved', '==', false),
      orderBy('createdTime', 'desc'),
      limit(maxCount)
    )
    const groupContracts = await getValues<Contract>(groupContractsQuery)
    const similarBettorsContracts = await getSimilarBettorsToUserMarkets(
      excludeBettorId,
      contracts
    )

    const filterContracts = (contracts: Contract[]) =>
      uniqBy(
        contracts.filter(
          (contract) =>
            !contract.uniqueBettorIds?.includes(excludeBettorId) &&
            !excludingContractIds.includes(contract.id) &&
            contract.closeTime &&
            contract.closeTime > Date.now() &&
            !contract.groupSlugs?.some((slug) =>
              HOME_BLOCKED_GROUP_SLUGS.includes(slug)
            ) &&
            !privateUser?.blockedContractIds.includes(contract.id) &&
            !privateUser?.blockedUserIds.includes(contract.creatorId) &&
            !contract.groupSlugs?.some((slug) =>
              privateUser?.blockedGroupSlugs.includes(slug)
            )
        ),
        (contract) => contract.id
      )

    const combined = uniqBy(
      [
        ...filterContracts(creatorContracts).slice(0, maxCount / 3),
        ...filterContracts(groupContracts).slice(0, maxCount / 3),
        ...filterContracts(similarBettorsContracts).slice(0, maxCount / 3),
      ],
      (c) => c.id
    )

    // sort randomly
    const chosen = shuffle(combined).slice(0, maxCount)
    const fullArray = uniqBy(
      [
        ...chosen,
        ...shuffle(
          buildArray(groupContracts, creatorContracts, similarBettorsContracts)
        ),
      ],
      (c) => c.id
    ).slice(0, maxCount)

    return fullArray
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    similarToContractIds.length,
    maxCount,
    excludeBettorId,
    excludingContractIds.length,
  ])

  useEffect(() => {
    if (similarToContractIds.length > 0) {
      getRecommendedContracts().then((recommendedContracts) =>
        setRecommendedContracts(recommendedContracts)
      )
    }
  }, [getRecommendedContracts, similarToContractIds.length])

  return recommendedContracts
}
