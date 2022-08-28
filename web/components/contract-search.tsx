/* eslint-disable react-hooks/exhaustive-deps */
import algoliasearch from 'algoliasearch/lite'
import { SearchOptions } from '@algolia/client-search'

import { Contract } from 'common/contract'
import { User } from 'common/user'
import {
  SORTS,
  Sort,
  useQuery,
  useSort,
} from '../hooks/use-sort-and-query-params'
import {
  ContractHighlightOptions,
  ContractsGrid,
} from './contract/contracts-grid'
import { ShowTime } from './contract/contract-details'
import { Row } from './layout/row'
import { useEffect, useLayoutEffect, useRef, useMemo } from 'react'
import { unstable_batchedUpdates } from 'react-dom'
import { ENV, IS_PRIVATE_MANIFOLD } from 'common/envs/constants'
import { useFollows } from 'web/hooks/use-follows'
import {
  getKey,
  saveState,
  loadState,
  usePersistentState,
} from 'web/hooks/use-persistent-state'
import { safeLocalStorage, safeSessionStorage } from 'web/lib/util/local'
import { track, trackCallback } from 'web/lib/service/analytics'
import ContractSearchFirestore from 'web/pages/contract-search-firestore'
import { useMemberGroups } from 'web/hooks/use-group'
import { NEW_USER_GROUP_SLUGS } from 'common/group'
import { PillButton } from './buttons/pill-button'
import { debounce, isEqual, sortBy } from 'lodash'
import { DEFAULT_CATEGORY_GROUPS } from 'common/categories'
import { Col } from './layout/col'
import clsx from 'clsx'

const searchClient = algoliasearch(
  'GJQPAYENIF',
  '75c28fc084a80e1129d427d470cf41a3'
)

const indexPrefix = ENV === 'DEV' ? 'dev-' : ''
const searchIndexName = ENV === 'DEV' ? 'dev-contracts' : 'contractsIndex'

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
}

export function ContractSearch(props: {
  user?: User | null
  defaultSort?: Sort
  defaultFilter?: filter
  additionalFilter?: AdditionalFilter
  highlightOptions?: ContractHighlightOptions
  onContractClick?: (contract: Contract) => void
  hideOrderSelector?: boolean
  cardHideOptions?: {
    hideGroupLink?: boolean
    hideQuickBet?: boolean
  }
  headerClassName?: string
  persistPrefix?: string
  useQuerySortLocalStorage?: boolean
  useQuerySortUrlParams?: boolean
  isWholePage?: boolean
  maxItems?: number
  noControls?: boolean
}) {
  const {
    user,
    defaultSort,
    defaultFilter,
    additionalFilter,
    onContractClick,
    hideOrderSelector,
    cardHideOptions,
    highlightOptions,
    headerClassName,
    persistPrefix,
    useQuerySortUrlParams,
    isWholePage,
    maxItems,
    noControls,
  } = props

  const store = safeSessionStorage()
  const persistAs = (name: string) => {
    return persistPrefix ? { prefix: persistPrefix, name, store } : undefined
  }

  const [numPages, setNumPages] = usePersistentState(1, persistAs('numPages'))
  const [pages, setPages] = usePersistentState<Contract[][]>(
    [],
    persistAs('pages')
  )
  const [showTime, setShowTime] = usePersistentState<ShowTime | null>(
    null,
    persistAs('showTime')
  )

  const searchParameters = useRef<SearchParameters | null>(null)
  const requestId = useRef(0)

  useLayoutEffect(() => {
    if (persistPrefix && store) {
      const parameters = loadState(getKey(persistPrefix, 'parameters'), store)
      if (parameters !== undefined) {
        console.log('Restoring search parameters: ', parameters)
        searchParameters.current = parameters as SearchParameters
      }
    }
  }, [])

  const searchIndex = useMemo(
    () => searchClient.initIndex(searchIndexName),
    [searchIndexName]
  )

  const performQuery = async (freshQuery?: boolean) => {
    console.log('Performing query.')
    if (searchParameters.current == null) {
      return
    }
    const { query, sort, openClosedFilter, facetFilters } =
      searchParameters.current
    const id = ++requestId.current
    const requestedPage = freshQuery ? 0 : pages.length
    if (freshQuery || requestedPage < numPages) {
      const index = query
        ? searchIndex
        : searchClient.initIndex(`${indexPrefix}contracts-${sort}`)
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
      })
      // if there's a more recent request, forget about this one
      if (id === requestId.current) {
        const newPage = results.hits as any as Contract[]
        const showTime =
          sort === 'close-date' || sort === 'resolve-date' ? sort : null

        // this spooky looking function is the easiest way to get react to
        // batch this and not do multiple renders. we can throw it out in react 18.
        // see https://github.com/reactwg/react-18/discussions/21
        unstable_batchedUpdates(() => {
          setShowTime(showTime)
          setNumPages(results.nbPages)
          if (freshQuery) {
            setPages([newPage])
            if (isWholePage) window.scrollTo(0, 0)
          } else {
            setPages((pages) => [...pages, newPage])
          }
        })
      }
    }
  }

  const onSearchParametersChanged = useRef(
    debounce((params) => {
      if (!isEqual(searchParameters.current, params)) {
        console.log('Old vs new:', searchParameters.current, params)
        if (persistPrefix && store) {
          saveState(getKey(persistPrefix, 'parameters'), params, store)
        }
        searchParameters.current = params
        performQuery(true)
      }
    }, 100)
  ).current

  const contracts = pages
    .flat()
    .filter((c) => !additionalFilter?.excludeContractIds?.includes(c.id))
  const renderedContracts =
    pages.length === 0 ? undefined : contracts.slice(0, maxItems)

  if (IS_PRIVATE_MANIFOLD || process.env.NEXT_PUBLIC_FIREBASE_EMULATE) {
    return <ContractSearchFirestore additionalFilter={additionalFilter} />
  }

  return (
    <Col className="h-full">
      <ContractSearchControls
        className={headerClassName}
        defaultSort={defaultSort}
        defaultFilter={defaultFilter}
        additionalFilter={additionalFilter}
        hideOrderSelector={hideOrderSelector}
        persistPrefix={persistPrefix ? `${persistPrefix}-controls` : undefined}
        useQuerySortUrlParams={useQuerySortUrlParams}
        user={user}
        onSearchParametersChanged={onSearchParametersChanged}
        noControls={noControls}
      />
      <ContractsGrid
        contracts={renderedContracts}
        loadMore={noControls ? undefined : performQuery}
        showTime={showTime ?? undefined}
        onContractClick={onContractClick}
        highlightOptions={highlightOptions}
        cardHideOptions={cardHideOptions}
      />
    </Col>
  )
}

function ContractSearchControls(props: {
  className?: string
  defaultSort?: Sort
  defaultFilter?: filter
  additionalFilter?: AdditionalFilter
  hideOrderSelector?: boolean
  onSearchParametersChanged: (params: SearchParameters) => void
  persistPrefix?: string
  useQuerySortUrlParams?: boolean
  user?: User | null
  noControls?: boolean
}) {
  const {
    className,
    defaultSort,
    defaultFilter,
    additionalFilter,
    hideOrderSelector,
    onSearchParametersChanged,
    persistPrefix,
    useQuerySortUrlParams,
    user,
    noControls,
  } = props

  const localStore = safeLocalStorage()
  const sessionStore = safeSessionStorage()
  const persistAs = (name: string, store?: Storage) => {
    return persistPrefix ? { prefix: persistPrefix, name, store } : undefined
  }

  const initialSort = defaultSort ?? 'score'
  const [sort, setSort] = useSort(initialSort, {
    useUrl: !!useQuerySortUrlParams,
    persist: persistAs('sort', localStore),
  })
  const [query, setQuery] = useQuery('', {
    useUrl: !!useQuerySortUrlParams,
    persist: persistAs('query', sessionStore),
  })
  const [filter, setFilter] = usePersistentState<filter>(
    defaultFilter ?? 'open',
    persistAs('filter', sessionStore)
  )
  const [pillFilter, setPillFilter] = usePersistentState<string | null>(
    null,
    persistAs('pillFilter', sessionStore)
  )

  const follows = useFollows(user?.id)
  const memberGroups = (useMemberGroups(user?.id) ?? []).filter(
    (group) => !NEW_USER_GROUP_SLUGS.includes(group.slug)
  )
  const memberGroupSlugs =
    memberGroups.length > 0
      ? memberGroups.map((g) => g.slug)
      : DEFAULT_CATEGORY_GROUPS.map((g) => g.slug)

  const memberPillGroups = sortBy(
    memberGroups.filter((group) => group.contractIds.length > 0),
    (group) => group.contractIds.length
  ).reverse()

  const pillGroups: { name: string; slug: string }[] =
    memberPillGroups.length > 0 ? memberPillGroups : DEFAULT_CATEGORY_GROUPS

  const additionalFilters = [
    additionalFilter?.creatorId
      ? `creatorId:${additionalFilter.creatorId}`
      : '',
    additionalFilter?.tag ? `lowercaseTags:${additionalFilter.tag}` : '',
    additionalFilter?.groupSlug
      ? `groupLinks.slug:${additionalFilter.groupSlug}`
      : '',
  ]
  const facetFilters = query
    ? additionalFilters
    : [
        ...additionalFilters,
        additionalFilter ? '' : 'visibility:public',

        filter === 'open' ? 'isResolved:false' : '',
        filter === 'closed' ? 'isResolved:false' : '',
        filter === 'resolved' ? 'isResolved:true' : '',

        pillFilter && pillFilter !== 'personal' && pillFilter !== 'your-bets'
          ? `groupLinks.slug:${pillFilter}`
          : '',
        pillFilter === 'personal'
          ? // Show contracts in groups that the user is a member of
            memberGroupSlugs
              .map((slug) => `groupLinks.slug:${slug}`)
              // Show contracts created by users the user follows
              .concat(follows?.map((followId) => `creatorId:${followId}`) ?? [])
              // Show contracts bet on by users the user follows
              .concat(
                follows?.map((followId) => `uniqueBettorIds:${followId}`) ?? []
              )
          : '',
        // Subtract contracts you bet on from For you.
        pillFilter === 'personal' && user ? `uniqueBettorIds:-${user.id}` : '',
        pillFilter === 'your-bets' && user
          ? // Show contracts bet on by the user
            `uniqueBettorIds:${user.id}`
          : '',
      ].filter((f) => f)

  const openClosedFilter =
    filter === 'open' ? 'open' : filter === 'closed' ? 'closed' : undefined

  const selectPill = (pill: string | null) => () => {
    setPillFilter(pill)
    track('select search category', { category: pill ?? 'all' })
  }

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
      sort: sort,
      openClosedFilter: openClosedFilter,
      facetFilters: facetFilters,
    })
  }, [query, sort, openClosedFilter, JSON.stringify(facetFilters)])

  if (noControls) {
    return <></>
  }

  return (
    <Col
      className={clsx('bg-base-200 sticky top-0 z-20 gap-3 pb-3', className)}
    >
      <Row className="gap-1 sm:gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => updateQuery(e.target.value)}
          onBlur={trackCallback('search', { query })}
          placeholder={'Search'}
          className="input input-bordered w-full"
        />
        {!query && (
          <select
            className="select select-bordered"
            value={filter}
            onChange={(e) => selectFilter(e.target.value as filter)}
          >
            <option value="open">Open</option>
            <option value="closed">Closed</option>
            <option value="resolved">Resolved</option>
            <option value="all">All</option>
          </select>
        )}
        {!hideOrderSelector && !query && (
          <select
            className="select select-bordered"
            value={sort}
            onChange={(e) => selectSort(e.target.value as Sort)}
          >
            {SORTS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        )}
      </Row>

      {!additionalFilter && !query && (
        <Row className="scrollbar-hide items-start gap-2 overflow-x-auto">
          <PillButton
            key={'all'}
            selected={pillFilter === undefined}
            onSelect={selectPill(null)}
          >
            All
          </PillButton>
          <PillButton
            key={'personal'}
            selected={pillFilter === 'personal'}
            onSelect={selectPill('personal')}
          >
            {user ? 'For you' : 'Featured'}
          </PillButton>

          {user && (
            <PillButton
              key={'your-bets'}
              selected={pillFilter === 'your-bets'}
              onSelect={selectPill('your-bets')}
            >
              Your bets
            </PillButton>
          )}

          {pillGroups.map(({ name, slug }) => {
            return (
              <PillButton
                key={slug}
                selected={pillFilter === slug}
                onSelect={selectPill(slug)}
              >
                {name}
              </PillButton>
            )
          })}
        </Row>
      )}
    </Col>
  )
}
