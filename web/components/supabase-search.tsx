'use client'
import { ArrowLeftIcon, ChevronDownIcon, XIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import { capitalize, sample, uniqBy } from 'lodash'
import { ReactNode, useRef, useState } from 'react'
import { Contract } from 'common/contract'
import { useEvent } from 'web/hooks/use-event'
import { useDebouncedEffect } from 'web/hooks/use-debounced-effect'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { track, trackCallback } from 'web/lib/service/analytics'
import DropdownMenu from './comments/dropdown-menu'
import { Col } from './layout/col'
import { Row } from './layout/row'
import generateFilterDropdownItems, {
  getLabelFromValue,
} from './search/search-dropdown-helpers'
import { Input } from './widgets/input'
import { usePersistentQueriesState } from 'web/hooks/use-persistent-query-state'
import { usePartialUpdater } from 'web/hooks/use-partial-updater'
import {
  useGroupFromSlug,
  useRealtimeMemberGroupIds,
} from 'web/hooks/use-group-supabase'
import { DEFAULT_TOPIC, LiteGroup, TOPIC_KEY } from 'common/group'
import { TopicTag } from 'web/components/topics/topic-tag'
import { AddContractToGroupButton } from 'web/components/topics/add-contract-to-group-modal'
import { useUser } from 'web/hooks/use-user'

import { FollowOrUnfolowTopicButton } from 'web/components/topics/topics-button'

import { PillButton } from 'web/components/buttons/pill-button'
import { searchUsers } from 'web/lib/supabase/users'
import { Button, IconButton } from 'web/components/buttons/button'
import Link from 'next/link'
import { CONTRACTS_PER_SEARCH_PAGE } from 'common/supabase/contracts'
import { UserResults } from './search/user-results'
import { searchContracts, searchGroups } from 'web/lib/firebase/api'
import { LoadMoreUntilNotVisible } from './widgets/visibility-observer'
import { LoadingIndicator } from './widgets/loading-indicator'
import {
  actionColumn,
  probColumn,
  traderColumn,
} from './contract/contract-table-col-formats'
import { buildArray } from 'common/util/array'
import { ContractsTable, LoadingContractRow } from './contract/contracts-table'
import { LiteUser } from 'common/api/user-types'

const USERS_PER_PAGE = 100
const TOPICS_PER_PAGE = 100

export const SORTS = [
  { label: 'Trending', value: 'score' },
  { label: 'Bounty amount', value: 'bounty-amount' },
  { label: 'New', value: 'newest' },
  { label: 'High stakes', value: 'liquidity' },
  { label: 'Closing soon', value: 'close-date' },
  { label: 'Daily change', value: 'daily-score' },
  { label: '24h volume', value: '24-hour-vol' },
  { label: 'Total traders', value: 'most-popular' },
  { label: 'Last activity', value: 'last-updated' },
  { label: 'Just resolved', value: 'resolve-date' },
  { label: 'High %', value: 'prob-descending' },
  { label: 'Low %', value: 'prob-ascending' },
  { label: '🎲 Random!', value: 'random' },
] as const

const predictionMarketSorts = new Set([
  'daily-score',
  '24-hour-vol',
  'liquidity',
  'close-date',
  'resolve-date',
  'most-popular',
  'prob-descending',
  'prob-ascending',
])

const bountySorts = new Set(['bounty-amount'])

const probSorts = new Set(['prob-descending', 'prob-ascending'])

const BOUNTY_MARKET_SORTS = SORTS.filter(
  (item) => !predictionMarketSorts.has(item.value)
)

const POLL_SORTS = BOUNTY_MARKET_SORTS.filter(
  (item) => !bountySorts.has(item.value)
)

const PREDICTION_MARKET_SORTS = SORTS.filter(
  (item) => !bountySorts.has(item.value) && !probSorts.has(item.value)
)

const PREDICTION_MARKET_PROB_SORTS = SORTS.filter(
  (item) => !bountySorts.has(item.value)
)

export type Sort = (typeof SORTS)[number]['value']

const FILTERS = [
  { label: 'Any status', value: 'all' },
  { label: 'Open', value: 'open' },
  { label: 'Closing this month', value: 'closing-this-month' },
  { label: 'Closing next month', value: 'closing-next-month' },
  { label: 'Closed', value: 'closed' },
  { label: 'Resolved', value: 'resolved' },
] as const

export type Filter = (typeof FILTERS)[number]['value']

const CONTRACT_TYPES = [
  { label: 'Any type', value: 'ALL' },
  { label: 'Yes/No', value: 'BINARY' },
  { label: 'Multiple Choice', value: 'MULTIPLE_CHOICE' },
  { label: 'Numeric', value: 'PSEUDO_NUMERIC' },
  { label: 'Bounty', value: 'BOUNTIED_QUESTION' },
  { label: 'Stock', value: 'STONK' },
  { label: 'Poll', value: 'POLL' },
] as const

export type ContractTypeType = (typeof CONTRACT_TYPES)[number]['value']
type SearchType = 'Topics' | 'Users' | 'Questions' | undefined

export type SearchParams = {
  [QUERY_KEY]: string
  [SORT_KEY]: Sort
  [FILTER_KEY]: Filter
  [CONTRACT_TYPE_KEY]: ContractTypeType
  [TOPIC_KEY]: string
  [SEARCH_TYPE_KEY]: SearchType
}

const QUERY_KEY = 'q'
export const SORT_KEY = 's'
const FILTER_KEY = 'f'
const CONTRACT_TYPE_KEY = 'ct'
export const SEARCH_TYPE_KEY = 't'

export type SupabaseAdditionalFilter = {
  creatorId?: string
  excludeContractIds?: string[]
  excludeGroupSlugs?: string[]
  excludeUserIds?: string[]
  isPolitics?: boolean
}

export type SearchState = {
  contracts: Contract[] | undefined
  shouldLoadMore: boolean
  // mirror of search param state, but to determine if the first load should load new data
  lastSearchParams?: {
    query: string
    sort: Sort
    filter: Filter
    contractType: ContractTypeType
    topicSlug: string
  }
}

export function SupabaseSearch(props: {
  persistPrefix: string
  defaultSort?: Sort
  defaultFilter?: Filter
  defaultContractType?: ContractTypeType
  defaultSearchType?: SearchType
  additionalFilter?: SupabaseAdditionalFilter
  highlightContractIds?: string[]
  onContractClick?: (contract: Contract) => void
  hideActions?: boolean
  headerClassName?: string
  isWholePage?: boolean
  menuButton?: ReactNode
  rowBelowFilters?: ReactNode
  // used to determine if search params should be updated in the URL
  useUrlParams?: boolean
  includeProbSorts?: boolean
  autoFocus?: boolean
  emptyState?: ReactNode
  hideSearch?: boolean
  hideContractFilters?: boolean
  topics?: LiteGroup[]
  setTopics?: (topics: LiteGroup[]) => void
  contractsOnly?: boolean
  showTopicTag?: boolean
  hideSearchTypes?: boolean
  hideAvatars?: boolean
}) {
  const {
    defaultSort,
    defaultFilter,
    defaultContractType,
    defaultSearchType,
    additionalFilter,
    onContractClick,
    hideActions,
    highlightContractIds,
    headerClassName,
    persistPrefix,
    includeProbSorts,
    isWholePage,
    useUrlParams,
    autoFocus,
    hideContractFilters,
    menuButton,
    rowBelowFilters,
    topics: topicResults,
    setTopics: setTopicResults,
    contractsOnly,
    showTopicTag,
    hideSearchTypes,
    hideAvatars,
  } = props

  const [searchParams, setSearchParams, isReady] = useSearchQueryState({
    defaultSort,
    defaultFilter,
    defaultContractType,
    defaultSearchType,
    useUrlParams,
  })
  const user = useUser()
  // const followingUsers = useFollowedUsersOnLoad(user?.id)
  const followingTopics = useRealtimeMemberGroupIds(user?.id)

  const query = searchParams[QUERY_KEY]
  const searchType = searchParams[SEARCH_TYPE_KEY]
  const topicSlug = searchParams[TOPIC_KEY]
  const sort = searchParams[SORT_KEY]
  const filter = searchParams[FILTER_KEY]
  const contractType = searchParams[CONTRACT_TYPE_KEY]

  const [userResults, setUserResults] = usePersistentInMemoryState<
    LiteUser[] | undefined
  >(undefined, `${persistPrefix}-queried-user-results`)

  const { contracts, loading, queryContracts, shouldLoadMore } =
    useContractSearch(persistPrefix, searchParams, additionalFilter)

  const onChange = (changes: Partial<SearchParams>) => {
    setSearchParams(changes)
    if (isWholePage) window.scrollTo(0, 0)
  }

  const pillOptions: SearchType[] = ['Questions', 'Users', 'Topics']
  const setQuery = (query: string) => onChange({ [QUERY_KEY]: query })
  const setSearchType = (t: SearchType) => onChange({ [SEARCH_TYPE_KEY]: t })

  const showSearchTypes =
    !hideSearchTypes &&
    !contractsOnly &&
    (((!topicSlug || topicSlug === 'for-you') && query !== '') || searchType)

  const queryUsers = useEvent(async (query: string) =>
    searchUsers(query, USERS_PER_PAGE)
  )

  const queryTopics = useEvent(async (query: string) =>
    searchGroups({
      term: query,
      limit: TOPICS_PER_PAGE,
      type: 'lite',
    })
  )

  useDebouncedEffect(
    () => {
      if (isReady) {
        queryContracts(true)
      }
    },
    100,
    [query, topicSlug, sort, filter, contractType, isReady]
  )

  const searchCountRef = useRef(0)
  useDebouncedEffect(
    () => {
      const searchCount = ++searchCountRef.current
      queryUsers(query).then((results) => {
        if (searchCount === searchCountRef.current) setUserResults(results)
      })
      queryTopics(query).then((results) => {
        if (searchCount === searchCountRef.current)
          setTopicResults?.(results.lite)
      })
    },
    100,
    [query]
  )

  const emptyContractsState =
    props.emptyState ??
    (query ? (
      <NoResults currentFilter={filter} updateParams={onChange} />
    ) : (
      <Col className="text-ink-700 mx-2 my-6 text-center">
        No questions yet.
        {topicSlug && (
          <Row className={'mt-2 w-full items-center justify-center'}>
            <AddContractToGroupButton groupSlug={searchParams[TOPIC_KEY]} />
          </Row>
        )}
      </Col>
    ))

  return (
    <Col className="w-full">
      <Col className={clsx('sticky top-0 z-20 ', headerClassName)}>
        <Row>
          <Col className={'w-full'}>
            <Row className={'relative'}>
              <Input
                type="text"
                inputMode="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onBlur={trackCallback('search', { query: query })}
                placeholder={
                  searchType === 'Users'
                    ? 'Search users'
                    : searchType === 'Topics'
                    ? 'Search topics'
                    : searchType === 'Questions' ||
                      (topicSlug && topicSlug !== 'for-you')
                    ? 'Search questions'
                    : 'Search questions, users, and topics'
                }
                className="w-full"
                autoFocus={autoFocus}
              />
              {query !== '' && (
                <IconButton
                  className={'absolute right-2 top-1/2 -translate-y-1/2'}
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
          </Col>
          {menuButton}
        </Row>
        {!hideContractFilters && (
          <ContractFilters
            includeProbSorts={includeProbSorts}
            params={searchParams}
            updateParams={onChange}
            className={
              searchType && searchType !== 'Questions' ? 'invisible' : ''
            }
            showTopicTag={showTopicTag}
          />
        )}
      </Col>
      {showSearchTypes ? (
        <Row className={'bg-canvas-0 md:bg-canvas-50 gap-1 pb-1'}>
          <Button
            size={'sm'}
            color={'gray-white'}
            className={'ml-1 rounded-full sm:hidden'}
            onClick={() => {
              onChange({ [SEARCH_TYPE_KEY]: undefined, [QUERY_KEY]: '' })
            }}
          >
            <ArrowLeftIcon className={'h-4 w-4'} />
          </Button>
          {pillOptions.map((option) => {
            const numHits =
              (option === 'Questions'
                ? contracts?.length
                : option === 'Users'
                ? userResults?.length
                : topicResults?.length) ?? 0

            const hitsTitle =
              numHits <= 0
                ? ''
                : numHits >= 100
                ? '100+ '
                : option === 'Questions' && shouldLoadMore && !loading
                ? `${numHits}+ `
                : `${numHits} `
            return (
              <PillButton
                key={option}
                selected={
                  searchType === option ||
                  (option === 'Questions' && !searchType)
                }
                onSelect={() => setSearchType(option)}
              >
                {hitsTitle + option}
              </PillButton>
            )
          })}
        </Row>
      ) : (
        rowBelowFilters
      )}
      {!searchType || searchType === 'Questions' ? (
        !contracts ? (
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
                traderColumn,
                probColumn,
                !hideActions && actionColumn,
              ])}
              headerClassName={clsx(headerClassName, '!top-14')}
            />
            <LoadMoreUntilNotVisible loadMore={queryContracts} />
            {shouldLoadMore && <LoadingResults />}
            {!shouldLoadMore &&
              (filter !== 'all' || contractType !== 'ALL') && (
                <div className="text-ink-500 mx-2 my-8 text-center">
                  No more results under this filter.{' '}
                  <button
                    className="text-primary-500 hover:underline"
                    onClick={() =>
                      onChange({
                        [FILTER_KEY]: 'all',
                        [CONTRACT_TYPE_KEY]: 'ALL',
                      })
                    }
                  >
                    Clear filter
                  </button>
                  ?
                </div>
              )}
          </>
        )
      ) : searchType === 'Users' ? (
        userResults && userResults.length === 0 ? (
          <Col className="text-ink-700 mx-2 my-6 text-center">
            No users found.
          </Col>
        ) : (
          <UserResults users={userResults ?? []} />
          // TODO: load more users when scroll to end
        )
      ) : searchType === 'Topics' ? (
        topicResults && topicResults.length === 0 ? (
          <Col className="text-ink-700 mx-2 my-6 text-center">
            No topics found.
            {/*  Create a new topic! */}
          </Col>
        ) : (
          <TopicResults
            topics={topicResults ?? []}
            yourTopicIds={followingTopics ?? []}
          />
        )
      ) : null}
    </Col>
  )
}

const TopicResults = (props: {
  topics: LiteGroup[]
  yourTopicIds: string[]
}) => {
  const { topics, yourTopicIds } = props
  const me = useUser()

  return (
    <Col className={'mt-1 w-full gap-1'}>
      {topics.map((group) => (
        <Link key={group.id} href={`/browse?${TOPIC_KEY}=${group.slug}`}>
          <Row className={'hover:bg-primary-100 min-h-[4rem] p-1 pl-2 pt-2.5'}>
            <Col className={'w-full'}>
              <span className="line-clamp-1 sm:text-lg">{group.name}</span>
              <Row className={'text-ink-500 line-clamp-2 gap-1 text-sm'}>
                {group.totalMembers > 1 && (
                  <span>{group.totalMembers} followers</span>
                )}
              </Row>
            </Col>
            <div>
              <FollowOrUnfolowTopicButton
                group={group}
                user={me}
                isMember={yourTopicIds.includes(group.id)}
              />
            </div>
          </Row>
        </Link>
      ))}
    </Col>
  )
}

const NoResults = (props: {
  currentFilter: string
  updateParams: (params: Partial<SearchParams>) => void
}) => {
  const { currentFilter, updateParams } = props
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
      {currentFilter !== 'all' ? (
        <>
          . Try using the
          <Button
            onClick={() => updateParams({ f: 'all' })}
            color={'indigo-outline'}
            className={'mx-1'}
            size={'2xs'}
          >
            Any status
          </Button>
          filter.
        </>
      ) : null}
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
  shouldLoadMore: true,
}

const useContractSearch = (
  persistPrefix: string,
  searchParams: SearchParams,
  additionalFilter?: SupabaseAdditionalFilter
) => {
  const [state, setState] = usePersistentInMemoryState<SearchState>(
    FRESH_SEARCH_CHANGED_STATE,
    `${persistPrefix}-supabase-contract-search`
  )
  const [loading, setLoading] = useState(false)

  const requestId = useRef(0)

  const queryContracts = useEvent(async (freshQuery?: boolean) => {
    const {
      q: query,
      s: sort,
      f: filter,
      topic: topicSlug,
      ct: contractType,
    } = searchParams

    // if fresh query and the search params haven't changed (like user clicked back) do nothing
    if (
      freshQuery &&
      query === state.lastSearchParams?.query &&
      sort === state.lastSearchParams?.sort &&
      filter === state.lastSearchParams?.filter &&
      contractType === state.lastSearchParams?.contractType &&
      topicSlug === state.lastSearchParams?.topicSlug
    ) {
      return state.shouldLoadMore
    }

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

      const newContracts = await searchContracts({
        term: query,
        filter,
        sort,
        contractType,
        offset: freshQuery ? 0 : state.contracts?.length ?? 0,
        limit: CONTRACTS_PER_SEARCH_PAGE,
        topicSlug: topicSlug !== '' ? topicSlug : undefined,
        creatorId: additionalFilter?.creatorId,
        isPolitics: additionalFilter?.isPolitics,
      })

      if (id === requestId.current) {
        const freshContracts = freshQuery
          ? newContracts
          : buildArray(state.contracts, newContracts)

        const shouldLoadMore = newContracts.length === CONTRACTS_PER_SEARCH_PAGE

        setState({
          contracts: freshContracts,
          shouldLoadMore,
          lastSearchParams: { query, sort, filter, contractType, topicSlug },
        })
        clearTimeout(timeoutId)
        setLoading(false)

        return shouldLoadMore
      }
    }
    return false
  })

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
    loading,
    shouldLoadMore: state.shouldLoadMore,
    queryContracts,
  }
}

const useSearchQueryState = (props: {
  defaultSort?: Sort
  defaultFilter?: Filter
  defaultContractType?: ContractTypeType
  defaultSearchType?: SearchType
  useUrlParams?: boolean
}) => {
  const {
    defaultSort = 'score',
    defaultFilter = 'open',
    defaultContractType = 'ALL',
    defaultSearchType,
    useUrlParams,
  } = props

  const defaults = {
    [QUERY_KEY]: '',
    [SORT_KEY]: defaultSort,
    [FILTER_KEY]: defaultFilter,
    [CONTRACT_TYPE_KEY]: defaultContractType,
    [TOPIC_KEY]: DEFAULT_TOPIC,
    [SEARCH_TYPE_KEY]: defaultSearchType,
  }

  const useHook = useUrlParams ? usePersistentQueriesState : useShim
  const [state, setState, ready] = useHook(defaults)
  return [state, setState, ready] as const
}

const useShim = <T extends Record<string, string | undefined>>(x: T) => {
  const [state, setState] = usePartialUpdater(x)
  return [state, setState, true] as const
}

function ContractFilters(props: {
  className?: string
  includeProbSorts?: boolean
  params: SearchParams
  updateParams: (params: Partial<SearchParams>) => void
  showTopicTag?: boolean
}) {
  const { className, includeProbSorts, params, updateParams, showTopicTag } =
    props

  const { s: sort, f: filter, ct: contractType, topic: topicSlug } = params

  const selectFilter = (selection: Filter) => {
    if (selection === filter) return

    updateParams({ f: selection })
    track('select search filter', { filter: selection })
  }

  const selectSort = (selection: Sort) => {
    if (selection === sort) return

    if (selection === 'close-date') {
      updateParams({ s: selection, f: 'open' })
    } else if (selection === 'resolve-date') {
      updateParams({ s: selection, f: 'resolved' })
    } else {
      updateParams({ s: selection })
    }

    track('select search sort', { sort: selection })
  }

  const selectContractType = (selection: ContractTypeType) => {
    if (selection === contractType) return

    if (selection === 'BOUNTIED_QUESTION' && predictionMarketSorts.has(sort)) {
      updateParams({ s: 'bounty-amount', ct: selection })
    } else if (selection !== 'BOUNTIED_QUESTION' && bountySorts.has(sort)) {
      updateParams({ s: 'score', ct: selection })
    } else {
      updateParams({ ct: selection })
    }
    track('select contract type', { contractType: selection })
  }
  const hideFilter =
    sort === 'resolve-date' ||
    sort === 'close-date' ||
    contractType === 'BOUNTIED_QUESTION'

  const filterLabel = getLabelFromValue(FILTERS, filter)
  const sortLabel = getLabelFromValue(SORTS, sort)
  const contractTypeLabel = getLabelFromValue(CONTRACT_TYPES, contractType)
  const topic = useGroupFromSlug(topicSlug ?? '')
  const setTopic = (slug: string) => updateParams({ [TOPIC_KEY]: slug })

  return (
    <Col
      className={clsx(
        'my-1 items-stretch gap-2 pb-1 pt-px sm:gap-2',
        className
      )}
    >
      <Row className={'h-6 gap-3'}>
        <DropdownMenu
          items={generateFilterDropdownItems(
            contractType == 'BOUNTIED_QUESTION'
              ? BOUNTY_MARKET_SORTS
              : contractType == 'POLL'
              ? POLL_SORTS
              : includeProbSorts &&
                (contractType === 'ALL' || contractType === 'BINARY')
              ? PREDICTION_MARKET_PROB_SORTS
              : PREDICTION_MARKET_SORTS,
            selectSort
          )}
          icon={
            <Row className="text-ink-500 items-center gap-0.5">
              <span className="whitespace-nowrap text-sm font-medium">
                {sortLabel}
              </span>
              <ChevronDownIcon className="h-4 w-4" />
            </Row>
          }
          menuWidth={'w-36'}
          menuItemsClass="left-0 right-auto"
          selectedItemName={sortLabel}
          closeOnClick={true}
        />

        {!hideFilter && (
          <DropdownMenu
            items={generateFilterDropdownItems(FILTERS, selectFilter)}
            icon={
              <Row className="text-ink-500 items-center gap-0.5">
                <span className="whitespace-nowrap text-sm font-medium">
                  {filterLabel}
                </span>
                <ChevronDownIcon className="h-4 w-4" />
              </Row>
            }
            menuItemsClass="left-0 right-auto"
            menuWidth={'w-40'}
            selectedItemName={filterLabel}
            closeOnClick={true}
          />
        )}
        <DropdownMenu
          items={generateFilterDropdownItems(
            CONTRACT_TYPES,
            selectContractType
          )}
          icon={
            <Row className="text-ink-500 items-center gap-0.5">
              <span className="whitespace-nowrap text-sm font-medium">
                {contractTypeLabel}
              </span>
              <ChevronDownIcon className="h-4 w-4" />
            </Row>
          }
          menuWidth={'w-36'}
          menuItemsClass="left-0 right-auto"
          selectedItemName={contractTypeLabel}
          closeOnClick={true}
        />
        {topicSlug == topic?.slug && topic && showTopicTag && (
          <TopicTag
            className={
              'text-primary-500 overflow-x-hidden text-ellipsis !py-0 lg:hidden'
            }
            topic={topic}
            location={'questions page'}
          >
            <button onClick={() => setTopic('')}>
              <XIcon className="hover:text-ink-700 text-ink-400 ml-1  h-4 w-4" />
            </button>
          </TopicTag>
        )}
        {topicSlug === 'for-you' && showTopicTag && (
          <Row
            className={
              'text-primary-500 dark:text-ink-400 hover:text-ink-600 hover:bg-primary-400/10 group items-center justify-center whitespace-nowrap rounded px-1 text-right text-sm transition-colors lg:hidden'
            }
          >
            <span className="mr-px opacity-50 transition-colors group-hover:text-inherit">
              #
            </span>
            ⭐️ For you
            <button onClick={() => setTopic('')}>
              <XIcon className="hover:text-ink-700 text-ink-400 ml-1 h-4 w-4" />
            </button>
          </Row>
        )}
      </Row>
    </Col>
  )
}
