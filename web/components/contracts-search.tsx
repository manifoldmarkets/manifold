import { ChevronDownIcon, XIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import { isEqual, sample, uniqBy } from 'lodash'
import { ReactNode, useEffect, useRef, useState } from 'react'
import { Contract } from 'common/contract'
import { useEvent } from 'web/hooks/use-event'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { track, trackCallback } from 'web/lib/service/analytics'
import { searchContract } from 'web/lib/supabase/contracts'
import DropdownMenu from './comments/dropdown-menu'
import { ContractsList } from './contract/contracts-list'
import { Col } from './layout/col'
import { Row } from './layout/row'
import generateFilterDropdownItems, {
  getLabelFromValue,
} from './search/search-dropdown-helpers'
import { Input } from './widgets/input'
import {
  usePartialUpdater,
  usePersistentQueriesState,
} from 'web/hooks/use-persistent-query-state'
import {
  useGroupFromSlug,
  useRealtimeMemberGroups,
} from 'web/hooks/use-group-supabase'
import { DEFAULT_TOPIC, TOPIC_KEY } from 'common/group'
import { TopicTag } from 'web/components/topics/topic-tag'
import { AddContractToGroupButton } from 'web/components/topics/add-contract-to-group-modal'
import { useUser } from 'web/hooks/use-user'

import { TopicOptionsButton } from 'web/components/topics/topics-button'

import { ForYouDropdown } from 'web/components/topics/for-you-dropdown'

const CONTRACTS_PER_PAGE = 40

export const SORTS = [
  { label: 'Trending', value: 'score' },
  { label: 'Bounty amount', value: 'bounty-amount' },
  { label: 'New', value: 'newest' },
  { label: 'Closing soon', value: 'close-date' },
  { label: 'Daily change', value: 'daily-score' },
  { label: '24h volume', value: '24-hour-vol' },
  { label: 'Total traders', value: 'most-popular' },
  { label: 'High stakes', value: 'liquidity' },
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

export type Sort = typeof SORTS[number]['value']

export const FILTERS = [
  { label: 'Any status', value: 'all' },
  { label: 'Open', value: 'open' },
  { label: 'Closing this month', value: 'closing-this-month' },
  { label: 'Closing next month', value: 'closing-next-month' },
  { label: 'Closed', value: 'closed' },
  { label: 'Resolved', value: 'resolved' },
] as const

export type Filter = typeof FILTERS[number]['value']

export const CONTRACT_TYPES = [
  { label: 'Any type', value: 'ALL' },
  { label: 'Yes/No', value: 'BINARY' },
  { label: 'Multiple Choice', value: 'MULTIPLE_CHOICE' },
  { label: 'Free Response', value: 'FREE_RESPONSE' },
  { label: 'Numeric', value: 'PSEUDO_NUMERIC' },
  { label: 'Bounty', value: 'BOUNTIED_QUESTION' },
  { label: 'Stock', value: 'STONK' },
  { label: 'Poll', value: 'POLL' },
] as const

export type ContractTypeType = typeof CONTRACT_TYPES[number]['value']

export type SearchParams = {
  [QUERY_KEY]: string
  [SORT_KEY]: Sort
  [FILTER_KEY]: Filter
  [CONTRACT_TYPE_KEY]: ContractTypeType
  [TOPIC_KEY]: string
}

const QUERY_KEY = 'q'
export const SORT_KEY = 's'
const FILTER_KEY = 'f'
const CONTRACT_TYPE_KEY = 'ct'

export type SupabaseAdditionalFilter = {
  creatorId?: string
  tag?: string
  excludeContractIds?: string[]
  excludeGroupSlugs?: string[]
  excludeUserIds?: string[]
  nonQueryFacetFilters?: string[]
  contractType?: ContractTypeType
}

export type SearchState = {
  contracts: Contract[] | undefined
  fuzzyContractOffset: number
  shouldLoadMore: boolean
}

export function SupabaseContractSearch(props: {
  persistPrefix: string
  defaultSort?: Sort
  defaultFilter?: Filter
  additionalFilter?: SupabaseAdditionalFilter
  highlightContractIds?: string[]
  onContractClick?: (contract: Contract) => void
  hideOrderSelector?: boolean
  hideActions?: boolean
  headerClassName?: string
  isWholePage?: boolean
  menuButton?: ReactNode
  hideAvatar?: boolean
  rowBelowFilters?: ReactNode
  // used to determine if search params should be updated in the URL
  useUrlParams?: boolean
  includeProbSorts?: boolean
  autoFocus?: boolean
  emptyState?: ReactNode
  hideSearch?: boolean
  hideFilters?: boolean
}) {
  const {
    defaultSort,
    defaultFilter,
    additionalFilter,
    onContractClick,
    hideOrderSelector,
    hideActions,
    highlightContractIds,
    headerClassName,
    persistPrefix,
    includeProbSorts,
    isWholePage,
    useUrlParams,
    autoFocus,
    emptyState,
    hideFilters,
    menuButton,
    hideAvatar,
    rowBelowFilters,
  } = props

  const {
    contracts,
    loadMoreContracts,
    searchParams,
    setSearchParams,
    defaults,
  } = useContractSearch(
    persistPrefix,
    defaultSort,
    defaultFilter,
    additionalFilter,
    useUrlParams,
    isWholePage
  )
  const setQuery = (query: string) => setSearchParams({ q: query })
  const query = searchParams?.[QUERY_KEY] ?? ''

  return (
    <Col>
      <Col className={clsx('bg-canvas-50 sticky top-0 z-20 ', headerClassName)}>
        <Row>
          <Input
            type="text"
            inputMode="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onBlur={trackCallback('search', { query: query })}
            placeholder="Search questions"
            className="w-full"
            autoFocus={autoFocus}
            showClearButton={query !== ''}
          />
          {menuButton}
        </Row>
        {!hideFilters && (
          <ContractFilters
            hideOrderSelector={hideOrderSelector}
            includeProbSorts={includeProbSorts}
            params={searchParams ?? defaults}
            updateParams={setSearchParams}
          />
        )}
      </Col>
      {rowBelowFilters}
      {contracts && contracts.length === 0 ? (
        emptyState ??
        (searchParams?.[QUERY_KEY] ? (
          <NoResults />
        ) : (
          <Col className="text-ink-700 mx-2 my-6 text-center">
            No questions yet.
            {searchParams?.[TOPIC_KEY] && (
              <Row className={'mt-2 w-full items-center justify-center'}>
                <AddContractToGroupButton groupSlug={searchParams[TOPIC_KEY]} />
              </Row>
            )}
          </Col>
        ))
      ) : (
        <ContractsList
          contracts={contracts}
          loadMore={loadMoreContracts}
          onContractClick={onContractClick}
          highlightContractIds={highlightContractIds}
          headerClassName={clsx(headerClassName, '!top-14')}
          hideActions={hideActions}
          hideAvatar={hideAvatar}
        />
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

  return <div className="text-ink-700 mx-2 my-6 text-center">{message}</div>
}

const FRESH_SEARCH_CHANGED_STATE: SearchState = {
  contracts: undefined,
  fuzzyContractOffset: 0,
  shouldLoadMore: true,
}

const useContractSearch = (
  persistPrefix: string,
  defaultSort?: Sort,
  defaultFilter?: Filter,
  additionalFilter?: SupabaseAdditionalFilter,
  useUrlParams?: boolean,
  isWholePage?: boolean
) => {
  const [state, setState] = usePersistentInMemoryState<SearchState>(
    FRESH_SEARCH_CHANGED_STATE,
    `${persistPrefix}-supabase-contract-search`
  )

  const requestId = useRef(0)

  const [searchParams, setSearchParams, defaults] = useSearchQueryState({
    defaultSort,
    defaultFilter,
    useUrlParams,
  })
  const [lastSearch, setLastSearch] = usePersistentInMemoryState<
    typeof searchParams
  >(undefined, `${persistPrefix}-search-has-loaded`)

  const query = useEvent(
    async (currentState: SearchState, freshQuery?: boolean) => {
      if (!searchParams) return true
      const {
        q: query,
        s: sort,
        f: filter,
        topic: topicSlug,
        ct: contractType,
      } = searchParams
      setLastSearch(searchParams)

      const offset = freshQuery
        ? 0
        : currentState.contracts
        ? currentState.contracts.length
        : 0

      if (freshQuery || currentState.shouldLoadMore) {
        const id = ++requestId.current

        const results = await searchContract({
          state: currentState,
          query,
          filter,
          sort,
          contractType: additionalFilter?.contractType ?? contractType,
          offset: offset,
          limit: CONTRACTS_PER_PAGE,
          topicSlug: topicSlug !== '' ? topicSlug : undefined,
          creatorId: additionalFilter?.creatorId,
        })

        if (id === requestId.current) {
          const newContracts: Contract[] = results.data

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

  useEffect(() => {
    if (searchParams && !isEqual(searchParams, lastSearch)) {
      query(FRESH_SEARCH_CHANGED_STATE, true)
    }
  }, [JSON.stringify(searchParams)])

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
    loadMoreContracts,
    searchParams,
    setSearchParams,
    defaults,
  }
}

const useSearchQueryState = (props: {
  defaultSort?: Sort
  defaultFilter?: Filter
  defaultContractType?: ContractTypeType
  useUrlParams?: boolean
}) => {
  const {
    defaultSort = 'score',
    defaultFilter = 'open',
    defaultContractType = 'ALL',
    useUrlParams,
  } = props

  const defaults = {
    [QUERY_KEY]: '',
    [SORT_KEY]: defaultSort,
    [FILTER_KEY]: defaultFilter,
    [CONTRACT_TYPE_KEY]: defaultContractType,
    [TOPIC_KEY]: DEFAULT_TOPIC,
  }

  const useHook = useUrlParams ? usePersistentQueriesState : usePartialUpdater
  const [state, setState] = useHook(defaults)

  return [state, setState, defaults] as const
}

function ContractFilters(props: {
  className?: string
  hideOrderSelector?: boolean
  includeProbSorts?: boolean
  params: SearchParams
  updateParams: (params: Partial<SearchParams>) => void
}) {
  const {
    className,
    hideOrderSelector,
    includeProbSorts,
    params,
    updateParams,
  } = props

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
  const topic = useGroupFromSlug(topicSlug ?? '')
  const hideFilter =
    sort === 'resolve-date' ||
    sort === 'close-date' ||
    contractType === 'BOUNTIED_QUESTION'

  const filterLabel = getLabelFromValue(FILTERS, filter)
  const sortLabel = getLabelFromValue(SORTS, sort)
  const contractTypeLabel = getLabelFromValue(CONTRACT_TYPES, contractType)
  const user = useUser()
  const yourGroups = useRealtimeMemberGroups(user?.id)
  const yourGroupIds = yourGroups?.map((g) => g.id)
  const setTopic = (slug: string) => updateParams({ [TOPIC_KEY]: slug })

  return (
    <Col
      className={clsx(
        'mb-1 items-stretch gap-2 pb-1 pt-px sm:gap-2',
        className
      )}
    >
      <Row className={'h-6 gap-2'}>
        {!hideOrderSelector && (
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
              <Row className=" items-center gap-0.5 ">
                <span className="text-ink-500 whitespace-nowrap text-sm font-medium">
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
        {!hideFilter && (
          <DropdownMenu
            items={generateFilterDropdownItems(FILTERS, selectFilter)}
            icon={
              <Row className=" items-center gap-0.5 ">
                <span className="text-ink-500 whitespace-nowrap text-sm font-medium">
                  {filterLabel}
                </span>
                <ChevronDownIcon className="h-4 w-4 text-gray-500" />
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
            <Row className=" items-center gap-0.5 ">
              <span className="text-ink-500 whitespace-nowrap text-sm font-medium">
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
        {topicSlug == topic?.slug && topic && (
          <TopicTag
            className={
              'text-primary-500 overflow-x-hidden text-ellipsis !py-0 lg:hidden'
            }
            topic={topic}
            location={'questions page'}
          >
            <button onClick={() => setTopic('')}>
              <XIcon className="hover:text-ink-700 text-ink-400 ml-1 hidden h-4 w-4 sm:block" />
            </button>
            <TopicOptionsButton
              className={'sm:hidden'}
              group={topic}
              yourGroupIds={yourGroupIds}
              user={user}
            />
          </TopicTag>
        )}
        {topicSlug === 'for-you' && (
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
              <XIcon className="hover:text-ink-700 text-ink-400 ml-1 hidden h-4 w-4 sm:block" />
            </button>
            {user && (
              <ForYouDropdown
                setCurrentCategory={setTopic}
                user={user}
                yourGroups={yourGroups}
                className={'ml-1 sm:hidden'}
              />
            )}
          </Row>
        )}
      </Row>
    </Col>
  )
}
