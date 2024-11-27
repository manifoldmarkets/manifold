'use client'
import { XIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import { Contract } from 'common/contract'
import { LiteGroup } from 'common/group'
import { capitalize, sample, uniqBy } from 'lodash'
import { ReactNode, useEffect, useRef, useState } from 'react'
import { AddContractToGroupButton } from 'web/components/topics/add-contract-to-group-modal'
import { useDebouncedEffect } from 'web/hooks/use-debounced-effect'
import { useEvent } from 'web/hooks/use-event'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { usePersistentQueriesState } from 'web/hooks/use-persistent-query-state'
import { track, trackCallback } from 'web/lib/service/analytics'
import { Col } from './layout/col'
import { Row } from './layout/row'
import { Input } from './widgets/input'
import { FullUser } from 'common/api/user-types'
import { CONTRACTS_PER_SEARCH_PAGE } from 'common/supabase/contracts'
import { buildArray } from 'common/util/array'
import { Button, IconButton } from 'web/components/buttons/button'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import { searchContracts, searchGroups } from 'web/lib/api/api'
import { searchUsers } from 'web/lib/supabase/users'
import {
  actionColumn,
  probColumn,
  tierColumn,
  traderColumn,
} from './contract/contract-table-col-formats'
import { ContractsTable, LoadingContractRow } from './contract/contracts-table'
import { ContractFilters } from './search/contract-filters'
import { UserResults } from './search/user-results'
import { BrowseTopicPills } from './topics/browse-topic-pills'
import { LoadingIndicator } from './widgets/loading-indicator'
import { LoadMoreUntilNotVisible } from './widgets/visibility-observer'
import { BinaryDigit, TierParamsType } from 'common/tier'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { Spacer } from './layout/spacer'
import { useSweepstakes } from './sweepstakes-provider'
import { FilterPill } from './search/filter-pills'
import { ALL_PARENT_TOPICS, TOPICS_TO_SUBTOPICS } from 'common/topics'
import { Carousel } from './widgets/carousel'

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
  [MARKET_TIER_KEY]: TierParamsType
  [TOPIC_FILTER_KEY]: string
  [SWEEPIES_KEY]: BinaryDigit
  [GROUP_IDS_KEY]: string
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
  // mirror of search param state, but to determine if the first load should load new data
  lastSearchParams?: {
    query: string
    sort: Sort
    filter: Filter
    contractType: ContractTypeType
    topicSlug: string
    isPrizeMarket: '1' | '0'
    forYou: '1' | '0'
    marketTier: TierParamsType
    topicFilter: string
    isSweepies: '1' | '0'
    gids: string
  }
}

export function Search(props: {
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
}) {
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
    defaultSweepies: prefersPlay ? '0' : '1',
  })

  const query = searchParams[QUERY_KEY]
  const searchType = searchParams[SEARCH_TYPE_KEY]
  const filter = searchParams[FILTER_KEY]
  const contractType = searchParams[CONTRACT_TYPE_KEY]
  const prizeMarketState = searchParams[PRIZE_MARKET_KEY]
  const sweepiesState = searchParams[SWEEPIES_KEY]
  const groupIds = searchParams[GROUP_IDS_KEY]
  useEffect(() => {
    const isSweeps = sweepiesState === '1'
    if (prefersPlay !== isSweeps) return
    setSearchParams({
      [SWEEPIES_KEY]: prefersPlay ? '0' : '1',
    })
  }, [prefersPlay, sweepiesState])

  const showSearchTypes = !!query && !hideSearchTypes && !contractsOnly

  const {
    contracts,
    users,
    topics,
    loading,
    shouldLoadMore,
    querySearchResults,
  } = useSearchResults(
    persistPrefix,
    searchParams,
    showSearchTypes,
    topicSlug,
    additionalFilter,
    hideSweepsToggle
  )

  const showTopics = topics && topics.length > 0 && query && query.length > 0

  const showUsers = users && users.length > 0 && query !== ''

  const onChange = (changes: Partial<SearchParams>) => {
    const updatedParams = { ...changes }

    if (changes[FOR_YOU_KEY] === '1' || topicSlug != '') {
      updatedParams[TOPIC_FILTER_KEY] = ''
    }

    setSearchParams(updatedParams)
    if (isWholePage) window.scrollTo(0, 0)
  }

  const setQuery = (query: string) => onChange({ [QUERY_KEY]: query })

  const showContractFilters = !hideContractFilters

  useDebouncedEffect(
    () => {
      if (isReady) {
        querySearchResults(true)
      }
    },
    50,
    [topicSlug, isReady, JSON.stringify(searchParams)]
  )

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

  const hasQuery = query !== ''
  const selectedTopic = groupIds
    ? ALL_PARENT_TOPICS.find((topic) =>
        TOPICS_TO_SUBTOPICS[topic].some((subtopic) =>
          groupIds.split(',').some((id) => subtopic.groupIds.includes(id))
        )
      )
    : undefined
  return (
    <Col className="w-full">
      <Col
        className={clsx(
          'sticky top-0 z-20',
          !headerClassName && ' bg-canvas-50',
          headerClassName
        )}
      >
        {!hideSearch && (
          <Row className="relative w-full">
            <Input
              type="text"
              inputMode="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onBlur={trackCallback('search', { query: query })}
              placeholder={
                searchType === 'Users'
                  ? 'Search users'
                  : searchType === 'Questions' || contractsOnly
                  ? 'Search questions'
                  : isMobile
                  ? 'Search'
                  : 'Search questions, users, and topics'
              }
              className={clsx('w-full')}
              style={{
                paddingRight: hasQuery ? '40px' : '0px',
              }}
              autoFocus={autoFocus}
            />
            <Row className="absolute right-2 top-1/2 -translate-y-1/2">
              {hasQuery && (
                <IconButton
                  size={'2xs'}
                  onClick={() => {
                    onChange({ [QUERY_KEY]: '' })
                  }}
                >
                  {loading ? (
                    <LoadingIndicator size="sm" />
                  ) : (
                    <XIcon className={'h-5 w-5 rounded-full'} />
                  )}
                </IconButton>
              )}
            </Row>
          </Row>
        )}
        {showContractFilters && (
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
        <Col className="mb-2">
          {/* Main topics row */}
          {showTopicsFilterPills && (
            <Carousel fadeEdges labelsParentClassName="gap-1 items-center">
              {ALL_PARENT_TOPICS.map((topic) => (
                <FilterPill
                  key={topic}
                  selected={selectedTopic === topic}
                  onSelect={() => {
                    if (selectedTopic === topic) {
                      onChange({ [GROUP_IDS_KEY]: '' })
                    } else {
                      track('select search topic', { topic })
                      // Join all group IDs for this topic's subtopics
                      const allGroupIds = TOPICS_TO_SUBTOPICS[topic]
                        .map((subtopic) => subtopic.groupIds)
                        .flat()
                      onChange({ [GROUP_IDS_KEY]: allGroupIds.join(',') })
                    }
                  }}
                >
                  {topic}
                </FilterPill>
              ))}
            </Carousel>
          )}

          {/* Subtopics row */}
          {selectedTopic && (
            <Carousel fadeEdges labelsParentClassName="gap-1 mt-1">
              {TOPICS_TO_SUBTOPICS[selectedTopic].map(({ name, groupIds }) => (
                <FilterPill
                  key={name}
                  selected={searchParams[GROUP_IDS_KEY] === groupIds.join(',')}
                  onSelect={() => {
                    if (searchParams[GROUP_IDS_KEY] === groupIds.join(',')) {
                      onChange({
                        [GROUP_IDS_KEY]: TOPICS_TO_SUBTOPICS[selectedTopic]
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
                  {name}
                </FilterPill>
              ))}
            </Carousel>
          )}
        </Col>
      </Col>
      <Spacer h={2} />
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

      {!contracts ? (
        <LoadingResults />
      ) : contracts.length === 0 ? (
        emptyContractsState
      ) : (
        <>
          <ContractsTable
            hideAvatar={hideAvatars}
            contracts={contracts}
            onContractClick={onContractClick}
            highlightContractIds={highlightContractIds}
            columns={buildArray([
              tierColumn,
              traderColumn,
              probColumn,
              !hideActions && actionColumn,
            ])}
          />
          <LoadMoreUntilNotVisible
            loadMore={() => querySearchResults(false, true)}
          />
          {shouldLoadMore && <LoadingResults />}
          {!shouldLoadMore &&
            (filter !== 'all' ||
              contractType !== 'ALL' ||
              prizeMarketState === '1' ||
              sweepiesState === '1') && (
              <div className="text-ink-500 mx-2 my-8 text-center">
                No more results under this filter.{' '}
                <button
                  className="text-primary-500 hover:underline focus:underline"
                  onClick={() =>
                    onChange({
                      [FILTER_KEY]: 'all',
                      [CONTRACT_TYPE_KEY]: 'ALL',
                      p: '0',
                    })
                  }
                >
                  Clear filter
                </button>
              </div>
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

const LoadingResults = () => {
  return (
    <Col className="w-full">
      <LoadingContractRow />
      <LoadingContractRow />
      <LoadingContractRow />
    </Col>
  )
}

const FRESH_SEARCH_CHANGED_STATE: SearchState = {
  contracts: undefined,
  users: undefined,
  topics: undefined,
  shouldLoadMore: true,
}

const useSearchResults = (
  persistPrefix: string,
  searchParams: SearchParams,
  showSearchTypes: boolean,
  topicSlug: string,
  additionalFilter?: SupabaseAdditionalFilter,
  hideSweepsToggle?: boolean
) => {
  const [state, setState] = usePersistentInMemoryState<SearchState>(
    FRESH_SEARCH_CHANGED_STATE,
    `${persistPrefix}-supabase-contract-search`
  )
  const [loading, setLoading] = useState(false)

  const requestId = useRef(0)

  const querySearchResults = useEvent(
    async (freshQuery?: boolean, contractsOnly?: boolean) => {
      const {
        q: query,
        s: sort,
        f: filter,
        ct: contractType,
        p: isPrizeMarketString,
        fy: forYou,
        mt: marketTier,
        tf: topicFilter,
        sw: isSweepiesString,
        gids,
      } = searchParams
      // if fresh query and the search params haven't changed (like user clicked back) do nothing
      if (
        freshQuery &&
        query === state.lastSearchParams?.query &&
        sort === state.lastSearchParams?.sort &&
        filter === state.lastSearchParams?.filter &&
        contractType === state.lastSearchParams?.contractType &&
        topicSlug === state.lastSearchParams?.topicSlug &&
        topicSlug !== 'recent' &&
        isPrizeMarketString == state.lastSearchParams?.isPrizeMarket &&
        forYou == state.lastSearchParams?.forYou &&
        marketTier == state.lastSearchParams?.marketTier &&
        topicFilter == state.lastSearchParams?.topicFilter &&
        isSweepiesString == state.lastSearchParams?.isSweepies &&
        gids == state.lastSearchParams?.gids
      ) {
        return state.shouldLoadMore
      }

      const includeUsersAndTopics = !contractsOnly && showSearchTypes

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

        try {
          const searchPromises: Promise<any>[] = [
            searchContracts({
              term: query,
              filter,
              sort,
              contractType,
              offset: freshQuery ? 0 : state.contracts?.length ?? 0,
              limit: CONTRACTS_PER_SEARCH_PAGE,
              topicSlug:
                topicSlug !== ''
                  ? topicSlug
                  : topicFilter !== ''
                  ? topicFilter
                  : undefined,
              creatorId: additionalFilter?.creatorId,
              isPrizeMarket: isPrizeMarketString,
              marketTier,
              forYou,
              token: hideSweepsToggle
                ? 'ALL'
                : isSweepiesString === '1'
                ? 'CASH'
                : 'MANA',
              gids,
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

          const results = await Promise.all(searchPromises)

          if (id === requestId.current) {
            const newContracts = results[0]
            const newUsers = results[1]
            const newTopics = results[2]
            const freshContracts = freshQuery
              ? newContracts
              : buildArray(state.contracts, newContracts)

            const shouldLoadMore =
              newContracts.length === CONTRACTS_PER_SEARCH_PAGE

            setState({
              contracts: freshContracts,
              users: includeUsersAndTopics ? newUsers : state.users,
              topics: includeUsersAndTopics ? newTopics.lite : state.topics,
              shouldLoadMore,
              lastSearchParams: {
                query,
                sort,
                filter,
                contractType,
                topicSlug,
                isPrizeMarket: isPrizeMarketString,
                forYou,
                marketTier,
                topicFilter,
                isSweepies: isSweepiesString,
                gids,
              },
            })
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
    querySearchResults,
  }
}

const useSearchQueryState = (props: {
  persistPrefix: string
  defaultSort?: Sort
  defaultFilter?: Filter
  defaultContractType?: ContractTypeType
  defaultSearchType?: SearchType
  defaultPrizeMarket?: '1' | '0'
  defaultSweepies?: '1' | '0'
  defaultForYou?: '1' | '0'
  useUrlParams?: boolean
  defaultMarketTier?: TierParamsType
  defaultTopicFilter?: string
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
    defaultMarketTier,
    defaultTopicFilter,
    defaultSweepies,
  } = props

  const defaults = {
    [QUERY_KEY]: '',
    [SORT_KEY]: defaultSort ?? 'score',
    [FILTER_KEY]: defaultFilter ?? 'all',
    [CONTRACT_TYPE_KEY]: defaultContractType ?? 'ALL',
    [SEARCH_TYPE_KEY]: defaultSearchType,
    [PRIZE_MARKET_KEY]: defaultPrizeMarket ?? '0',
    [FOR_YOU_KEY]: defaultForYou ?? '0',
    [MARKET_TIER_KEY]: defaultMarketTier ?? DEFAULT_TIER,
    [TOPIC_FILTER_KEY]: defaultTopicFilter ?? '',
    [SWEEPIES_KEY]: defaultSweepies ?? '0',
    [GROUP_IDS_KEY]: '',
  }

  const useHook = useUrlParams ? usePersistentQueriesState : useShim
  const [state, setState, ready] = useHook(defaults, persistPrefix)

  return [state, setState, ready] as const
}

const useShim = <T extends Record<string, string | undefined>>(
  x: T,
  persistPrefix: string
) => {
  const [state, setState, ready] = usePersistentLocalState(
    x,
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

  return [state, updateState, ready] as const
}

export const searchLocalKey = (persistPrefix: string) =>
  `${persistPrefix}-local-state`
