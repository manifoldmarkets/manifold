import { ViewGridIcon, ViewListIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import { Contract } from 'common/contract'
import { Group } from 'common/group'
import { debounce, isEqual, uniqBy } from 'lodash'
import { useRouter } from 'next/router'
import { createContext, useContext, useEffect, useRef } from 'react'
import { useEvent } from 'web/hooks/use-event'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import {
  inMemoryStore,
  urlParamStore,
  usePersistentState,
} from 'web/hooks/use-persistent-state'
import { useSafeLayoutEffect } from 'web/hooks/use-safe-layout-effect'
import { track, trackCallback } from 'web/lib/service/analytics'
import { searchContract } from 'web/lib/supabase/contracts'
import { safeLocalStorage } from 'web/lib/util/local'
import { ShowTime } from './contract/contract-details'
import { ContractsGrid } from './contract/contracts-grid'
import { ContractsList } from './contract/contracts-list'
import { groupRoleType } from './groups/group-member-modal'
import { Col } from './layout/col'
import { Input } from './widgets/input'
import { Select } from './widgets/select'
import { SiteLink } from './widgets/site-link'
import { useIsAuthorized } from 'web/hooks/use-user'
import { ALL_TOPICS_WITH_EMOJIS, cleanTopic } from 'common/topics'
import { PillButton } from 'web/components/buttons/pill-button'
import { Carousel } from './widgets/carousel'

const CONTRACTS_PER_PAGE = 20

export const SORTS = [
  { label: 'Relevance', value: 'relevance' },
  { label: 'New', value: 'newest' },
  { label: 'Trending', value: 'score' },
  { label: 'Daily change', value: 'daily-score' },
  { label: '24h volume', value: '24-hour-vol' },
  { label: 'Total traders', value: 'most-popular' },
  { label: 'High stakes', value: 'liquidity' },
  { label: 'Last activity', value: 'last-updated' },
  { label: 'Closing soon', value: 'close-date' },
  { label: 'Just resolved', value: 'resolve-date' },
  { label: '🎲 rAnDoM', value: 'random' },
] as const

export type Sort = typeof SORTS[number]['value']
export const PROB_SORTS = ['prob-descending', 'prob-ascending']

export type filter = 'open' | 'closed' | 'resolved' | 'all'

export type SupabaseSearchParameters = {
  query: string
  sort: Sort
  filter: filter
  topic: string
}

function getShowTime(sort: Sort) {
  return sort === 'close-date' || sort === 'resolve-date' ? sort : null
}

export const INITIAL_STATE: stateType = {
  contracts: undefined,
  fuzzyContractOffset: 0,
  shouldLoadMore: true,
  showTime: null as ShowTime | null,
}

export type SupabaseAdditionalFilter = {
  creatorId?: string
  groupId?: string
  tag?: string
  groupSlug?: string
  excludeContractIds?: string[]
  excludeGroupSlugs?: string[]
  excludeUserIds?: string[]
  nonQueryFacetFilters?: string[]
}

const AsListContext = createContext({
  asList: false,
  setAsList: (_asList: boolean) => {},
})

export type stateType = {
  contracts: Contract[] | undefined
  fuzzyContractOffset: number
  shouldLoadMore: boolean
  showTime: ShowTime | null
}

export function SupabaseContractSearch(props: {
  persistPrefix: string
  defaultSort?: Sort
  defaultFilter?: filter
  additionalFilter?: SupabaseAdditionalFilter
  highlightContractIds?: string[]
  onContractClick?: (contract: Contract) => void
  hideOrderSelector?: boolean
  cardUIOptions?: {
    hideGroupLink?: boolean
    hideQuickBet?: boolean
    noLinkAvatar?: boolean
  }
  headerClassName?: string
  isWholePage?: boolean
  includeProbSorts?: boolean
  autoFocus?: boolean
  profile?: boolean | undefined
  fromGroupProps?: {
    group: Group
    userRole: groupRoleType | null
  }
  listViewDisabled?: boolean
  contractSearchControlsClassName?: string
  showTopics?: boolean
}) {
  const {
    defaultSort,
    defaultFilter,
    additionalFilter,
    onContractClick,
    hideOrderSelector,
    cardUIOptions,
    highlightContractIds,
    headerClassName,
    persistPrefix,
    includeProbSorts,
    isWholePage,
    autoFocus,
    profile,
    fromGroupProps,
    listViewDisabled,
    showTopics,
  } = props

  const [state, setState] = usePersistentInMemoryState<stateType>(
    INITIAL_STATE,
    `${persistPrefix}-supabase-search`
  )

  const searchParams = useRef<SupabaseSearchParameters | null>(null)
  const searchParamsStore = inMemoryStore<SupabaseSearchParameters>()
  const requestId = useRef(0)
  const [asList, setAsList] = usePersistentInMemoryState(
    !listViewDisabled,
    'contract-search-as-list'
  )

  useSafeLayoutEffect(() => {
    const params = searchParamsStore.get(`${persistPrefix}-params`)
    if (params !== undefined) {
      searchParams.current = params
    }
  }, [])

  const query = useEvent(
    async (currentState: stateType, freshQuery?: boolean) => {
      if (searchParams.current == null) {
        return false
      }
      const { query, sort, filter, topic } = searchParams.current
      const id = ++requestId.current
      const offset = freshQuery
        ? 0
        : currentState.contracts
        ? currentState.contracts.length
        : 0
      if (freshQuery || currentState.shouldLoadMore) {
        const results = await searchContract({
          state: currentState,
          query,
          filter,
          sort,
          topic,
          offset: offset,
          limit: CONTRACTS_PER_PAGE,
          group_id: additionalFilter?.groupId,
          creator_id: additionalFilter?.creatorId,
        })

        if (id === requestId.current) {
          const newContracts: Contract[] = results.data
          const showTime = getShowTime(sort)

          const freshContracts = freshQuery
            ? newContracts
            : [
                ...(currentState.contracts ? currentState.contracts : []),
                ...newContracts,
              ]

          // TODO: When `deleted` is a native supabase column, filter
          // out deleted contracts in backend.
          const freshContractsWithoutDeleted = freshContracts.filter(
            (contract) => !contract.deleted
          )

          const newFuzzyContractOffset =
            results.fuzzyOffset + currentState.fuzzyContractOffset

          const shouldLoadMore = newContracts.length === CONTRACTS_PER_PAGE

          setState({
            fuzzyContractOffset: newFuzzyContractOffset,
            contracts: freshContractsWithoutDeleted,
            showTime: showTime,
            shouldLoadMore,
          })
          if (freshQuery && isWholePage) window.scrollTo(0, 0)

          return shouldLoadMore
        }
      }
      return false
    }
  )

  const loadMoreContracts = () => query(state)

  // Counts as loaded if you are on the page and a query finished or if you go back in history.
  const [hasLoadedQuery, setHasLoadedQuery] = usePersistentInMemoryState(
    false,
    `${persistPrefix}-search-has-loaded`
  )

  const onSearchParametersChanged = useRef(
    debounce((params) => {
      if (!isEqual(searchParams.current, params) || !hasLoadedQuery) {
        setHasLoadedQuery(true)
        if (persistPrefix) {
          searchParamsStore.set(`${persistPrefix}-params`, params)
        }
        searchParams.current = params
        setState({
          ...INITIAL_STATE,
          showTime: getShowTime(params.sort),
        })
        query(state, true)
      }
    }, 100)
  ).current

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

  return (
    <AsListContext.Provider value={{ asList, setAsList }}>
      <Col>
        <SupabaseContractSearchControls
          className={headerClassName}
          defaultSort={defaultSort}
          defaultFilter={defaultFilter}
          persistPrefix={persistPrefix}
          hideOrderSelector={hideOrderSelector}
          useQueryUrlParam={isWholePage}
          includeProbSorts={includeProbSorts}
          onSearchParametersChanged={onSearchParametersChanged}
          autoFocus={autoFocus}
          listViewDisabled={listViewDisabled}
          showTopics={showTopics}
        />
        {contracts && contracts.length === 0 ? (
          profile || fromGroupProps ? (
            <p className="text-ink-500 mx-2">No markets found</p>
          ) : (
            <p className="text-ink-500 mx-2">
              No markets found. Why not{' '}
              <SiteLink href="/create" className="text-ink-700 font-bold">
                create one?
              </SiteLink>
            </p>
          )
        ) : asList ? (
          <ContractsList
            key={
              searchParams.current?.query ??
              '' + searchParams.current?.filter ??
              '' + searchParams.current?.sort ??
              ''
            }
            contracts={contracts}
            loadMore={loadMoreContracts}
            onContractClick={onContractClick}
            highlightContractIds={highlightContractIds}
            headerClassName={clsx(headerClassName, '!top-14')}
          />
        ) : (
          <ContractsGrid
            key={
              searchParams.current?.query ??
              '' + searchParams.current?.filter ??
              '' + searchParams.current?.sort ??
              ''
            }
            contracts={contracts}
            showTime={state.showTime ?? undefined}
            onContractClick={onContractClick}
            highlightContractIds={highlightContractIds}
            cardUIOptions={cardUIOptions}
            loadMore={loadMoreContracts}
            fromGroupProps={fromGroupProps}
          />
        )}
      </Col>
    </AsListContext.Provider>
  )
}

function SupabaseContractSearchControls(props: {
  className?: string
  defaultSort?: Sort
  defaultFilter?: filter
  persistPrefix?: string
  hideOrderSelector?: boolean
  includeProbSorts?: boolean
  onSearchParametersChanged: (params: SupabaseSearchParameters) => void
  useQueryUrlParam?: boolean
  autoFocus?: boolean
  listViewDisabled?: boolean
  showTopics?: boolean
}) {
  const {
    className,
    defaultSort = 'score',
    defaultFilter = 'open',
    persistPrefix,
    hideOrderSelector,
    onSearchParametersChanged,
    useQueryUrlParam,
    autoFocus,
    includeProbSorts,
    showTopics,
  } = props

  const router = useRouter()
  const [query, setQuery] = usePersistentState(
    '',
    !useQueryUrlParam
      ? undefined
      : {
          key: 'q',
          store: urlParamStore(router),
        }
  )

  const sortKey = `${persistPrefix}-search-sort`
  const savedSort = safeLocalStorage?.getItem(sortKey)

  const [sort, setSort] = usePersistentState(
    savedSort ?? defaultSort,
    !useQueryUrlParam
      ? undefined
      : {
          key: 's',
          store: urlParamStore(router),
        }
  )
  const [topic, setTopic] = usePersistentState(
    '',
    !useQueryUrlParam
      ? undefined
      : {
          key: 't',
          store: urlParamStore(router),
        }
  )
  const [filterState, setFilter] = usePersistentState(
    defaultFilter,
    !useQueryUrlParam
      ? undefined
      : {
          key: 'f',
          store: urlParamStore(router),
        }
  )

  const filter =
    sort === 'close-date'
      ? 'open'
      : sort === 'resolve-date'
      ? 'resolved'
      : filterState

  const updateQuery = (newQuery: string) => {
    setQuery(newQuery)
  }

  const selectFilter = (newFilter: filter) => {
    if (newFilter === filterState) return
    setFilter(newFilter)
    track('select search filter', { filter: newFilter })
  }

  const selectSort = (newSort: Sort) => {
    if (newSort === sort) return
    setSort(newSort)
    track('select search sort', { sort: newSort })
  }
  const selectTopic = (newTopic: string) => {
    if (newTopic === topic) return setTopic('')
    setTopic(newTopic)
    track('select search topic', { topic: newTopic })
  }

  const isAuth = useIsAuthorized()

  useEffect(() => {
    if (isAuth !== undefined) {
      onSearchParametersChanged({
        query: query,
        sort: sort as Sort,
        topic: topic,
        filter: filter as filter,
      })
    }
  }, [query, sort, filter, topic, isAuth])

  return (
    <Col>
      <Col
        className={clsx(
          'bg-canvas-50 sticky top-0 z-30 mb-1 items-stretch gap-3 pb-2 pt-px sm:flex-row sm:gap-2',
          className
        )}
      >
        <Input
          type="text"
          inputMode="search"
          value={query}
          onChange={(e) => updateQuery(e.target.value)}
          onBlur={trackCallback('search', { query: query })}
          placeholder="Search markets"
          className="w-full"
          autoFocus={autoFocus}
        />
        <SearchFilters
          filter={filter}
          selectFilter={selectFilter}
          hideOrderSelector={hideOrderSelector}
          selectSort={selectSort}
          sort={sort}
          className={'flex flex-row gap-2'}
          includeProbSorts={includeProbSorts}
          listViewDisabled={true}
        />
        {/* {showTopics && (
          <div className={'hidden sm:inline'}>
            <TopicSelector topic={topic} onSetTopic={setTopic} />
          </div>
        )} */}
      </Col>
      {showTopics && (
        <Carousel>
          {ALL_TOPICS_WITH_EMOJIS.map((t) => (
            <PillButton
              key={'pill-' + t}
              selected={topic === cleanTopic(t)}
              onSelect={() => selectTopic(cleanTopic(t))}
            >
              {t}
            </PillButton>
          ))}
        </Carousel>
      )}
    </Col>
  )
}

export function SearchFilters(props: {
  filter: string
  selectFilter: (newFilter: filter) => void
  hideOrderSelector: boolean | undefined
  selectSort: (newSort: Sort) => void
  sort: string
  className?: string
  includeProbSorts?: boolean
  listViewDisabled?: boolean
}) {
  const { asList, setAsList } = useContext(AsListContext)

  const {
    filter,
    selectFilter,
    hideOrderSelector,
    selectSort,
    sort,
    className,
    includeProbSorts,
    listViewDisabled,
  } = props

  const sorts = includeProbSorts
    ? SORTS
    : SORTS.filter((sort) => !PROB_SORTS.includes(sort.value))

  const hideFilter = sort === 'resolve-date' || sort === 'close-date'

  return (
    <div className={className}>
      {!hideFilter && (
        <Select
          value={filter}
          onChange={(e) => selectFilter(e.target.value as filter)}
          className="!h-full grow py-1"
        >
          <option value="open">Open</option>
          <option value="closed">Closed</option>
          <option value="resolved">Resolved</option>
          <option value="all">All</option>
        </Select>
      )}
      {!hideOrderSelector && (
        <Select
          value={sort}
          onChange={(e) => selectSort(e.target.value as Sort)}
          className="!h-full grow py-1"
        >
          {sorts.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      )}
      {!listViewDisabled && (
        <button
          type="button"
          onClick={() => setAsList(!asList)}
          className="hover:bg-canvas-50 border-ink-300 text-ink-500 bg-canvas-0 focus:border-primary-500 focus:ring-primary-500 relative inline-flex h-full items-center rounded-md border px-2 py-1 text-sm font-medium shadow-sm focus:z-10 focus:outline-none focus:ring-1 sm:py-2"
        >
          {asList ? (
            <ViewGridIcon className="h-5 w-5" aria-hidden="true" />
          ) : (
            <ViewListIcon className="h-5 w-5" aria-hidden="true" />
          )}
        </button>
      )}
    </div>
  )
}
