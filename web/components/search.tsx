'use client'
import { useEvent } from 'client-common/hooks/use-event'
import { usePersistentInMemoryState } from 'client-common/hooks/use-persistent-in-memory-state'
import { useSafeLayoutEffect } from 'client-common/hooks/use-safe-layout-effect'
import clsx from 'clsx'
import { FullMarketSearchResult } from 'common/api/market-search-types'
import { FullUser } from 'common/api/user-types'
import { APIError } from 'common/api/utils'
import { getForcedABTestVariant } from 'common/ab-test'
import { Contract } from 'common/contract'
import {
  DISCOVERY_EXPERIMENT_NAME,
  DISCOVERY_EXPERIMENT_VARIANTS,
  DISCOVERY_EXPOSURE_EVENT,
  DISCOVERY_RESULTS_EVENT,
  DISCOVERY_SEARCH_ABORT_EVENT,
  DISCOVERY_SEARCH_ERROR_EVENT,
  DISCOVERY_SEARCH_REQUEST_EVENT,
  DiscoveryExperimentAssignmentSource,
  DiscoveryExperimentSurface,
  DiscoveryExperimentVariant,
  DiscoveryResultTracking,
  getDiscoveryQueryLengthBucket,
} from 'common/discovery-experiment'
import { LiteGroup } from 'common/group'
import {
  getPostSearchThreshold,
  orderCombinedSearchResults,
} from 'common/search-result-order'
import {
  getLoadMoreRequestAction,
  getSearchRequestDebounceMs,
  shouldSendDiscoveryOptions,
  shouldRetrySearchWithoutDiscoveryOptions,
  shouldRetryStaleSearchRequest,
} from 'common/search-request-coordination'
import { CONTRACTS_PER_SEARCH_PAGE } from 'common/supabase/contracts'
import { buildArray } from 'common/util/array'
import { randomString } from 'common/util/random'
import { capitalize, groupBy, orderBy, sample, uniqBy } from 'lodash'
import Link from 'next/link'
import { ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from 'web/components/buttons/button'
import { AddContractToGroupButton } from 'web/components/topics/add-contract-to-group-modal'
import { useDebouncedEffect } from 'web/hooks/use-debounced-effect'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import { usePersistentQueriesState } from 'web/hooks/use-persistent-query-state'
import { api, searchGroups } from 'web/lib/api/api'
import { track } from 'web/lib/service/analytics'
import { searchUsers } from 'web/lib/supabase/users'
import { Col } from './layout/col'
import { Row } from './layout/row'

import { APIParams, APIResponse } from 'common/api/schema'
import { getFollowedGroupsCount } from 'common/supabase/groups'
import { BinaryDigit } from 'common/tier'
import { TopLevelPost } from 'common/top-level-post'
import { SEARCH_TOPICS_TO_SUBTOPICS } from 'common/topics'
import { removeEmojis } from 'common/util/string'
import { DAY_MS } from 'common/util/time'
import { isEqual } from 'lodash'
import { LoadMoreUntilNotVisible } from 'web/components/widgets/visibility-observer'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import {
  isABTestAssignmentCurrent,
  useABTestAssignment,
} from 'web/hooks/use-ab-test'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { useIsPageVisible } from 'web/hooks/use-page-visible'
import { useIsAuthorized, useUser } from 'web/hooks/use-user'
import { db } from 'web/lib/supabase/db'
import { CombinedResults } from './contract/combined-results'
import { LoadingContractRow } from './contract/contracts-table'
import { Spacer } from './layout/spacer'
import { ContractFilters } from './search/contract-filters'
import { SearchInput } from './search/search-input'
import { UserResults } from './search/user-results'
import { useSweepstakes } from './sweepstakes-provider'
import { BrowseTopicPills } from './topics/browse-topic-pills'
import { Carousel } from './widgets/carousel'
import { LiveRegion } from './widgets/live-region'

const USERS_PER_PAGE = 100
const TOPICS_PER_PAGE = 100
const MAX_TRACKED_DISCOVERY_ITEMS = 100

export const SORTS = [
  { label: 'Best', value: 'score' },
  { label: 'Hot', value: 'freshness-score' },
  { label: 'Liquidity', value: 'liquidity' },
  { label: 'Subsidy', value: 'subsidy' },
  { label: 'New', value: 'newest' },
  { label: 'Closing soon', value: 'close-date' },
  { label: 'Daily change', value: 'daily-score' },
  { label: '24h volume', value: '24-hour-vol' },
  { label: 'Total traders', value: 'most-popular' },
  { label: 'Last activity', value: 'last-updated' },
  { label: 'Just resolved', value: 'resolve-date' },
  { label: 'Bounty amount', value: 'bounty-amount' },
  { label: 'High %', value: 'prob-descending' },
  { label: 'Low %', value: 'prob-ascending' },
  { label: 'Mid %', value: 'prob-50' },
  { label: '🎲 Random!', value: 'random' },
] as const

export const SORTS_MIXING_POSTS_AND_MARKETS = ['score', 'newest']

export const predictionMarketSorts = new Set([
  'daily-score',
  '24-hour-vol',
  'liquidity',
  'subsidy',
  'close-date',
  'resolve-date',
  'most-popular',
  'prob-descending',
  'prob-ascending',
  'prob-50',
  'freshness-score',
])

export const bountySorts = new Set(['bounty-amount'])

const probSorts = new Set(['prob-descending', 'prob-ascending', 'prob-50'])

export const BOUNTY_MARKET_SORTS = SORTS.filter(
  (item) => !predictionMarketSorts.has(item.value)
)

export const POLL_SORTS = BOUNTY_MARKET_SORTS.filter(
  (item) => !bountySorts.has(item.value)
)

export const PREDICTION_MARKET_SORTS = SORTS.filter(
  (item) => !bountySorts.has(item.value) && !probSorts.has(item.value)
)

export const PREDICTION_MARKET_PROB_SORTS = SORTS.filter(
  (item) => !bountySorts.has(item.value)
)

export type Sort = (typeof SORTS)[number]['value']

export const FILTERS = [
  { label: 'Any status', value: 'all' },
  { label: 'Open', value: 'open' },
  { label: 'Closing in 7 days', value: 'closing-week' },
  { label: 'Closing in 30 days', value: 'closing-month' },
  { label: 'Closing in 90 days', value: 'closing-90-days' },
  { label: 'Closed', value: 'closed' },
  { label: 'Resolved', value: 'resolved' },
  { label: 'Recently changed', value: 'news' },
  { label: 'Uncertain', value: 'uncertain' },
] as const

export type Filter = (typeof FILTERS)[number]['value']

export const CONTRACT_TYPES = [
  { label: 'Any type', value: 'ALL' },
  { label: 'Yes/No', value: 'BINARY' },
  { label: 'Multiple Choice', value: 'MULTIPLE_CHOICE' },
  { label: 'Set', value: 'INDEPENDENT_MULTIPLE_CHOICE' },
  { label: 'Dependent MC', value: 'DEPENDENT_MULTIPLE_CHOICE' },
  { label: 'Numeric', value: 'PSEUDO_NUMERIC' },
  { label: 'Date', value: 'DATE' },
  { label: 'Bounty', value: 'BOUNTIED_QUESTION' },
  { label: 'Stock', value: 'STONK' },
  { label: 'Poll', value: 'POLL' },
  { label: 'Perpetual', value: 'PERP' },
  { label: 'Posts', value: 'POSTS' },
] as const

export const DEFAULT_SORT = 'score'
export const DEFAULT_SORTS = ['freshness-score', 'newest']
export const DEFAULT_BOUNTY_SORTS = ['bounty-amount']

export const DEFAULT_FILTERS = []
export const DEFAULT_FILTER = 'all'

export const DEFAULT_CONTRACT_TYPE = 'ALL'
export const DEFAULT_CONTRACT_TYPES = []

export const DEFAULT_TIER = '00000'

export type ContractTypeType = (typeof CONTRACT_TYPES)[number]['value']
type SearchType = 'Users' | 'Questions' | undefined

export type SearchParams = {
  [QUERY_KEY]: string
  [SORT_KEY]: Sort
  [FILTER_KEY]: Filter
  [CONTRACT_TYPE_KEY]: ContractTypeType
  [SEARCH_TYPE_KEY]: SearchType
  [PRIZE_MARKET_KEY]: BinaryDigit
  [FOR_YOU_KEY]: BinaryDigit
  [TOPIC_FILTER_KEY]: string
  [SWEEPIES_KEY]: '0' | '1' | '2'
  [GROUP_IDS_KEY]: string
  [LIQUIDITY_KEY]: string // empty string or stringified number
  [HAS_BETS_KEY]: '0' | '1'
}

export const QUERY_KEY = 'q'
export const SORT_KEY = 's'
export const FILTER_KEY = 'f'
export const CONTRACT_TYPE_KEY = 'ct'
export const SEARCH_TYPE_KEY = 't'
export const PRIZE_MARKET_KEY = 'p'
export const FOR_YOU_KEY = 'fy'
export const MARKET_TIER_KEY = 'mt'
export const TOPIC_FILTER_KEY = 'tf'
export const SWEEPIES_KEY = 'sw'
export const GROUP_IDS_KEY = 'gids'
export const LIQUIDITY_KEY = 'li'
export const HAS_BETS_KEY = 'hb'

export type SupabaseAdditionalFilter = {
  creatorId?: string
  excludeContractIds?: string[]
  excludeGroupSlugs?: string[]
  excludeUserIds?: string[]
}

export type SearchState = {
  contracts: FullMarketSearchResult[] | undefined
  users: FullUser[] | undefined
  topics: LiteGroup[] | undefined
  shouldLoadMore: boolean
  posts: TopLevelPost[] | undefined
  seenMarketCutoffTime: number | undefined
  discoveryVariant: DiscoveryExperimentVariant | undefined
  discoveryAssignmentSource: DiscoveryExperimentAssignmentSource | undefined
  discoveryAssignmentKey: string | undefined
  discoverySurface: DiscoveryExperimentSurface | undefined
  discoveryResultSetId: string | undefined
  discoveryLoadedPageCount: number
  discoveryCompatibilityFallback: boolean
  discoverySemanticEligible: boolean | undefined
  discoverySemanticMarketCount: number | undefined
  discoveryInitialLatencyMs: number | undefined
}

type SearchProps = {
  persistPrefix: string
  defaultSort?: Sort
  defaultFilter?: Filter
  defaultContractType?: ContractTypeType
  defaultSearchType?: SearchType
  defaultForYou?: '1' | '0'
  additionalFilter?: SupabaseAdditionalFilter
  highlightContractIds?: string[]
  onContractClick?: (contract: Contract) => void
  hideActions?: boolean
  hideSweepsToggle?: boolean
  headerClassName?: string
  isWholePage?: boolean
  // used to determine if search params should be updated in the URL
  useUrlParams?: boolean
  autoFocus?: boolean
  emptyState?: ReactNode
  hideSearch?: boolean
  hideContractFilters?: boolean
  topicSlug?: string
  contractsOnly?: boolean
  hideSearchTypes?: boolean
  hideAvatars?: boolean
  initialTopics?: LiteGroup[]
  showTopicsFilterPills?: boolean
  refreshOnVisible?: boolean
  showHotTopics?: boolean
  // Extra pills rendered as their own row below the sort/filter controls.
  extraFilterPills?: ReactNode
}

// Collect all group IDs from SEARCH_TOPICS_TO_SUBTOPICS to filter out duplicates
const getDefaultTopicGroupIds = (): Set<string> => {
  const groupIds = new Set<string>()
  Object.values(SEARCH_TOPICS_TO_SUBTOPICS).forEach((subtopics) => {
    subtopics.forEach((subtopic) => {
      subtopic.groupIds.forEach((id) => groupIds.add(id))
    })
  })
  return groupIds
}

// Collect all subtopic names (without emojis) to filter out duplicates
const getDefaultTopicNames = (): Set<string> => {
  const names = new Set<string>()
  // Add parent topic names
  Object.keys(SEARCH_TOPICS_TO_SUBTOPICS).forEach((topic) => {
    names.add(removeEmojis(topic).toLowerCase().trim())
  })
  // Add subtopic names
  Object.values(SEARCH_TOPICS_TO_SUBTOPICS).forEach((subtopics) => {
    subtopics.forEach((subtopic) => {
      names.add(removeEmojis(subtopic.name).toLowerCase().trim())
    })
  })
  return names
}

const DEFAULT_TOPIC_GROUP_IDS = getDefaultTopicGroupIds()
const DEFAULT_TOPIC_NAMES = getDefaultTopicNames()

export function Search(props: SearchProps) {
  const {
    defaultSort,
    defaultFilter,
    defaultContractType,
    defaultSearchType,
    defaultForYou,
    additionalFilter,
    onContractClick,
    hideActions,
    hideSweepsToggle,
    highlightContractIds,
    headerClassName,
    persistPrefix,
    isWholePage,
    useUrlParams,
    autoFocus,
    hideContractFilters,
    topicSlug = '',
    contractsOnly,
    hideSearch,
    hideSearchTypes,
    hideAvatars,
    showTopicsFilterPills,
    refreshOnVisible,
    showHotTopics,
    initialTopics,
    extraFilterPills,
  } = props

  // Filter hot topics to exclude duplicates of default topics and subtopics
  const hotTopics = (initialTopics ?? [])
    .filter((topic) => {
      // Filter out if the topic's ID is in any default subtopic groupIds
      if (DEFAULT_TOPIC_GROUP_IDS.has(topic.id)) return false
      // Filter out if the topic's name matches a default topic or subtopic name
      const normalizedName = removeEmojis(topic.name).toLowerCase().trim()
      if (DEFAULT_TOPIC_NAMES.has(normalizedName)) return false
      return true
    })
    .slice(0, 30)

  const isMobile = useIsMobile()
  const { prefersPlay, setPrefersPlay } = useSweepstakes()
  const user = useUser()
  const isAuthorized = useIsAuthorized()
  const forcedDiscoveryVariant = getForcedABTestVariant(
    user?.id,
    DISCOVERY_EXPERIMENT_VARIANTS
  )
  const discoveryAssignment = useABTestAssignment(
    DISCOVERY_EXPERIMENT_NAME,
    DISCOVERY_EXPERIMENT_VARIANTS,
    {
      isReady: isAuthorized !== undefined,
      userId: user?.id,
      forcedVariant: forcedDiscoveryVariant,
    }
  )
  const discoveryVariant = discoveryAssignment?.variant
  const discoveryAssignmentKey = discoveryAssignment
    ? `${discoveryAssignment.assignmentUnit}:${discoveryAssignment.assignmentId}`
    : undefined
  const discoveryAssignmentSource: DiscoveryExperimentAssignmentSource =
    forcedDiscoveryVariant ? 'forced' : user ? 'user-hash' : 'device-hash'
  const [searchParams, setSearchParams, isReady] = useSearchQueryState({
    defaultSort,
    defaultFilter,
    defaultContractType,
    defaultSearchType,
    defaultForYou,
    useUrlParams,
    persistPrefix,
    // defaultTopicFilter: topicSlug,
    defaultSweepies: hideSweepsToggle ? '2' : prefersPlay ? '0' : '1',
  })

  const query = searchParams[QUERY_KEY]
  const searchType = searchParams[SEARCH_TYPE_KEY]
  const filter = searchParams[FILTER_KEY]
  const contractType = searchParams[CONTRACT_TYPE_KEY]
  const prizeMarketState = searchParams[PRIZE_MARKET_KEY]
  const sweepiesState = searchParams[SWEEPIES_KEY]
  const groupIds = searchParams[GROUP_IDS_KEY]
  const hasBets = searchParams[HAS_BETS_KEY] === '1'
  // const actuallySearchParams = searchParams
  if (topicSlug) searchParams[TOPIC_FILTER_KEY] = topicSlug
  // if (hideSweepsToggle) actuallySearchParams[SWEEPIES_KEY] = '2'

  useEffect(() => {
    const isSweeps = sweepiesState === '1'
    if (prefersPlay !== isSweeps) return
    setSearchParams({
      [SWEEPIES_KEY]: prefersPlay ? '0' : '1',
    })
  }, [prefersPlay, sweepiesState])

  const selectedFollowed = searchParams[TOPIC_FILTER_KEY] === 'followed'
  const showSearchTypes =
    !!query && !hideSearchTypes && !contractsOnly && !selectedFollowed
  const {
    contracts,
    users,
    topics,
    loading,
    shouldLoadMore,
    loadMoreContracts,
    refreshContracts,
    posts,
    discoveryTracking,
  } = useSearchResults({
    persistPrefix,
    searchParams: searchParams,
    includeUsersAndTopics: showSearchTypes,
    isReady: isReady && discoveryVariant !== undefined,
    discoveryVariant,
    discoveryAssignmentSource,
    discoveryAssignmentKey,
    additionalFilter,
  })
  const visible = useIsPageVisible()
  useTrackDiscoveryExposure({
    contracts,
    posts,
    searchParams,
    tracking: discoveryTracking,
    visible,
  })
  useEffect(() => {
    if (visible && refreshOnVisible) {
      refreshContracts()
    }
  }, [visible, refreshOnVisible])

  const showTopics = topics && topics.length > 0 && query && query.length > 0
  const showUsers = users && users.length > 0 && query && query.length > 0
  const searchInputId = `${persistPrefix}-search-input`
  const searchResultsId = `${persistPrefix}-search-results`
  const searchInstructionsId = `${persistPrefix}-search-instructions`
  const totalResults =
    (contracts?.length ?? 0) + (topics?.length ?? 0) + (users?.length ?? 0)
  const searchAnnouncement =
    query.length === 0
      ? ''
      : loading
      ? `Searching for ${query}`
      : `${totalResults} results for ${query}`

  const onChange = (changes: Partial<SearchParams>) => {
    const updatedParams = { ...changes }

    setSearchParams(updatedParams)
    if (isWholePage) window.scrollTo(0, 0)
  }

  const setQuery = (query: string) => onChange({ [QUERY_KEY]: query })

  const answersWithChanges = contracts?.flatMap((c) =>
    c.mechanism === 'cpmm-multi-1'
      ? orderBy(
          c.answers.filter((a) => Math.abs(a.probChanges.day) > 0.02),
          (a) => Math.abs(a.probChanges.day),
          'desc'
        ).slice(0, 2)
      : []
  )

  const answersMatchingQuery = contracts?.flatMap((c) =>
    c.mechanism === 'cpmm-multi-1'
      ? c.answers
          .filter((a) => a.text.toLowerCase().includes(query.toLowerCase()))
          .slice(0, 2)
      : []
  )
  const answersByContractId =
    answersWithChanges && filter === 'news'
      ? groupBy(answersWithChanges, 'contractId')
      : query !== ''
      ? groupBy(answersMatchingQuery, 'contractId')
      : undefined
  const emptyContractsState =
    props.emptyState ??
    (filter !== 'all' ||
    contractType !== 'ALL' ||
    prizeMarketState === '1' ||
    sweepiesState === '1' ? (
      <Col className="mt-2 items-center gap-3">
        <span className="text-ink-700 text-center">
          No {prefersPlay ? 'questions' : 'sweeps questions'} found under this
          filter.
        </span>
        <Col className="gap-2">
          {!prefersPlay && (
            <Button onClick={() => setPrefersPlay(true)} color="purple">
              See mana markets
            </Button>
          )}

          <Button
            onClick={() =>
              onChange({
                [FILTER_KEY]: 'all',
                [CONTRACT_TYPE_KEY]: 'ALL',
                [TOPIC_FILTER_KEY]: '',
                p: '0',
              })
            }
            color="gray-outline"
          >
            Clear filter
          </Button>
        </Col>
      </Col>
    ) : query ? (
      <NoResults />
    ) : (
      <Col className="text-ink-700 mx-2 my-6 text-center">
        No questions yet.
        {topicSlug && (
          <Row className={'mt-2 w-full items-center justify-center'}>
            <AddContractToGroupButton groupSlug={topicSlug} />
          </Row>
        )}
      </Col>
    ))
  const ALL_PARENT_TOPICS = Object.keys(SEARCH_TOPICS_TO_SUBTOPICS)

  const selectedTopic = groupIds
    ? ALL_PARENT_TOPICS.find((topic) =>
        SEARCH_TOPICS_TO_SUBTOPICS[topic].some((subtopic) =>
          groupIds.split(',').some((id) => subtopic.groupIds.includes(id))
        )
      )
    : undefined
  const selectedSubTopic = selectedTopic
    ? SEARCH_TOPICS_TO_SUBTOPICS[selectedTopic].find(
        (subtopic) => groupIds === subtopic.groupIds.join(',')
      )
    : undefined
  const selectedAll =
    !selectedTopic && !selectedFollowed && !searchParams[TOPIC_FILTER_KEY]
  const {
    data: followedGroupsData,
    loading: isLoadingFollowedGroups,
    refresh: refreshFollowedGroups,
  } = useAPIGetter(
    'search-my-groups',
    {
      limit: 150,
      type: 'lite',
      term: query,
    },
    undefined,
    undefined,
    !!user && selectedFollowed
  )
  const [followedCount, setFollowedCount] = useState<number>(0)
  // Refresh the followed count when the page is visible
  useEffect(() => {
    if (visible && selectedFollowed && user?.id) {
      getFollowedGroupsCount(db, user?.id).then((count) => {
        setFollowedCount(count)
      })
    }
  }, [visible, selectedFollowed, user?.id])

  // Refresh groups that they're following if the followed count changes
  useEffect(() => {
    if (visible && selectedFollowed) {
      refreshFollowedGroups()
      refreshContracts()
    }
  }, [followedCount])

  const usersFollowedGroups = followedGroupsData?.lite
  const followedGroupsCount = followedGroupsData?.lite?.length ?? 0
  const shouldLoadTrendingTopics =
    !!user &&
    (user.createdTime > Date.now() - DAY_MS ||
      (followedGroupsCount < 5 && !!followedGroupsData))
  const shouldShowTrendingTopics = selectedFollowed && shouldLoadTrendingTopics
  const shouldShowALotOfTrendingTopics =
    shouldShowTrendingTopics && contracts?.length === 0

  const { data: trendingTopicsData, loading: isLoadingTrendingTopics } =
    useAPIGetter(
      'search-groups',
      {
        limit: 100,
        type: 'lite',
        term: query,
      },
      undefined,
      undefined,
      shouldLoadTrendingTopics
    )
  const trendingTopics = trendingTopicsData?.lite.filter(
    (topic) => !(usersFollowedGroups ?? []).some((t) => t.id === topic.id)
  )

  return (
    <Col className="w-full">
      <Col className={clsx('bg-canvas-0 sticky top-0 z-20', headerClassName)}>
        <Col className="mb-2">
          {showTopicsFilterPills && (
            <Row className="border-ink-100 dark:border-ink-200 items-baseline gap-4 border-b pb-2">
              <button
                className={clsx(
                  'shrink-0 font-medium',
                  selectedAll ? 'text-primary-600' : 'text-ink-500'
                )}
                onClick={() => {
                  if (!selectedAll) {
                    track('select search topic', { topic: 'all' })
                    const changes: Partial<SearchParams> = {
                      [GROUP_IDS_KEY]: '',
                      [TOPIC_FILTER_KEY]: '',
                    }
                    onChange(changes)
                  }
                }}
              >
                All
              </button>
              <Carousel
                fadeEdges
                showArrowsOnHover
                labelsParentClassName="gap-4 items-baseline"
                className="min-w-0 flex-1"
              >
                {!!user?.id && (
                  <button
                    className={clsx(
                      'font-medium',
                      selectedFollowed ? 'text-primary-600' : 'text-ink-500'
                    )}
                    onClick={() => {
                      if (!selectedFollowed) {
                        track('select search topic', { topic: 'followed' })
                        const changes: Partial<SearchParams> = {
                          [TOPIC_FILTER_KEY]: 'followed',
                          [GROUP_IDS_KEY]: '',
                        }
                        onChange(changes)
                      }
                    }}
                  >
                    Followed
                  </button>
                )}
                <Link
                  href="/election"
                  onClick={() =>
                    track('select search topic', { topic: 'midterms-2026' })
                  }
                  className={clsx(
                    'shrink-0 self-center whitespace-nowrap rounded-full px-2.5 py-0.5 font-medium',
                    'bg-gradient-to-r from-blue-100 to-rose-100 dark:from-blue-900/50 dark:to-rose-900/50',
                    'text-ink-700 ring-ink-200 ring-1',
                    'transition-all hover:brightness-105'
                  )}
                >
                  2026 Midterms
                </Link>
                <Link
                  href="/perps"
                  onClick={() =>
                    track('select search topic', { topic: 'perps' })
                  }
                  className={clsx(
                    'shrink-0 self-center whitespace-nowrap rounded-full px-2.5 py-0.5 font-medium',
                    'bg-gradient-to-r from-teal-100 to-indigo-100 dark:from-teal-900/50 dark:to-indigo-900/50',
                    'text-ink-700 ring-ink-200 ring-1',
                    'transition-all hover:brightness-105'
                  )}
                >
                  Perps
                </Link>
                {ALL_PARENT_TOPICS.map((topic) => (
                  <button
                    key={topic}
                    className={clsx(
                      'whitespace-nowrap font-medium',
                      selectedTopic === topic
                        ? 'text-primary-600'
                        : 'text-ink-500'
                    )}
                    onClick={() => {
                      if (selectedTopic != topic) {
                        track('select search topic', { topic })
                        // Join all group IDs for this topic's subtopics
                        const allGroupIds = SEARCH_TOPICS_TO_SUBTOPICS[topic]
                          .map((subtopic) => subtopic.groupIds)
                          .flat()
                        const changes: Partial<SearchParams> = {
                          [GROUP_IDS_KEY]: allGroupIds.join(','),
                          [TOPIC_FILTER_KEY]: '', // Clear direct topicSlug when a parent topic is selected
                        }
                        onChange(changes)
                      }
                    }}
                  >
                    {removeEmojis(topic)}
                  </button>
                ))}
                {showHotTopics &&
                  hotTopics.map((topic) => {
                    const isSelected =
                      searchParams[TOPIC_FILTER_KEY] === topic.slug
                    return (
                      <button
                        key={topic.id}
                        className={clsx(
                          'whitespace-nowrap font-medium',
                          isSelected ? 'text-primary-600' : 'text-ink-500'
                        )}
                        onClick={() => {
                          if (!isSelected) {
                            track('select search topic', { topic: topic.slug })
                            const changes: Partial<SearchParams> = {
                              [TOPIC_FILTER_KEY]: topic.slug,
                              [GROUP_IDS_KEY]: '',
                            }
                            onChange(changes)
                          }
                        }}
                      >
                        {removeEmojis(topic.name)}
                      </button>
                    )
                  })}
              </Carousel>
            </Row>
          )}
        </Col>
        {!hideSearch && (
          <>
            <div id={searchInstructionsId} className="sr-only">
              Search for markets, users, topics, and posts. Results update below
              as you type.
            </div>
            <SearchInput
              value={query}
              setValue={setQuery}
              placeholder={
                searchType === 'Users'
                  ? 'Search users'
                  : searchType === 'Questions' || contractsOnly
                  ? 'Search questions'
                  : isMobile
                  ? 'Search'
                  : 'Search questions, users, topics, and posts'
              }
              // eslint-disable-next-line jsx-a11y/no-autofocus -- intentional: only true when opening the search popover, where focusing the input is expected
              autoFocus={autoFocus}
              loading={loading}
              inputId={searchInputId}
              listboxId={searchResultsId}
              instructionsId={searchInstructionsId}
              expanded={query.length > 0 && totalResults > 0}
            />
            <LiveRegion message={searchAnnouncement} />
          </>
        )}

        {/* Subtopics row */}
        {selectedTopic &&
          Object.keys(SEARCH_TOPICS_TO_SUBTOPICS).some(
            (topic) => topic === selectedTopic
          ) && (
            <Carousel fadeEdges labelsParentClassName="gap-1 mt-3 mb-1.5 ">
              <button
                onClick={() => {
                  onChange({
                    [GROUP_IDS_KEY]: SEARCH_TOPICS_TO_SUBTOPICS[selectedTopic]
                      .map((subtopic) => subtopic.groupIds)
                      .flat()
                      .join(','),
                  })
                }}
                className={clsx(
                  'text-ink-500 whitespace-nowrap px-3 py-0.5 text-sm',
                  !selectedSubTopic &&
                    'text-primary-700 bg-primary-50 dark:bg-primary-100 rounded-full font-medium'
                )}
              >
                All
              </button>
              {SEARCH_TOPICS_TO_SUBTOPICS[selectedTopic]
                .filter(({ hideFromSearch }) => !hideFromSearch)
                .map(({ name, groupIds }) => (
                  <button
                    key={name}
                    className={clsx(
                      'text-ink-500 whitespace-nowrap px-3 py-0.5 text-sm',
                      searchParams[GROUP_IDS_KEY] === groupIds.join(',') &&
                        'text-primary-700 bg-primary-50 dark:bg-primary-100 rounded-full font-medium '
                    )}
                    onClick={() => {
                      if (searchParams[GROUP_IDS_KEY] === groupIds.join(',')) {
                        onChange({
                          [GROUP_IDS_KEY]: SEARCH_TOPICS_TO_SUBTOPICS[
                            selectedTopic
                          ]
                            .map((subtopic) => subtopic.groupIds)
                            .flat()
                            .join(','),
                        })
                      } else {
                        track('select search subtopic', { subtopic: name })
                        onChange({ [GROUP_IDS_KEY]: groupIds.join(',') })
                      }
                    }}
                  >
                    {removeEmojis(name)}
                  </button>
                ))}
            </Carousel>
          )}

        {!hideContractFilters && (
          <ContractFilters
            params={searchParams}
            updateParams={onChange}
            topicSlug={topicSlug}
            className={
              searchType && searchType !== 'Questions' ? 'invisible' : ''
            }
            hideSweepsToggle={hideSweepsToggle}
            extraFilterPills={extraFilterPills}
          />
        )}
        {isWholePage && forcedDiscoveryVariant && discoveryVariant && (
          <div
            className="text-ink-400 px-2 text-right text-xs"
            title="This QA account has a fixed discovery experiment assignment."
          >
            Discovery v1 · {capitalize(discoveryVariant)}
          </div>
        )}
      </Col>
      <Spacer h={1} />
      <div id={searchResultsId} role="listbox" aria-labelledby={searchInputId}>
        {selectedFollowed && (
          <Col className="mb-2">
            <>
              <Row className="text-ink-500 items-center gap-1 text-sm">
                <hr className="border-ink-300 ml-2 grow sm:ml-0" />
                <span>Your Followed Topics</span>
                <hr className="border-ink-300 mr-2 grow sm:mr-0" />
              </Row>
              {usersFollowedGroups ? (
                <BrowseTopicPills
                  className={'relative w-full px-2 py-1'}
                  topics={usersFollowedGroups}
                  clipOnMobile={true}
                />
              ) : isLoadingFollowedGroups ? (
                <div className="text-ink-500 px-2 py-3 text-sm">
                  Loading your followed topics...
                </div>
              ) : null}
            </>

            {shouldShowTrendingTopics && (
              <>
                <Row className="text-ink-500 items-center gap-1 text-sm">
                  <hr className="border-ink-300 ml-2 grow sm:ml-0" />
                  <span>Explore Topics To Follow</span>
                  <hr className="border-ink-300 mr-2 grow sm:mr-0" />
                </Row>
                {trendingTopics ? (
                  <BrowseTopicPills
                    className={'relative w-full px-2 py-1'}
                    topics={trendingTopics}
                    clipOnMobile={!shouldShowALotOfTrendingTopics}
                    initialShown={
                      shouldShowALotOfTrendingTopics ? 20 : undefined
                    }
                  />
                ) : isLoadingTrendingTopics ? (
                  <div className="text-ink-500 px-2 py-3 text-sm">
                    Loading trending topics...
                  </div>
                ) : null}
              </>
            )}
          </Col>
        )}
        {showSearchTypes && (
          <Col>
            {showTopics && (
              <>
                <Row className="text-ink-500 items-center gap-1 text-sm">
                  <hr className="border-ink-300 ml-2 grow sm:ml-0" />
                  <span>
                    {!query || !topics?.length
                      ? ''
                      : topics.length >= 100
                      ? '100+'
                      : `${topics.length}`}{' '}
                    {!query || !topics?.length ? 'Topics' : 'topics'}
                  </span>
                  <hr className="border-ink-300 mr-2 grow sm:mr-0" />
                </Row>
                <BrowseTopicPills
                  className={'relative w-full px-2 pb-4'}
                  topics={topics}
                />
              </>
            )}
            {showUsers && <UserResults userResults={users} />}
            {(showTopics || showUsers) && (
              <Row className="text-ink-500 items-center gap-1 text-sm">
                <hr className="border-ink-300 ml-2 grow sm:ml-0" />
                <span>
                  {!query || !contracts?.length
                    ? ''
                    : contracts.length >= 100
                    ? '100+'
                    : shouldLoadMore && !loading
                    ? `${contracts.length}+`
                    : `${contracts.length}`}{' '}
                  {!query || !contracts?.length ? 'Questions' : 'questions'}
                </span>
                <hr className="border-ink-300 mr-2 grow sm:mr-0" />
              </Row>
            )}
          </Col>
        )}

        {!contracts && !posts ? (
          <LoadingContractResults />
        ) : contracts?.length === 0 && posts?.length === 0 ? (
          emptyContractsState
        ) : (
          <>
            {contracts || posts ? (
              <CombinedResults
                contracts={contracts ?? []}
                posts={posts ?? []}
                searchParams={searchParams}
                onContractClick={onContractClick}
                highlightContractIds={highlightContractIds}
                answersByContractId={answersByContractId}
                hideAvatars={hideAvatars}
                hideActions={hideActions}
                hasBets={hasBets}
                discoveryTracking={discoveryTracking}
              />
            ) : null}
            <LoadMoreUntilNotVisible loadMore={loadMoreContracts} />
            {shouldLoadMore && <LoadingContractResults />}
            {!shouldLoadMore && (
              <NoMoreResults params={searchParams} onChange={onChange} />
            )}
          </>
        )}
      </div>
    </Col>
  )
}

const NoResults = () => {
  const [message] = useState(
    sample([
      'no questions found x.x',
      'no questions found u_u',
      'no questions found T_T',
      'no questions found :c',
      'no questions found :(',
      'no questions found :(',
      'no questions found :(',
      'that search is too bananas for me 🍌',
      'only nothingness',
    ])
  )

  return (
    <span className="text-ink-700 mx-2 my-6 text-center">
      {capitalize(message)}
    </span>
  )
}

export const LoadingContractResults = () => {
  return (
    <Col className="w-full">
      <LoadingContractRow />
      <LoadingContractRow />
      <LoadingContractRow />
    </Col>
  )
}

export const NoMoreResults = (props: {
  params: SearchParams
  onChange: (changes: Partial<SearchParams>) => void
}) => {
  const { params, onChange } = props
  const showReset =
    params[FILTER_KEY] !== 'all' ||
    params[CONTRACT_TYPE_KEY] !== 'ALL' ||
    params[PRIZE_MARKET_KEY] === '1'
  // params[SWEEPIES_KEY] === '1' //TODO

  return (
    <div className="text-ink-500 mx-2 my-8 text-center">
      {showReset ? 'No more results under this filter. ' : 'No more results. '}
      {showReset && (
        <button
          className="text-primary-500 hover:underline focus:underline"
          onClick={() => {
            onChange({
              [FILTER_KEY]: 'all',
              [CONTRACT_TYPE_KEY]: 'ALL',
              [PRIZE_MARKET_KEY]: '0',
              // [SWEEPIES_KEY]: '0',
            })
          }}
        >
          Clear filter
        </button>
      )}
    </div>
  )
}

const FRESH_SEARCH_CHANGED_STATE: SearchState = {
  contracts: undefined,
  users: undefined,
  topics: undefined,
  shouldLoadMore: true,
  posts: undefined,
  seenMarketCutoffTime: undefined,
  discoveryVariant: undefined,
  discoveryAssignmentSource: undefined,
  discoveryAssignmentKey: undefined,
  discoverySurface: undefined,
  discoveryResultSetId: undefined,
  discoveryLoadedPageCount: 0,
  discoveryCompatibilityFallback: false,
  discoverySemanticEligible: undefined,
  discoverySemanticMarketCount: undefined,
  discoveryInitialLatencyMs: undefined,
}

export const useSearchResults = (props: {
  persistPrefix: string
  searchParams: SearchParams
  includeUsersAndTopics: boolean
  isReady: boolean
  discoveryVariant?: DiscoveryExperimentVariant
  discoveryAssignmentSource?: DiscoveryExperimentAssignmentSource
  discoveryAssignmentKey?: string
  additionalFilter?: SupabaseAdditionalFilter
}) => {
  const {
    persistPrefix,
    searchParams,
    isReady,
    discoveryVariant,
    discoveryAssignmentSource,
    discoveryAssignmentKey,
    additionalFilter,
  } = props
  // The treatment still applies to every Search instance, but the primary
  // experiment scorecard is Browse-only. Avoid multiplying user_events write
  // volume for embedded/topic search instances that the analysis excludes.
  const trackDiscoveryExperiment = persistPrefix === 'search'

  const [state, setState] = usePersistentInMemoryState<SearchState>(
    FRESH_SEARCH_CHANGED_STATE,
    `${persistPrefix}-supabase-contract-search`
  )
  const [loading, setLoading] = useState(false)
  const [lastSearchParams, setLastSearchParams] =
    usePersistentInMemoryState<SearchParams | null>(
      null,
      `${persistPrefix}-last-search-params`
    )

  const requestId = useRef(0)
  const paramsGeneration = useRef(0)
  const failedParamsGeneration = useRef<number>()
  const freshRequestAbortController = useRef<AbortController>()
  const initialQuery = useRef<string>()
  const completedInThisMount = useRef(false)

  useEffect(
    () => () => {
      freshRequestAbortController.current?.abort()
    },
    []
  )

  // Helper function to check if search parameters have meaningfully changed
  const searchParamsChanged = (
    current: SearchParams,
    previous: SearchParams | null
  ): boolean => {
    if (!previous) return true

    return (Object.keys(current) as (keyof SearchParams)[]).some(
      (key) => current[key] !== previous[key]
    )
  }

  const requestParamsChanged = () =>
    searchParamsChanged(searchParams, lastSearchParams) ||
    state.discoveryAssignmentKey !== discoveryAssignmentKey ||
    state.discoveryVariant !== discoveryVariant

  const querySearchResults = useEvent(
    async (freshQuery?: boolean, contractsOnly?: boolean) => {
      if (!isReady || !isABTestAssignmentCurrent(discoveryAssignmentKey)) {
        return true
      }
      // A visibility callback can be queued while the user changes filters.
      // Wait for the fresh page instead of paging new params from the old
      // offset. If that fresh request fails, stop the observer's timer loop.
      if (!freshQuery) {
        const action = getLoadMoreRequestAction(
          freshRequestAbortController.current !== undefined,
          requestParamsChanged(),
          failedParamsGeneration.current,
          paramsGeneration.current
        )
        if (action !== 'load') return action === 'wait'
      }
      const {
        q: query,
        s: sort,
        f: filter,
        ct: contractType,
        p: isPrizeMarketString,
        fy: forYou,
        tf: topicSlug,
        sw: sweepState,
        gids,
        li: liquidity,
        hb: hasBets,
      } = searchParams
      const usesForYouRoute =
        forYou === '1' &&
        query.length === 0 &&
        filter !== 'news' &&
        topicSlug.length === 0 &&
        gids.length === 0 &&
        (sort === 'score' || sort === 'freshness-score') &&
        (sweepState === '0' || sweepState === '2')
      const discoverySurface: DiscoveryExperimentSurface = query.trim()
        ? 'text-search'
        : usesForYouRoute
        ? 'for-you'
        : 'browse'

      const shouldSearchPostsWithContracts =
        SORTS_MIXING_POSTS_AND_MARKETS.includes(sort) &&
        (!contractsOnly || !!state.posts?.length) &&
        !topicSlug &&
        forYou === '0' &&
        isPrizeMarketString === '0' &&
        !liquidity &&
        hasBets === '0' &&
        (contractType === 'ALL' || contractType === 'POSTS') &&
        (filter === 'all' || filter === 'open') &&
        !gids.length &&
        // There aren't that many posts, so we don't need to wait up for them
        (state.posts?.length ?? 0) < 20

      const includeUsersAndTopics =
        !contractsOnly && props.includeUsersAndTopics

      if (freshQuery || state.shouldLoadMore) {
        const discoveryResultSetId = freshQuery
          ? randomString(16)
          : state.discoveryResultSetId ?? randomString(16)
        const discoveryPage = freshQuery
          ? 0
          : state.discoveryLoadedPageCount ?? 0
        const requestStartedAt = Date.now()
        let discoveryRequestAttemptId: string | undefined
        let usedCompatibilityFallback = freshQuery
          ? false
          : state.discoveryCompatibilityFallback ?? false
        const sendDiscoveryOptions = shouldSendDiscoveryOptions(
          !!freshQuery,
          usedCompatibilityFallback
        )
        // A no-op load-more must not cancel an active fresh search. Only
        // replace the controller after we know this invocation will request.
        if (freshQuery) freshRequestAbortController.current?.abort()
        const abortController = new AbortController()
        if (freshQuery) {
          freshRequestAbortController.current = abortController
          failedParamsGeneration.current = undefined
        }
        let seenMarketCutoffTime =
          discoveryVariant === 'treatment'
            ? freshQuery
              ? Date.now()
              : state.seenMarketCutoffTime
            : undefined
        const requestParamsGeneration = paramsGeneration.current
        const id = ++requestId.current
        const shouldRetryAfterStaleResult = () =>
          shouldRetryStaleSearchRequest(
            !!freshQuery,
            requestParamsGeneration,
            paramsGeneration.current
          )
        const finishFreshRequest = () => {
          if (
            freshQuery &&
            freshRequestAbortController.current === abortController
          ) {
            freshRequestAbortController.current = undefined
          }
        }
        let timeoutId: NodeJS.Timeout | undefined
        if (freshQuery) {
          timeoutId = setTimeout(() => {
            if (id === requestId.current) {
              setLoading(true)
            }
          }, 500)
        }
        const postApiParams: APIParams<'get-posts'> = {
          sortBy: sort === 'score' ? 'importance_score' : 'created_time',
          term: query,
          limit: sort === 'score' ? 1 : 3,
          userId: additionalFilter?.creatorId,
          offset: freshQuery ? 0 : state.posts?.length ?? 0,
        }
        try {
          if (contractType === 'POSTS') {
            const posts = await api('get-posts', postApiParams, {
              signal: abortController.signal,
            })
            if (
              id !== requestId.current ||
              !isABTestAssignmentCurrent(discoveryAssignmentKey)
            ) {
              finishFreshRequest()
              return shouldRetryAfterStaleResult()
            }
            const shouldLoadMore = posts.length === postApiParams.limit
            setState({
              contracts: [],
              users: undefined,
              topics: undefined,
              posts: uniqBy(buildArray(state.posts, posts), 'id'),
              shouldLoadMore,
              seenMarketCutoffTime,
              discoveryVariant,
              discoveryAssignmentSource,
              discoveryAssignmentKey,
              discoverySurface,
              discoveryResultSetId: undefined,
              discoveryLoadedPageCount: 0,
              discoveryCompatibilityFallback: false,
              discoverySemanticEligible: undefined,
              discoverySemanticMarketCount: undefined,
              discoveryInitialLatencyMs: undefined,
            })

            // Store the search params that were used for this query
            if (freshQuery) {
              setLastSearchParams(searchParams)
              completedInThisMount.current = true
            }

            clearTimeout(timeoutId)
            finishFreshRequest()
            setLoading(false)
            return shouldLoadMore
          }
          const endpoint =
            topicSlug === 'recent' ? 'recent-markets' : 'search-markets-full'
          if (
            trackDiscoveryExperiment &&
            isABTestAssignmentCurrent(discoveryAssignmentKey) &&
            discoveryVariant &&
            discoveryAssignmentSource
          ) {
            discoveryRequestAttemptId = randomString(16)
            void track(DISCOVERY_SEARCH_REQUEST_EVENT, {
              schemaVersion: 1,
              requestAttemptId: discoveryRequestAttemptId,
              resultSetId: discoveryResultSetId,
              variant: discoveryVariant,
              assignmentSource: discoveryAssignmentSource,
              sourceComponent: persistPrefix,
              surface: discoverySurface,
              page: discoveryPage,
              isFresh: !!freshQuery,
            })
          }
          const marketApiParams: APIParams<'search-markets-full'> = {
            term: query,
            filter,
            sort,
            contractType,
            ...(() => {
              const useCursor =
                !freshQuery && sort === 'newest' && !!state.contracts?.length
              return useCursor
                ? {
                    offset: 0,
                    beforeTime:
                      state.contracts![state.contracts!.length - 1]
                        ?.createdTime,
                  }
                : {
                    offset: freshQuery ? 0 : state.contracts?.length ?? 0,
                  }
            })(),
            limit: CONTRACTS_PER_SEARCH_PAGE,
            topicSlug: topicSlug !== '' ? topicSlug : undefined,
            creatorId: additionalFilter?.creatorId,
            isPrizeMarket: isPrizeMarketString,
            forYou,
            token:
              sweepState === '2' ? 'ALL' : sweepState === '1' ? 'CASH' : 'MANA',
            gids,
            liquidity: liquidity === '' ? undefined : parseInt(liquidity),
            hasBets,
            discoveryVariant: sendDiscoveryOptions
              ? discoveryVariant
              : undefined,
            enableSemanticSearch:
              sendDiscoveryOptions &&
              discoveryVariant === 'treatment' &&
              endpoint === 'search-markets-full' &&
              query.trim().length > 0
                ? true
                : undefined,
            seenMarketCutoffTime:
              sendDiscoveryOptions &&
              discoveryVariant === 'treatment' &&
              usesForYouRoute
                ? seenMarketCutoffTime
                : undefined,
          }
          const getMarkets = async () => {
            try {
              return await api(endpoint, marketApiParams, {
                signal: abortController.signal,
              })
            } catch (error) {
              if (
                !shouldRetrySearchWithoutDiscoveryOptions(
                  !!freshQuery,
                  marketApiParams.seenMarketCutoffTime,
                  marketApiParams.enableSemanticSearch,
                  marketApiParams.discoveryVariant,
                  error instanceof APIError ? error.code : undefined,
                  usesForYouRoute
                )
              ) {
                throw error
              }

              // A new API rejects a badly skewed page-one anchor; an old
              // strict worker rejects the new fields. Retrying without the
              // semantic opt-in is safe on any page because its fallback only
              // runs on page one. Anchor removal is guarded to page one above.
              if (freshQuery) seenMarketCutoffTime = undefined
              usedCompatibilityFallback = true
              const contracts = await api(
                endpoint,
                {
                  ...marketApiParams,
                  seenMarketCutoffTime: freshQuery
                    ? undefined
                    : marketApiParams.seenMarketCutoffTime,
                  enableSemanticSearch: undefined,
                  discoveryVariant: undefined,
                },
                { signal: abortController.signal }
              )
              // Semantic fallback never runs after page one, so any unmarked
              // rows from an old worker are known to be lexical there. Keep a
              // fresh unmarked response conservative: an intermediate worker
              // may have returned an unmarked semantic tail.
              return freshQuery
                ? contracts
                : contracts.map((contract) =>
                    'searchMatchType' in contract
                      ? contract
                      : { ...contract, searchMatchType: 'lexical' as const }
                  )
            }
          }
          const searchPromises: Promise<
            | APIResponse<'recent-markets'>
            | APIResponse<'search-markets-full'>
            | APIResponse<'get-posts'>
            | APIResponse<'search-users'>
            | APIResponse<'search-groups'>
          >[] = [getMarkets()]

          if (includeUsersAndTopics) {
            searchPromises.push(
              searchUsers(query, USERS_PER_PAGE),
              searchGroups({
                term: query,
                limit: TOPICS_PER_PAGE,
                type: 'lite',
              })
            )
          }
          if (shouldSearchPostsWithContracts) {
            searchPromises.push(
              api('get-posts', postApiParams, {
                signal: abortController.signal,
              })
            )
          }

          const results = await Promise.all(searchPromises)

          if (
            id === requestId.current &&
            isABTestAssignmentCurrent(discoveryAssignmentKey)
          ) {
            const newContracts = results[0] as FullMarketSearchResult[]
            let postResultIndex = 1
            const newUsers = includeUsersAndTopics
              ? (results[postResultIndex++] as FullUser[])
              : undefined
            const newTopics = includeUsersAndTopics
              ? (results[postResultIndex++] as APIResponse<'search-groups'>)
              : undefined

            const newPostsResults =
              shouldSearchPostsWithContracts &&
              results.length >= postResultIndex
                ? (results[postResultIndex] as TopLevelPost[])
                : undefined

            const freshContracts = freshQuery
              ? newContracts
              : buildArray(state.contracts, newContracts)

            // This is necessary bc the posts are in a different table than the contracts.
            // TODO: this is bad and will leave posts out of the search results randomly.
            // We should fix this by joining the posts table to the contracts table or something.
            const contractsBeforeNewPosts =
              !freshQuery && state.contracts?.length
                ? state.contracts
                : freshContracts
            const postFilteringThreshold = getPostSearchThreshold(
              contractsBeforeNewPosts,
              sort === 'score' ? 'score' : 'newest'
            )
            const freshPosts =
              freshQuery || !state.posts
                ? newPostsResults
                : uniqBy(
                    buildArray(
                      state.posts,
                      newPostsResults?.filter((p) =>
                        postFilteringThreshold === undefined
                          ? true
                          : sort === 'score'
                          ? p.importanceScore <= postFilteringThreshold
                          : p.createdTime <= postFilteringThreshold
                      )
                    ),
                    'id'
                  )

            // Semantic rows only pad page one, so they never imply a page two.
            const shouldLoadMore =
              newContracts.filter((c) => c.searchMatchType !== 'semantic')
                .length === CONTRACTS_PER_SEARCH_PAGE

            const lexicalMarketCount = newContracts.filter(
              (contract) => contract.searchMatchType !== 'semantic'
            ).length
            const semanticMarketCount = newContracts.length - lexicalMarketCount
            const requestLatencyMs = Date.now() - requestStartedAt
            // Match the API's pre-embedding cleanup so the low-hit segment is
            // classified identically in both experiment arms.
            const normalizedQuery = query
              .replace(/['"]/g, '')
              .trim()
              .replace(/\s+/g, ' ')
            const lowerQuery = normalizedQuery.toLowerCase()
            const semanticEligible =
              !!freshQuery &&
              endpoint === 'search-markets-full' &&
              sort !== 'newest' &&
              !lowerQuery.startsWith('https://') &&
              !lowerQuery.startsWith('http://') &&
              normalizedQuery.length >= 3 &&
              normalizedQuery.length <= 200 &&
              lexicalMarketCount < Math.min(CONTRACTS_PER_SEARCH_PAGE, 5)
            const resultSetSemanticEligible = freshQuery
              ? semanticEligible
              : state.discoverySemanticEligible ?? false
            const resultSetSemanticMarketCount = freshQuery
              ? semanticMarketCount
              : state.discoverySemanticMarketCount ?? 0
            const resultSetInitialLatencyMs = freshQuery
              ? requestLatencyMs
              : state.discoveryInitialLatencyMs ?? requestLatencyMs

            setState({
              contracts: freshContracts,
              users: includeUsersAndTopics ? newUsers : state.users,
              topics: includeUsersAndTopics ? newTopics?.lite : state.topics,
              posts: freshPosts,
              shouldLoadMore,
              seenMarketCutoffTime,
              discoveryVariant,
              discoveryAssignmentSource,
              discoveryAssignmentKey,
              discoverySurface,
              discoveryResultSetId,
              discoveryLoadedPageCount: discoveryPage + 1,
              discoveryCompatibilityFallback: usedCompatibilityFallback,
              discoverySemanticEligible: resultSetSemanticEligible,
              discoverySemanticMarketCount: resultSetSemanticMarketCount,
              discoveryInitialLatencyMs: resultSetInitialLatencyMs,
            })

            if (
              trackDiscoveryExperiment &&
              isABTestAssignmentCurrent(discoveryAssignmentKey) &&
              discoveryVariant &&
              discoveryAssignmentSource
            ) {
              void track(DISCOVERY_RESULTS_EVENT, {
                schemaVersion: 1,
                requestAttemptId: discoveryRequestAttemptId,
                resultSetId: discoveryResultSetId,
                variant: discoveryVariant,
                assignmentSource: discoveryAssignmentSource,
                sourceComponent: persistPrefix,
                surface: discoverySurface,
                page: discoveryPage,
                isFresh: !!freshQuery,
                resultCount: freshContracts.length + (freshPosts?.length ?? 0),
                pageResultCount:
                  newContracts.length + (newPostsResults?.length ?? 0),
                lexicalMarketCount,
                semanticMarketCount,
                semanticEligible,
                postCount: freshPosts?.length ?? 0,
                queryLengthBucket: getDiscoveryQueryLengthBucket(query),
                sort,
                filter,
                compatibilityFallback: usedCompatibilityFallback,
                latencyMs: requestLatencyMs,
                // Store page deltas so telemetry stays linear as people load
                // more. The exposure event records exact rendered ordering.
                items: [
                  ...newContracts.map((item) => ({
                    id: item.id,
                    itemType: 'market',
                    matchType: item.searchMatchType ?? 'lexical',
                  })),
                  ...(newPostsResults ?? []).map((item) => ({
                    id: item.id,
                    itemType: 'post',
                  })),
                ],
              })
            }

            // Store the search params that were used for this query
            if (freshQuery) {
              setLastSearchParams(searchParams)
              completedInThisMount.current = true
            }

            clearTimeout(timeoutId)
            finishFreshRequest()
            setLoading(false)

            return shouldLoadMore
          }
          finishFreshRequest()
          return shouldRetryAfterStaleResult()
        } catch (error) {
          clearTimeout(timeoutId)
          finishFreshRequest()
          if (error instanceof Error && error.name === 'AbortError') {
            if (
              discoveryRequestAttemptId &&
              isABTestAssignmentCurrent(discoveryAssignmentKey) &&
              discoveryVariant &&
              discoveryAssignmentSource
            ) {
              void track(DISCOVERY_SEARCH_ABORT_EVENT, {
                schemaVersion: 1,
                requestAttemptId: discoveryRequestAttemptId,
                variant: discoveryVariant,
                assignmentSource: discoveryAssignmentSource,
                sourceComponent: persistPrefix,
                surface: discoverySurface,
                page: discoveryPage,
                isFresh: !!freshQuery,
                latencyMs: Date.now() - requestStartedAt,
              })
            }
            return false
          }
          if (id !== requestId.current) return shouldRetryAfterStaleResult()
          if (freshQuery) {
            failedParamsGeneration.current = requestParamsGeneration
          }
          if (
            discoveryRequestAttemptId &&
            isABTestAssignmentCurrent(discoveryAssignmentKey) &&
            discoveryVariant &&
            discoveryAssignmentSource
          ) {
            void track(DISCOVERY_SEARCH_ERROR_EVENT, {
              schemaVersion: 1,
              requestAttemptId: discoveryRequestAttemptId,
              variant: discoveryVariant,
              assignmentSource: discoveryAssignmentSource,
              sourceComponent: persistPrefix,
              surface: discoverySurface,
              page: discoveryPage,
              isFresh: !!freshQuery,
              compatibilityFallback: usedCompatibilityFallback,
              errorCode: error instanceof APIError ? error.code : undefined,
              errorType: error instanceof Error ? error.name : typeof error,
              latencyMs: Date.now() - requestStartedAt,
            })
          }
          console.error('Error fetching search results:', error)
          setLoading(false)
        }
      }
      return false
    }
  )

  const invalidateCurrentRequests = useEvent(() => {
    // Load-more requests intentionally do not replace the fresh-request abort
    // controller, but their result must still become stale as soon as params
    // change. Advance the generation before checking for a controller.
    paramsGeneration.current++
    requestId.current++
    const controller = freshRequestAbortController.current
    if (!controller) return

    // Invalidate before aborting so even an already-resolved continuation
    // cannot publish stale state. The debounced effect issues any replacement
    // required by the new params.
    freshRequestAbortController.current = undefined
    controller.abort()
    setLoading(false)
  })

  const serializedSearchParams = JSON.stringify({
    searchParams,
    discoveryAssignmentKey,
    discoveryVariant,
  })
  useSafeLayoutEffect(() => {
    // Invalidate a superseded request immediately. Waiting for the next
    // debounced request would let the old response land during that delay.
    invalidateCurrentRequests()
  }, [serializedSearchParams, invalidateCurrentRequests])

  // The URL query reaches searchParams a render after isReady, so the query
  // the page mounted with is whatever the first debounced pass over ready
  // params sees. Until then the current query stands in for it, which keeps
  // a deep-linked load as responsive as a blank one.
  // lastSearchParams outlives this mount, so until a request completes here
  // it may describe an earlier visit, and a deep-linked query would look
  // typed next to it.
  const requestDebounceMs = getSearchRequestDebounceMs(
    searchParams[QUERY_KEY],
    completedInThisMount.current ? lastSearchParams?.[QUERY_KEY] : undefined,
    initialQuery.current ?? searchParams[QUERY_KEY]
  )
  useDebouncedEffect(
    () => {
      // Whether this pass issues the first request or finds results restored
      // from an earlier visit, the query it sees is the one this mount
      // committed to, so typing after it waits like a keystroke.
      if (isReady && initialQuery.current === undefined) {
        initialQuery.current = searchParams[QUERY_KEY]
      }
      // One effect avoids duplicate initial requests. Term typing waits long
      // enough for ordinary keystroke bursts to settle; filter changes stay
      // responsive.
      if (state.contracts === undefined || requestParamsChanged()) {
        querySearchResults(true)
      }
    },
    requestDebounceMs,
    [isReady, serializedSearchParams]
  )

  // Persistent results are shared by the component key, so never render one
  // account's personalized rows (or stale params) while a replacement loads.
  const hasCurrentResults = !requestParamsChanged()
  const contracts =
    hasCurrentResults && state.contracts
      ? uniqBy(
          state.contracts.filter((c) => {
            return (
              !additionalFilter?.excludeContractIds?.includes(c.id) &&
              !additionalFilter?.excludeGroupSlugs?.some((slug) =>
                c.groupSlugs?.includes(slug)
              ) &&
              !additionalFilter?.excludeUserIds?.includes(c.creatorId)
            )
          }),
          'id'
        )
      : undefined

  // A result set can be restored from the in-memory cache on a later visit.
  // Give each mounted presentation its own denominator while keeping the
  // result-set ID stable for response/page diagnostics.
  const discoveryPresentationId = useMemo(
    () => (state.discoveryResultSetId ? randomString(16) : undefined),
    [state.discoveryResultSetId]
  )

  const stateAssignmentKey = state.discoveryAssignmentKey
  const discoveryTracking: DiscoveryResultTracking | undefined =
    trackDiscoveryExperiment &&
    stateAssignmentKey &&
    state.discoveryResultSetId &&
    discoveryPresentationId &&
    state.discoveryVariant &&
    state.discoveryAssignmentSource &&
    state.discoverySurface &&
    state.discoverySemanticEligible !== undefined &&
    state.discoverySemanticMarketCount !== undefined &&
    state.discoveryInitialLatencyMs !== undefined &&
    stateAssignmentKey === discoveryAssignmentKey &&
    state.discoveryVariant === discoveryVariant &&
    isABTestAssignmentCurrent(discoveryAssignmentKey) &&
    !requestParamsChanged()
      ? {
          assignmentKey: stateAssignmentKey,
          resultSetId: state.discoveryResultSetId,
          presentationId: discoveryPresentationId,
          variant: state.discoveryVariant,
          source: state.discoveryAssignmentSource,
          sourceComponent: persistPrefix,
          surface: state.discoverySurface,
          semanticEligible: state.discoverySemanticEligible,
          semanticMarketCount: state.discoverySemanticMarketCount,
          initialLatencyMs: state.discoveryInitialLatencyMs,
          compatibilityFallback: state.discoveryCompatibilityFallback ?? false,
        }
      : undefined

  return {
    contracts,
    users: hasCurrentResults ? state.users : undefined,
    topics: hasCurrentResults ? state.topics : undefined,
    loading,
    shouldLoadMore: hasCurrentResults ? state.shouldLoadMore : true,
    loadMoreContracts: () => querySearchResults(false, true),
    refreshContracts: () => querySearchResults(true, true),
    posts: hasCurrentResults ? state.posts : undefined,
    discoveryTracking,
  }
}

const useTrackDiscoveryExposure = (props: {
  contracts: FullMarketSearchResult[] | undefined
  posts: TopLevelPost[] | undefined
  searchParams: SearchParams
  tracking: DiscoveryResultTracking | undefined
  visible: boolean
}) => {
  const { contracts, posts, searchParams, tracking, visible } = props
  const trackedPresentationId = useRef<string>()

  useEffect(() => {
    if (
      !visible ||
      !tracking ||
      !isABTestAssignmentCurrent(tracking.assignmentKey) ||
      (contracts === undefined && posts === undefined) ||
      trackedPresentationId.current === tracking.presentationId
    ) {
      return
    }
    trackedPresentationId.current = tracking.presentationId

    const sort =
      searchParams[TOPIC_FILTER_KEY] === 'recent'
        ? undefined
        : searchParams[SORT_KEY]
    const items = orderCombinedSearchResults(contracts ?? [], posts ?? [], {
      sort,
      preserveUnmarkedContractOrder:
        sort === 'score' && searchParams[QUERY_KEY].trim().length > 0,
    })

    void track(DISCOVERY_EXPOSURE_EVENT, {
      schemaVersion: 1,
      presentationId: tracking.presentationId,
      resultSetId: tracking.resultSetId,
      variant: tracking.variant,
      assignmentSource: tracking.source,
      sourceComponent: tracking.sourceComponent,
      surface: tracking.surface,
      semanticEligible: tracking.semanticEligible,
      semanticMarketCount: tracking.semanticMarketCount,
      initialLatencyMs: tracking.initialLatencyMs,
      compatibilityFallback: tracking.compatibilityFallback,
      resultCount: items.length,
      marketCount: items.filter((item) => 'mechanism' in item).length,
      postCount: items.filter((item) => !('mechanism' in item)).length,
      items: items.slice(0, MAX_TRACKED_DISCOVERY_ITEMS).map((item, index) =>
        'mechanism' in item
          ? {
              id: item.id,
              itemType: 'market',
              rank: index + 1,
              matchType: item.searchMatchType ?? 'lexical',
            }
          : {
              id: item.id,
              itemType: 'post',
              rank: index + 1,
            }
      ),
    })
  }, [visible, tracking, contracts, posts, searchParams])
}

export const useSearchQueryState = (props: {
  persistPrefix: string
  defaultSort?: Sort
  defaultFilter?: Filter
  defaultContractType?: ContractTypeType
  defaultSearchType?: SearchType
  defaultPrizeMarket?: '1' | '0'
  defaultSweepies?: '2' | '1' | '0'
  defaultForYou?: '1' | '0'
  useUrlParams?: boolean
  defaultTopicFilter?: string
  defaultLiquidityTier?: string
}) => {
  const {
    persistPrefix,
    defaultSort,
    defaultFilter,
    defaultContractType,
    defaultSearchType,
    useUrlParams,
    defaultPrizeMarket,
    defaultForYou,
    defaultTopicFilter,
    defaultSweepies,
    defaultLiquidityTier,
  } = props

  const defaults = {
    [QUERY_KEY]: '',
    [SORT_KEY]: defaultSort ?? 'score',
    [FILTER_KEY]: defaultFilter ?? 'all',
    [CONTRACT_TYPE_KEY]: defaultContractType ?? 'ALL',
    [SEARCH_TYPE_KEY]: defaultSearchType,
    [PRIZE_MARKET_KEY]: defaultPrizeMarket ?? '0',
    [FOR_YOU_KEY]: defaultForYou ?? '0',
    [TOPIC_FILTER_KEY]: defaultTopicFilter ?? '',
    [SWEEPIES_KEY]: defaultSweepies ?? '0',
    [GROUP_IDS_KEY]: '',
    [LIQUIDITY_KEY]: defaultLiquidityTier ?? '',
    [HAS_BETS_KEY]: '0' as '0' | '1',
  }

  const useHook = useUrlParams ? usePersistentQueriesState : useNothing
  const [queryState, updateQueryState, queryReady] = useHook(
    defaults,
    persistPrefix
  )
  const [localState, updateLocalState, localReady] = useLocalPartialUpdater(
    defaults,
    persistPrefix
  )

  // copy query state -> local state iff we are using query params and any params are set
  // only do this once on first load.
  useEffect(() => {
    if (
      queryReady &&
      localReady &&
      useUrlParams &&
      !isEqual(queryState, defaults)
    ) {
      updateLocalState(queryState)
    }
  }, [queryReady, localReady])

  const setState = useEvent((newState: Partial<SearchParams>) => {
    updateLocalState(newState)
    if (useUrlParams) updateQueryState(newState)
  })

  return [localState, setState, queryReady && localReady] as const
}

// shim for hook rules and types
const useNothing = <T,>(x: T, _: string) =>
  [x, (_: Partial<T>) => {}, true] as const satisfies any[]

const useLocalPartialUpdater = <T extends Record<string, string | undefined>>(
  defaults: T,
  persistPrefix: string
) => {
  const [state, setState, ready] = usePersistentLocalState(
    defaults,
    searchLocalKey(persistPrefix)
  )

  const updateState = (
    newState: Partial<T> | ((prevState: T) => Partial<T>)
  ) => {
    if (typeof newState === 'function') {
      setState((prevState) => ({ ...prevState, ...newState(prevState) }))
    } else {
      setState((prevState) => ({ ...prevState, ...newState }))
    }
  }

  // the first copy of data from local state may be missing values, so we return the full state
  return [{ ...defaults, ...state }, updateState, ready] as const
}

export const searchLocalKey = (persistPrefix: string) =>
  `${persistPrefix}-local-state`
