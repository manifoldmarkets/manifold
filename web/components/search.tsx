'use client'
import clsx from 'clsx'
import { Contract } from 'common/contract'
import { LiteGroup } from 'common/group'
import { capitalize, groupBy, minBy, orderBy, sample, uniqBy } from 'lodash'
import { ReactNode, useEffect, useRef, useState } from 'react'
import { AddContractToGroupButton } from 'web/components/topics/add-contract-to-group-modal'
import { useDebouncedEffect } from 'web/hooks/use-debounced-effect'
import { useEvent } from 'client-common/hooks/use-event'
import { usePersistentInMemoryState } from 'client-common/hooks/use-persistent-in-memory-state'
import { usePersistentQueriesState } from 'web/hooks/use-persistent-query-state'
import { track } from 'web/lib/service/analytics'
import { Col } from './layout/col'
import { Row } from './layout/row'
import { FullUser } from 'common/api/user-types'
import { CONTRACTS_PER_SEARCH_PAGE } from 'common/supabase/contracts'
import { buildArray } from 'common/util/array'
import { Button } from 'web/components/buttons/button'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import { api, searchGroups } from 'web/lib/api/api'
import { searchUsers } from 'web/lib/supabase/users'

import { LoadingContractRow } from './contract/contracts-table'
import { ContractFilters } from './search/contract-filters'
import { UserResults } from './search/user-results'
import { BrowseTopicPills } from './topics/browse-topic-pills'
import { LoadMoreUntilNotVisible } from 'web/components/widgets/visibility-observer'
import { BinaryDigit } from 'common/tier'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { Spacer } from './layout/spacer'
import { useSweepstakes } from './sweepstakes-provider'
import { SEARCH_TOPICS_TO_SUBTOPICS } from 'common/topics'
import { Carousel } from './widgets/carousel'
import { isEqual } from 'lodash'
import { SearchInput } from './search/search-input'
import { removeEmojis } from 'common/util/string'
import { useIsPageVisible } from 'web/hooks/use-page-visible'
import { TopLevelPost } from 'common/top-level-post'
import { CombinedResults } from './contract/combined-results'
import { APIParams } from 'common/api/schema'
import { useUser } from 'web/hooks/use-user'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { getFollowedGroupsCount } from 'common/supabase/groups'
import { db } from 'web/lib/supabase/db'
import { DAY_MS } from 'common/util/time'

const USERS_PER_PAGE = 100
const TOPICS_PER_PAGE = 100

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
  { label: '🎲 Random!', value: 'random' },
] as const

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
  'freshness-score',
])

export const bountySorts = new Set(['bounty-amount'])

const probSorts = new Set(['prob-descending', 'prob-ascending'])

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
] as const

export type Filter = (typeof FILTERS)[number]['value']

export const CONTRACT_TYPES = [
  { label: 'Any type', value: 'ALL' },
  { label: 'Yes/No', value: 'BINARY' },
  { label: 'Multiple Choice', value: 'MULTIPLE_CHOICE' },
  { label: 'Numeric', value: 'PSEUDO_NUMERIC' },
  { label: 'Bounty', value: 'BOUNTIED_QUESTION' },
  { label: 'Stock', value: 'STONK' },
  { label: 'Poll', value: 'POLL' },
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
  contracts: Contract[] | undefined
  users: FullUser[] | undefined
  topics: LiteGroup[] | undefined
  shouldLoadMore: boolean
  posts: TopLevelPost[] | undefined
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
}

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
  } = props

  const isMobile = useIsMobile()
  const { prefersPlay, setPrefersPlay } = useSweepstakes()
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
  } = useSearchResults({
    persistPrefix,
    searchParams: searchParams,
    includeUsersAndTopics: showSearchTypes,
    isReady,
    additionalFilter,
  })
  const visible = useIsPageVisible()
  useEffect(() => {
    if (visible && refreshOnVisible) {
      refreshContracts()
    }
  }, [visible, refreshOnVisible])

  const showTopics = topics && topics.length > 0 && query && query.length > 0
  const showUsers = users && users.length > 0 && query && query.length > 0

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
  const selectedAll = !selectedTopic && !selectedFollowed
  const user = useUser()
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
            <Carousel
              fadeEdges
              labelsParentClassName="gap-4 items-baseline border-b border-ink-100 dark:border-ink-200 pb-2"
            >
              <button
                className={clsx(
                  'font-medium',
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
            </Carousel>
          )}
        </Col>
        {!hideSearch && (
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
            autoFocus={autoFocus}
            loading={loading}
          />
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
          />
        )}
      </Col>
      <Spacer h={1} />
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
                  initialShown={shouldShowALotOfTrendingTopics ? 20 : undefined}
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
            />
          ) : null}
          <LoadMoreUntilNotVisible loadMore={loadMoreContracts} />
          {shouldLoadMore && <LoadingContractResults />}
          {!shouldLoadMore && (
            <NoMoreResults params={searchParams} onChange={onChange} />
          )}
        </>
      )}
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
}

export const useSearchResults = (props: {
  persistPrefix: string
  searchParams: SearchParams
  includeUsersAndTopics: boolean
  isReady: boolean
  additionalFilter?: SupabaseAdditionalFilter
}) => {
  const { persistPrefix, searchParams, isReady, additionalFilter } = props

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

  const querySearchResults = useEvent(
    async (freshQuery?: boolean, contractsOnly?: boolean) => {
      if (!isReady) return true
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

      const shouldSearchPostsWithContracts =
        (sort === 'score' || sort === 'newest') &&
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
        const id = ++requestId.current
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
          limit: 10,
          userId: additionalFilter?.creatorId,
          offset: freshQuery ? 0 : state.posts?.length ?? 0,
        }
        try {
          if (contractType === 'POSTS') {
            const posts = await api('get-posts', postApiParams)
            const shouldLoadMore = posts.length === 10
            setState({
              contracts: [],
              users: undefined,
              topics: undefined,
              posts: uniqBy(buildArray(state.posts, posts), 'id'),
              shouldLoadMore,
            })

            // Store the search params that were used for this query
            if (freshQuery) {
              setLastSearchParams(searchParams)
            }

            clearTimeout(timeoutId)
            setLoading(false)
            return shouldLoadMore
          }
          const searchPromises: Promise<any>[] = [
            api('search-markets-full', {
              term: query,
              filter,
              sort,
              contractType,
              offset: freshQuery ? 0 : state.contracts?.length ?? 0,
              limit: CONTRACTS_PER_SEARCH_PAGE,
              topicSlug: topicSlug !== '' ? topicSlug : undefined,
              creatorId: additionalFilter?.creatorId,
              isPrizeMarket: isPrizeMarketString,
              forYou,
              token:
                sweepState === '2'
                  ? 'ALL'
                  : sweepState === '1'
                  ? 'CASH'
                  : 'MANA',
              gids,
              liquidity: liquidity === '' ? undefined : parseInt(liquidity),
              hasBets,
            }),
          ]

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
            searchPromises.push(api('get-posts', postApiParams))
          }

          const results = await Promise.all(searchPromises)

          if (id === requestId.current) {
            const newContracts = results[0] as Contract[]
            let postResultIndex = 1
            const newUsers = includeUsersAndTopics
              ? results[postResultIndex++]
              : undefined
            const newTopics = includeUsersAndTopics
              ? results[postResultIndex++]
              : undefined

            const newPostsResults =
              shouldSearchPostsWithContracts &&
              results.length >= postResultIndex
                ? (results[postResultIndex] as TopLevelPost[])
                : undefined

            const freshContracts = freshQuery
              ? newContracts
              : buildArray(state.contracts, newContracts)
            const bottomScoreFromAllContracts =
              sort === 'score'
                ? minBy(freshContracts, 'importanceScore')?.importanceScore
                : minBy(freshContracts, 'createdTime')?.createdTime

            // This is necessary bc the posts are in a different table than the contracts.
            // TODO: this is bad and will leave posts out of the search results randomly.
            // We should fix this by joining the posts table to the contracts table or something.
            let postFilteringThreshold: number | undefined
            if (sort === 'score') {
              if (
                !freshQuery &&
                state.contracts &&
                state.contracts.length > 0
              ) {
                postFilteringThreshold = minBy(
                  state.contracts,
                  'importanceScore'
                )?.importanceScore
              } else {
                postFilteringThreshold = bottomScoreFromAllContracts
              }
            } else {
              if (
                !freshQuery &&
                state.contracts &&
                state.contracts.length > 0
              ) {
                postFilteringThreshold = minBy(
                  state.contracts,
                  'createdTime'
                )?.createdTime
              } else {
                postFilteringThreshold = bottomScoreFromAllContracts
              }
            }
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

            const shouldLoadMore =
              newContracts.length === CONTRACTS_PER_SEARCH_PAGE

            setState({
              contracts: freshContracts,
              users: includeUsersAndTopics ? newUsers : state.users,
              topics: includeUsersAndTopics ? newTopics?.lite : state.topics,
              posts: freshPosts,
              shouldLoadMore,
            })

            // Store the search params that were used for this query
            if (freshQuery) {
              setLastSearchParams(searchParams)
            }

            clearTimeout(timeoutId)
            setLoading(false)

            return shouldLoadMore
          }
        } catch (error) {
          console.error('Error fetching search results:', error)
          setLoading(false)
        }
      }
      return false
    }
  )

  useDebouncedEffect(
    () => {
      if (!state.contracts?.length) {
        querySearchResults(true)
      }
    },
    50,
    [isReady]
  )
  useDebouncedEffect(
    () => {
      // Only do a fresh query if search parameters have meaningfully changed
      if (searchParamsChanged(searchParams, lastSearchParams)) {
        querySearchResults(true)
      }
    },
    50,
    [JSON.stringify(searchParams)]
  )

  const contracts = state.contracts
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

  return {
    contracts,
    users: state.users,
    topics: state.topics,
    loading,
    shouldLoadMore: state.shouldLoadMore,
    loadMoreContracts: () => querySearchResults(false, true),
    refreshContracts: () => querySearchResults(true, true),
    posts: state.posts,
  }
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
