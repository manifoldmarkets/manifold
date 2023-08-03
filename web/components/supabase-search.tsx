import {
  ChevronDownIcon,
  ViewGridIcon,
  ViewListIcon,
} from '@heroicons/react/outline'
import clsx from 'clsx'
import { Contract } from 'common/contract'
import { Group } from 'common/group'
import { SELECTABLE_TOPICS, cleanTopic } from 'common/topics'
import { debounce, isEqual, uniqBy } from 'lodash'
import { useRouter } from 'next/router'
import { createContext, useContext, useEffect, useRef } from 'react'
import { PillButton } from 'web/components/buttons/pill-button'
import { useEvent } from 'web/hooks/use-event'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import {
  inMemoryStore,
  urlParamStore,
  usePersistentState,
} from 'web/hooks/use-persistent-state'
import { useSafeLayoutEffect } from 'web/hooks/use-safe-layout-effect'
import { useIsAuthorized } from 'web/hooks/use-user'
import { track, trackCallback } from 'web/lib/service/analytics'
import { searchContract } from 'web/lib/supabase/contracts'
import { safeLocalStorage } from 'web/lib/util/local'
import DropdownMenu from './comments/dropdown-menu'
import { ShowTime } from './contract/contract-details'
import { ContractsGrid } from './contract/contracts-grid'
import { ContractsList } from './contract/contracts-list'
import { groupRoleType } from './groups/group-member-modal'
import { Col } from './layout/col'
import { Row } from './layout/row'
import generateFilterDropdownItems, {
  getLabelFromValue,
} from './search/search-dropdown-helpers'
import { Carousel } from './widgets/carousel'
import { Input } from './widgets/input'
import { CreateQuestionButton } from 'web/components/buttons/create-question-button'

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
  { label: 'Bounty amount', value: 'bounty-amount' },
] as const

const predictionMarketSorts = new Set([
  'daily-score',
  '24-hour-vol',
  'liquidity',
  'close-date',
  'resolve-date',
  'most-popular',
])

const bountySorts = new Set(['bounty-amount'])

export const BOUNTY_MARKET_SORTS = SORTS.filter(
  (item) => !predictionMarketSorts.has(item.value)
)

export const POLL_SORTS = BOUNTY_MARKET_SORTS.filter(
  (item) => item.value != 'bounty-amount'
)

export const PREDICTION_MARKET_SORTS = SORTS.filter(
  (item) => !bountySorts.has(item.value)
)

export type Sort = typeof SORTS[number]['value']
export const PROB_SORTS = ['prob-descending', 'prob-ascending']

export const FILTERS = [
  { label: 'Open', value: 'open' },
  { label: 'Closing this month', value: 'closing-this-month' },
  { label: 'Closing next month', value: 'closing-next-month' },
  { label: 'Closed', value: 'closed' },
  { label: 'Resolved', value: 'resolved' },
  { label: 'All', value: 'all' },
] as const

export type filter = typeof FILTERS[number]['value']

export const CONTRACT_TYPES = [
  { label: 'All questions', value: 'ALL' },
  { label: 'Yes/No', value: 'BINARY' },
  { label: 'Multiple Choice', value: 'MULTIPLE_CHOICE' },
  { label: 'Free Response', value: 'FREE_RESPONSE' },
  { label: 'Numeric', value: 'PSEUDO_NUMERIC' },
  { label: 'Bounty', value: 'BOUNTIED_QUESTION' },
  { label: 'Stock', value: 'STONK' },
  { label: 'Poll', value: 'POLL' },
] as const

export type ContractTypeType = typeof CONTRACT_TYPES[number]['value']

export type SupabaseSearchParameters = {
  query: string
  sort: Sort
  filter: filter
  contractType: ContractTypeType
  topic: string
}

const QUERY_KEY = 'q'
const SORT_KEY = 's'
const FILTER_KEY = 'f'
const CONTRACT_TYPE_KEY = 'ct'
const TOPIC_KEY = 't'

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
  contractType?: ContractTypeType
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
  listUIOptions?: {
    hideActions?: boolean
  }
  headerClassName?: string
  inputRowClassName?: string
  isWholePage?: boolean

  // used to determine if search params should be updated in the URL
  useUrlParams?: boolean
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
  hideSearch?: boolean
  hideFilters?: boolean
}) {
  const {
    defaultSort,
    defaultFilter,
    additionalFilter,
    onContractClick,
    hideOrderSelector,
    cardUIOptions,
    listUIOptions,
    highlightContractIds,
    headerClassName,
    inputRowClassName,
    persistPrefix,
    includeProbSorts,
    isWholePage,
    useUrlParams,
    autoFocus,
    profile,
    fromGroupProps,
    listViewDisabled,
    showTopics,
    hideFilters,
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
      const { query, sort, filter, topic, contractType } = searchParams.current
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
          contractType: additionalFilter?.contractType ?? contractType,
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
          inputRowClassName={inputRowClassName}
          defaultSort={defaultSort}
          defaultFilter={defaultFilter}
          persistPrefix={persistPrefix}
          hideOrderSelector={hideOrderSelector}
          isWholePage={isWholePage}
          useUrlParams={useUrlParams}
          includeProbSorts={includeProbSorts}
          onSearchParametersChanged={onSearchParametersChanged}
          autoFocus={autoFocus}
          listViewDisabled={listViewDisabled}
          showTopics={showTopics}
          hideFilters={hideFilters}
        />
        {contracts && contracts.length === 0 ? (
          <Col className={''}>
            <Row className="text-ink-500 mx-2 items-center gap-2">
              No questions found.
            </Row>
            {profile && (
              <Row className={' items-center justify-center'}>
                <Col className={'mt-8 w-full items-center justify-center'}>
                  <CreateQuestionButton className={'max-w-[15rem]'} />
                </Col>
              </Row>
            )}
          </Col>
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
            hideActions={listUIOptions?.hideActions}
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
  inputRowClassName?: string
  defaultSort?: Sort
  defaultFilter?: filter
  defaultContractType?: ContractTypeType
  persistPrefix?: string
  hideOrderSelector?: boolean
  includeProbSorts?: boolean
  onSearchParametersChanged: (params: SupabaseSearchParameters) => void
  isWholePage?: boolean
  useUrlParams?: boolean
  autoFocus?: boolean
  listViewDisabled?: boolean
  showTopics?: boolean
  hideFilters?: boolean
}) {
  const {
    className,
    defaultSort = 'score',
    defaultFilter = 'open',
    defaultContractType = 'ALL',
    persistPrefix,
    hideOrderSelector,
    onSearchParametersChanged,
    isWholePage,
    useUrlParams,
    autoFocus,
    includeProbSorts,
    showTopics,
    inputRowClassName,
    hideFilters,
  } = props

  const router = useRouter()

  const [query, setQuery] = usePersistentState(
    '',
    useUrlParams
      ? {
          key: QUERY_KEY,
          store: urlParamStore(router),
        }
      : undefined
  )

  const sortKey = `${persistPrefix}-search-sort`
  const savedSort = safeLocalStorage?.getItem(sortKey)

  const [sort, setSort] = usePersistentState(
    defaultSort,
    useUrlParams
      ? {
          key: SORT_KEY,
          store: urlParamStore(router),
        }
      : undefined
  )

  const [filterState, setFilter] = usePersistentState(
    defaultFilter,
    useUrlParams
      ? {
          key: FILTER_KEY,
          store: urlParamStore(router),
        }
      : undefined
  )

  const [contractType, setContractType] = usePersistentState(
    defaultContractType,
    useUrlParams
      ? {
          key: CONTRACT_TYPE_KEY,
          store: urlParamStore(router),
        }
      : undefined
  )

  const [topic, setTopic] = usePersistentState(
    '',
    useUrlParams
      ? {
          key: TOPIC_KEY,
          store: urlParamStore(router),
        }
      : undefined
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

  const selectFilter = (selection: filter) => {
    if (selection === filterState) return
    setFilter(selection)
    track('select search filter', { filter: selection })
  }

  const selectSort = (selection: Sort) => {
    if (selection === sort) return
    setSort(selection)
    track('select search sort', { sort: selection })
  }

  const selectContractType = (selection: ContractTypeType) => {
    if (selection === contractType) return
    if (selection === 'BOUNTIED_QUESTION' && predictionMarketSorts.has(sort)) {
      setSort('bounty-amount')
    }
    if (selection !== 'BOUNTIED_QUESTION' && bountySorts.has(sort)) {
      setSort('score')
    }
    setContractType(selection)
    track('select contract type', { contractType: selection })
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
        contractType: contractType as ContractTypeType,
      })
    }
  }, [query, sort, filter, topic, contractType, isAuth])

  return (
    <Col className={clsx('bg-canvas-50 sticky top-0 z-30 mb-2', className)}>
      <Col
        className={clsx(
          'mb-1 items-stretch gap-2 pb-1 pt-px sm:gap-2',
          inputRowClassName
        )}
      >
        <Input
          type="text"
          inputMode="search"
          value={query}
          onChange={(e) => updateQuery(e.target.value)}
          onBlur={trackCallback('search', { query: query })}
          placeholder="Search questions"
          className="w-full"
          autoFocus={autoFocus}
        />
        {!hideFilters && (
          <SearchFilters
            filter={filter}
            selectFilter={selectFilter}
            sort={sort}
            selectSort={selectSort}
            contractType={contractType}
            selectContractType={selectContractType}
            hideOrderSelector={hideOrderSelector}
            className={'flex flex-row gap-2'}
            includeProbSorts={includeProbSorts}
            listViewDisabled={true}
          />
        )}
      </Col>
      {showTopics && (
        <Carousel>
          {SELECTABLE_TOPICS.map((t) => (
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
  selectFilter: (selection: filter) => void
  sort: string
  selectSort: (selection: Sort) => void
  contractType: string
  selectContractType: (selection: ContractTypeType) => void
  hideOrderSelector: boolean | undefined
  className?: string
  includeProbSorts?: boolean
  listViewDisabled?: boolean
}) {
  const { asList, setAsList } = useContext(AsListContext)

  const {
    filter,
    selectFilter,
    sort,
    selectSort,
    contractType,
    selectContractType,
    hideOrderSelector,
    className,
    includeProbSorts,
    listViewDisabled,
  } = props

  const sorts = includeProbSorts
    ? SORTS
    : SORTS.filter((sort) => !PROB_SORTS.includes(sort.value))

  const hideFilter =
    sort === 'resolve-date' ||
    sort === 'close-date' ||
    contractType === 'BOUNTIED_QUESTION'

  const filterLabel = getLabelFromValue(FILTERS, filter)
  const sortLabel = getLabelFromValue(SORTS, sort)
  const contractTypeLabel = getLabelFromValue(CONTRACT_TYPES, contractType)

  return (
    <div className={clsx(className, 'gap-4')}>
      <DropdownMenu
        Items={generateFilterDropdownItems(CONTRACT_TYPES, selectContractType)}
        Icon={
          <Row className="items-center gap-0.5 ">
            <span className="whitespace-nowrap text-sm font-medium text-gray-500">
              {contractTypeLabel}
            </span>
            <ChevronDownIcon className="h-4 w-4 text-gray-500" />
          </Row>
        }
        menuWidth={'w-36'}
        menuItemsClass="left-0 right-auto"
        selectedItemName={contractTypeLabel}
        closeOnClick={true}
      />

      {!hideFilter && (
        <DropdownMenu
          Items={generateFilterDropdownItems(FILTERS, selectFilter)}
          Icon={
            <Row className="items-center gap-0.5">
              <span className="truncate whitespace-nowrap text-sm font-medium text-gray-500">
                {filterLabel}
              </span>
              <ChevronDownIcon className="h-4 w-4 text-gray-500" />
            </Row>
          }
          menuItemsClass="left-0 right-auto"
          selectedItemName={filterLabel}
          closeOnClick={true}
        />
      )}
      {!hideOrderSelector && (
        <DropdownMenu
          Items={generateFilterDropdownItems(
            contractType == 'BOUNTIED_QUESTION'
              ? BOUNTY_MARKET_SORTS
              : contractType == 'POLL'
              ? POLL_SORTS
              : PREDICTION_MARKET_SORTS,
            selectSort
          )}
          Icon={
            <Row className=" items-center gap-0.5 ">
              <span className="whitespace-nowrap text-sm font-medium text-gray-500">
                {sortLabel}
              </span>
              <ChevronDownIcon className="h-4 w-4 text-gray-500" />
            </Row>
          }
          menuWidth={'w-36'}
          menuItemsClass="left-0 right-auto"
          selectedItemName={sortLabel}
          closeOnClick={true}
        />
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
