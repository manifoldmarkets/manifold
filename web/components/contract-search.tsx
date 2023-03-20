import { SearchOptions } from '@algolia/client-search'
import { useRouter } from 'next/router'
import { Contract } from 'common/contract'
import { ContractsGrid } from './contract/contracts-grid'
import { ShowTime } from './contract/contract-details'
import { useEffect, useRef, useMemo, createContext, useContext } from 'react'
import { IS_PRIVATE_MANIFOLD } from 'common/envs/constants'
import { useEvent } from 'web/hooks/use-event'
import {
  historyStore,
  inMemoryStore,
  urlParamStore,
  usePersistentState,
} from 'web/hooks/use-persistent-state'
import { track, trackCallback } from 'web/lib/service/analytics'
import ContractSearchFirestore from 'web/pages/contract-search-firestore'
import { debounce, isEqual } from 'lodash'
import { Col } from './layout/col'
import clsx from 'clsx'
import { safeLocalStorage } from 'web/lib/util/local'
import {
  getIndexName,
  searchClient,
  searchIndexName,
} from 'web/lib/service/algolia'
import { Input } from './widgets/input'
import { Select } from './widgets/select'
import { useSafeLayoutEffect } from 'web/hooks/use-safe-layout-effect'
import { groupRoleType } from './groups/group-member-modal'
import { Group } from 'common/group'
import { ViewGridIcon, ViewListIcon } from '@heroicons/react/outline'
import { ContractsList } from './contract/contracts-list'
import { SiteLink } from './widgets/site-link'

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
  { label: 'Highest %', value: 'prob-descending' },
  { label: 'Lowest %', value: 'prob-ascending' },
] as const

export type Sort = typeof SORTS[number]['value']
export const PROB_SORTS = ['prob-descending', 'prob-ascending']

type filter = 'personal' | 'open' | 'closed' | 'resolved' | 'all'

type SearchParameters = {
  query: string
  sort: Sort
  openClosedFilter: 'open' | 'closed' | undefined
  facetFilters: SearchOptions['facetFilters']
}

export type AdditionalFilter = {
  creatorId?: string
  tag?: string
  excludeContractIds?: string[]
  groupSlug?: string
  facetFilters?: string[]
  nonQueryFacetFilters?: string[]
}
const AsListContext = createContext({
  asList: false,
  setAsList: (_asList: boolean) => {},
})

export function ContractSearch(props: {
  defaultSort?: Sort
  defaultFilter?: filter
  additionalFilter?: AdditionalFilter
  highlightContractIds?: string[]
  onContractClick?: (contract: Contract) => void
  hideOrderSelector?: boolean
  cardUIOptions?: {
    hideGroupLink?: boolean
    hideQuickBet?: boolean
    noLinkAvatar?: boolean
  }
  headerClassName?: string
  persistPrefix?: string
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
  } = props

  const [state, setState] = usePersistentState(
    {
      numPages: 1,
      pages: [] as Contract[][],
      showTime: null as ShowTime | null,
    },
    !persistPrefix
      ? undefined
      : { key: `${persistPrefix}-search`, store: inMemoryStore() }
  )

  const searchParams = useRef<SearchParameters | null>(null)
  const searchParamsStore = inMemoryStore<SearchParameters>()
  const requestId = useRef(0)
  const [asList, setAsList] = usePersistentState(!listViewDisabled, {
    key: 'contract-search-as-list',
    store: inMemoryStore(),
  })

  useSafeLayoutEffect(() => {
    if (persistPrefix) {
      const params = searchParamsStore.get(`${persistPrefix}-params`)
      if (params !== undefined) {
        searchParams.current = params
      }
    }
  }, [])

  const searchIndex = useMemo(
    () => searchClient.initIndex(searchIndexName),
    [searchIndexName]
  )

  const performQuery = useEvent(async (freshQuery?: boolean) => {
    if (searchParams.current == null) {
      return
    }
    const { query, sort, openClosedFilter, facetFilters } = searchParams.current
    const id = ++requestId.current
    const requestedPage = freshQuery ? 0 : state.pages.length
    if (freshQuery || requestedPage < state.numPages) {
      const index =
        sort === 'relevance'
          ? searchIndex
          : searchClient.initIndex(getIndexName(sort))
      const numericFilters = [
        openClosedFilter === 'open' ? `closeTime > ${Date.now()}` : '',
        openClosedFilter === 'closed' ? `closeTime <= ${Date.now()}` : '',
      ].filter((f) => f)
      const results = await index.search(query, {
        facetFilters,
        numericFilters,
        page: requestedPage,
        hitsPerPage: 20,
        advancedSyntax: true,
      })
      // if there's a more recent request, forget about this one
      if (id === requestId.current) {
        const newPage = results.hits as any as Contract[]
        const showTime =
          sort === 'close-date' || sort === 'resolve-date' ? sort : null
        const pages = freshQuery ? [newPage] : [...state.pages, newPage]
        setState({ numPages: results.nbPages, pages, showTime })
        if (freshQuery && isWholePage) window.scrollTo(0, 0)
      }
    }
  })

  // Always do first query when loading search page, unless going back in history.
  const [firstQuery, setFirstQuery] = usePersistentState(true, {
    key: `${persistPrefix}-first-query`,
    store: historyStore(),
  })

  const onSearchParametersChanged = useRef(
    debounce((params) => {
      if (!isEqual(searchParams.current, params) || firstQuery) {
        setFirstQuery(false)
        if (persistPrefix) {
          searchParamsStore.set(`${persistPrefix}-params`, params)
        }
        searchParams.current = params
        performQuery(true)
      }
    }, 100)
  ).current

  const contracts = state.pages
    .flat()
    .filter((c) => !additionalFilter?.excludeContractIds?.includes(c.id))
  const renderedContracts = state.pages.length === 0 ? undefined : contracts

  if (IS_PRIVATE_MANIFOLD || process.env.NEXT_PUBLIC_FIREBASE_EMULATE) {
    return <ContractSearchFirestore additionalFilter={additionalFilter} />
  }

  return (
    <AsListContext.Provider value={{ asList, setAsList }}>
      <Col>
        <ContractSearchControls
          className={headerClassName}
          defaultSort={defaultSort}
          defaultFilter={defaultFilter}
          additionalFilter={additionalFilter}
          persistPrefix={persistPrefix}
          hideOrderSelector={hideOrderSelector}
          useQueryUrlParam={isWholePage}
          includeProbSorts={includeProbSorts}
          onSearchParametersChanged={onSearchParametersChanged}
          autoFocus={autoFocus}
          listViewDisabled={listViewDisabled}
        />
        {renderedContracts && renderedContracts.length === 0 ? (
          profile ? (
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
            contracts={renderedContracts}
            loadMore={performQuery}
            onContractClick={onContractClick}
            highlightContractIds={highlightContractIds}
          />
        ) : (
          <ContractsGrid
            contracts={renderedContracts}
            showTime={state.showTime ?? undefined}
            onContractClick={onContractClick}
            highlightContractIds={highlightContractIds}
            cardUIOptions={cardUIOptions}
            loadMore={performQuery}
            fromGroupProps={fromGroupProps}
          />
        )}
      </Col>
    </AsListContext.Provider>
  )
}

function ContractSearchControls(props: {
  className?: string
  defaultSort?: Sort
  defaultFilter?: filter
  additionalFilter?: AdditionalFilter
  persistPrefix?: string
  hideOrderSelector?: boolean
  includeProbSorts?: boolean
  onSearchParametersChanged: (params: SearchParameters) => void
  useQueryUrlParam?: boolean
  autoFocus?: boolean
  listViewDisabled?: boolean
}) {
  const {
    className,
    defaultSort = 'relevance',
    defaultFilter = 'open',
    additionalFilter,
    persistPrefix,
    hideOrderSelector,
    onSearchParametersChanged,
    useQueryUrlParam,
    autoFocus,
    includeProbSorts,
    listViewDisabled,
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

  useEffect(() => {
    if (persistPrefix && sort) {
      safeLocalStorage?.setItem(sortKey, sort as string)
    }
  }, [persistPrefix, query, sort, sortKey])

  const additionalFilters = [
    additionalFilter?.creatorId
      ? `creatorId:${additionalFilter.creatorId}`
      : '',
    additionalFilter?.tag ? `lowercaseTags:${additionalFilter.tag}` : '',
    additionalFilter?.groupSlug
      ? `groupLinks.slug:${additionalFilter.groupSlug}`
      : '',
    ...(additionalFilter?.facetFilters ?? []),
  ]
  const facetFilters = [
    ...additionalFilters,
    ...(!query ? additionalFilter?.nonQueryFacetFilters ?? [] : []),
    additionalFilter?.creatorId || additionalFilter?.groupSlug
      ? ''
      : 'visibility:public',

    filter === 'open' ? 'isResolved:false' : '',
    filter === 'closed' ? 'isResolved:false' : '',
    filter === 'resolved' ? 'isResolved:true' : '',
  ].filter((f) => f)

  const openClosedFilter =
    filter === 'open' ? 'open' : filter === 'closed' ? 'closed' : undefined

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

  useEffect(() => {
    onSearchParametersChanged({
      query: query,
      sort: sort as Sort,
      openClosedFilter: openClosedFilter,
      facetFilters: facetFilters,
    })
  }, [query, sort, openClosedFilter, JSON.stringify(facetFilters)])

  return (
    <div
      className={clsx(
        'sticky top-0 z-30 mb-1 flex flex-col items-stretch gap-3 pb-2 pt-px sm:flex-row sm:gap-2',
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
        listViewDisabled={listViewDisabled}
      />
    </div>
  )
}

function SearchFilters(props: {
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
