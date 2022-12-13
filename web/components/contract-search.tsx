/* eslint-disable react-hooks/exhaustive-deps */
import { SearchOptions } from '@algolia/client-search'
import { useRouter } from 'next/router'
import { Contract } from 'common/contract'
import { ContractsGrid } from './contract/contracts-grid'
import { ShowTime } from './contract/contract-details'
import { Row } from './layout/row'
import { useEffect, useRef, useMemo, ReactNode, useState } from 'react'
import { IS_PRIVATE_MANIFOLD } from 'common/envs/constants'
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
import { AdjustmentsIcon } from '@heroicons/react/solid'
import { Button } from './buttons/button'
import { Modal } from './layout/modal'
import { Title } from './widgets/title'
import { Input } from './widgets/input'
import { Select } from './widgets/select'
import { SimpleLinkButton } from './buttons/simple-link-button'
import { useSafeLayoutEffect } from 'web/hooks/use-safe-layout-effect'

export const SORTS = [
  { label: 'Newest', value: 'newest' },
  { label: 'Trending', value: 'score' },
  { label: 'Daily changed', value: 'daily-score' },
  { label: '24h volume', value: '24-hour-vol' },
  { label: 'Most popular', value: 'most-popular' },
  { label: 'Liquidity', value: 'liquidity' },
  { label: 'Last updated', value: 'last-updated' },
  { label: 'Closing soon', value: 'close-date' },
  { label: 'Resolve date', value: 'resolve-date' },
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

type AdditionalFilter = {
  creatorId?: string
  tag?: string
  excludeContractIds?: string[]
  groupSlug?: string
  facetFilters?: string[]
  nonQueryFacetFilters?: string[]
}

export function ContractSearch(props: {
  defaultSort?: Sort
  defaultFilter?: filter
  additionalFilter?: AdditionalFilter
  highlightCards?: string[]
  onContractClick?: (contract: Contract) => void
  hideOrderSelector?: boolean
  cardUIOptions?: {
    hideGroupLink?: boolean
    hideQuickBet?: boolean
    noLinkAvatar?: boolean
  }
  headerClassName?: string
  persistPrefix?: string
  useQueryUrlParam?: boolean
  isWholePage?: boolean
  includeProbSorts?: boolean
  noControls?: boolean
  maxResults?: number
  renderContracts?: (
    contracts: Contract[] | undefined,
    loadMore: () => void
  ) => ReactNode
  autoFocus?: boolean
  profile?: boolean | undefined
}) {
  const {
    defaultSort,
    defaultFilter,
    additionalFilter,
    onContractClick,
    hideOrderSelector,
    cardUIOptions,
    highlightCards,
    headerClassName,
    persistPrefix,
    useQueryUrlParam,
    includeProbSorts,
    isWholePage,
    noControls,
    maxResults,
    renderContracts,
    autoFocus,
    profile,
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

  const performQuery = async (freshQuery?: boolean) => {
    if (searchParams.current == null) {
      return
    }
    const { query, sort, openClosedFilter, facetFilters } = searchParams.current
    const id = ++requestId.current
    const requestedPage = freshQuery ? 0 : state.pages.length
    if (freshQuery || requestedPage < state.numPages) {
      const index = query
        ? searchIndex
        : searchClient.initIndex(getIndexName(sort))
      const numericFilters = query
        ? []
        : [
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
  }

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
  const renderedContracts =
    state.pages.length === 0 ? undefined : contracts.slice(0, maxResults)

  if (IS_PRIVATE_MANIFOLD || process.env.NEXT_PUBLIC_FIREBASE_EMULATE) {
    return <ContractSearchFirestore additionalFilter={additionalFilter} />
  }

  return (
    <Col>
      <ContractSearchControls
        className={headerClassName}
        defaultSort={defaultSort}
        defaultFilter={defaultFilter}
        additionalFilter={additionalFilter}
        persistPrefix={persistPrefix}
        hideOrderSelector={hideOrderSelector}
        useQueryUrlParam={useQueryUrlParam}
        includeProbSorts={includeProbSorts}
        onSearchParametersChanged={onSearchParametersChanged}
        noControls={noControls}
        autoFocus={autoFocus}
        isWholePage={isWholePage}
      />
      {renderContracts ? (
        renderContracts(renderedContracts, performQuery)
      ) : renderedContracts && renderedContracts.length === 0 && profile ? (
        <p className="mx-2 text-gray-500">
          This creator does not yet have any markets.
        </p>
      ) : (
        <ContractsGrid
          contracts={renderedContracts}
          loadMore={noControls ? undefined : performQuery}
          showTime={state.showTime ?? undefined}
          onContractClick={onContractClick}
          highlightCards={highlightCards}
          cardUIOptions={cardUIOptions}
        />
      )}
    </Col>
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
  noControls?: boolean
  autoFocus?: boolean
  isWholePage?: boolean
}) {
  const {
    className,
    defaultSort,
    defaultFilter,
    additionalFilter,
    persistPrefix,
    hideOrderSelector,
    onSearchParametersChanged,
    useQueryUrlParam,
    noControls,
    autoFocus,
    includeProbSorts,
    isWholePage,
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
  const savedSort = safeLocalStorage()?.getItem(sortKey)

  const [sort, setSort] = usePersistentState(
    savedSort ?? defaultSort ?? 'score',
    !useQueryUrlParam
      ? undefined
      : {
          key: 's',
          store: urlParamStore(router),
        }
  )
  const [filter, setFilter] = usePersistentState(
    defaultFilter ?? 'open',
    !useQueryUrlParam
      ? undefined
      : {
          key: 'f',
          store: urlParamStore(router),
        }
  )

  useEffect(() => {
    if (persistPrefix && sort) {
      safeLocalStorage()?.setItem(sortKey, sort as string)
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
  const facetFilters = query
    ? additionalFilters
    : [
        ...additionalFilters,
        ...(additionalFilter?.nonQueryFacetFilters ?? []),
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
    if (newFilter === filter) return
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

  if (noControls) {
    return <></>
  }

  return (
    <Col className={clsx('top-0 z-20 mb-1 gap-3 bg-gray-50 pb-2', className)}>
      <Row className="mt-px items-center gap-1 sm:gap-2">
        <Input
          type="text"
          inputMode="search"
          value={query}
          onChange={(e) => updateQuery(e.target.value)}
          onBlur={trackCallback('search', { query: query })}
          placeholder="Search"
          className="w-full"
          autoFocus={autoFocus}
        />
        {query ? (
          isWholePage && (
            <SimpleLinkButton
              getUrl={() => window.location.href}
              tooltip="Copy link to search results"
            />
          )
        ) : (
          <ModalOnMobile>
            <SearchFilters
              filter={filter}
              selectFilter={selectFilter}
              hideOrderSelector={hideOrderSelector}
              selectSort={selectSort}
              sort={sort}
              className={'flex flex-row gap-2'}
              includeProbSorts={includeProbSorts}
            />
          </ModalOnMobile>
        )}
      </Row>
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
}) {
  const {
    filter,
    selectFilter,
    hideOrderSelector,
    selectSort,
    sort,
    className,
    includeProbSorts,
  } = props

  const sorts = includeProbSorts
    ? SORTS
    : SORTS.filter((sort) => !PROB_SORTS.includes(sort.value))

  return (
    <div className={className}>
      <Select
        value={filter}
        onChange={(e) => selectFilter(e.target.value as filter)}
      >
        <option value="open">Open</option>
        <option value="closed">Closed</option>
        <option value="resolved">Resolved</option>
        <option value="all">All</option>
      </Select>
      {!hideOrderSelector && (
        <Select
          value={sort}
          onChange={(e) => selectSort(e.target.value as Sort)}
        >
          {sorts.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      )}
    </div>
  )
}

export function ModalOnMobile(props: { children: ReactNode }) {
  const { children } = props
  const [openFilters, setOpenFilters] = useState(false)
  return (
    <>
      <div className="contents sm:hidden">
        <Button color="gray-white" onClick={() => setOpenFilters(true)}>
          <AdjustmentsIcon className="my-auto h-7" />
        </Button>
        <Modal
          open={openFilters}
          setOpen={setOpenFilters}
          position="top"
          className="rounded-lg bg-white px-4 pb-4"
        >
          <Col>
            <Title text="Filter Markets" />
            {children}
          </Col>
        </Modal>
      </div>
      <div className="hidden sm:contents">{children}</div>
    </>
  )
}
