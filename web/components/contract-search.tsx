/* eslint-disable react-hooks/exhaustive-deps */
import algoliasearch, { SearchIndex } from 'algoliasearch/lite'
import { SearchOptions } from '@algolia/client-search'

import { Contract } from 'common/contract'
import { User } from 'common/user'
import { Sort, useQuery, useSort } from '../hooks/use-sort-and-query-params'
import {
  ContractHighlightOptions,
  ContractsGrid,
} from './contract/contracts-grid'
import { ShowTime } from './contract/contract-details'
import { Row } from './layout/row'
import { useEffect, useRef, useMemo, useState } from 'react'
import { unstable_batchedUpdates } from 'react-dom'
import { ENV, IS_PRIVATE_MANIFOLD } from 'common/envs/constants'
import { useFollows } from 'web/hooks/use-follows'
import { track, trackCallback } from 'web/lib/service/analytics'
import ContractSearchFirestore from 'web/pages/contract-search-firestore'
import { useMemberGroups } from 'web/hooks/use-group'
import { NEW_USER_GROUP_SLUGS } from 'common/group'
import { PillButton } from './buttons/pill-button'
import { debounce, sortBy } from 'lodash'
import { DEFAULT_CATEGORY_GROUPS } from 'common/categories'
import { Col } from './layout/col'
import { safeLocalStorage } from 'web/lib/util/local'
import clsx from 'clsx'

// TODO: this obviously doesn't work with SSR, common sense would suggest
// that we should save things like this in cookies so the server has them

const MARKETS_SORT = 'markets_sort'

function setSavedSort(s: Sort) {
  safeLocalStorage()?.setItem(MARKETS_SORT, s)
}

function getSavedSort() {
  return safeLocalStorage()?.getItem(MARKETS_SORT) as Sort | null | undefined
}

const searchClient = algoliasearch(
  'GJQPAYENIF',
  '75c28fc084a80e1129d427d470cf41a3'
)

const indexPrefix = ENV === 'DEV' ? 'dev-' : ''
const searchIndexName = ENV === 'DEV' ? 'dev-contracts' : 'contractsIndex'

const sortOptions = [
  { label: 'Newest', value: 'newest' },
  { label: 'Trending', value: 'score' },
  { label: 'Most traded', value: 'most-traded' },
  { label: '24h volume', value: '24-hour-vol' },
  { label: 'Last updated', value: 'last-updated' },
  { label: 'Subsidy', value: 'liquidity' },
  { label: 'Close date', value: 'close-date' },
  { label: 'Resolve date', value: 'resolve-date' },
]

type filter = 'personal' | 'open' | 'closed' | 'resolved' | 'all'

type SearchParameters = {
  index: SearchIndex
  query: string
  numericFilters: SearchOptions['numericFilters']
  facetFilters: SearchOptions['facetFilters']
  showTime?: ShowTime
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
  overrideGridClassName?: string
  cardHideOptions?: {
    hideGroupLink?: boolean
    hideQuickBet?: boolean
  }
  headerClassName?: string
  useQuerySortLocalStorage?: boolean
  useQuerySortUrlParams?: boolean
}) {
  const {
    user,
    defaultSort,
    defaultFilter,
    additionalFilter,
    onContractClick,
    overrideGridClassName,
    hideOrderSelector,
    cardHideOptions,
    highlightOptions,
    headerClassName,
    useQuerySortLocalStorage,
    useQuerySortUrlParams,
  } = props

  const [numPages, setNumPages] = useState(1)
  const [pages, setPages] = useState<Contract[][]>([])
  const [showTime, setShowTime] = useState<ShowTime | undefined>()

  const searchParameters = useRef<SearchParameters | undefined>()
  const requestId = useRef(0)

  const performQuery = async (freshQuery?: boolean) => {
    if (searchParameters.current === undefined) {
      return
    }
    const params = searchParameters.current
    const id = ++requestId.current
    const requestedPage = freshQuery ? 0 : pages.length
    if (freshQuery || requestedPage < numPages) {
      const results = await params.index.search(params.query, {
        facetFilters: params.facetFilters,
        numericFilters: params.numericFilters,
        page: requestedPage,
        hitsPerPage: 20,
      })
      // if there's a more recent request, forget about this one
      if (id === requestId.current) {
        const newPage = results.hits as any as Contract[]
        // this spooky looking function is the easiest way to get react to
        // batch this and not do multiple renders. we can throw it out in react 18.
        // see https://github.com/reactwg/react-18/discussions/21
        unstable_batchedUpdates(() => {
          setShowTime(params.showTime)
          setNumPages(results.nbPages)
          if (freshQuery) {
            setPages([newPage])
          } else {
            setPages((pages) => [...pages, newPage])
          }
        })
      }
    }
  }

  const onSearchParametersChanged = useRef(
    debounce((params) => {
      searchParameters.current = params
      performQuery(true)
    }, 100)
  )
  const contracts = pages
    .flat()
    .filter((c) => !additionalFilter?.excludeContractIds?.includes(c.id))

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
        useQuerySortLocalStorage={useQuerySortLocalStorage}
        useQuerySortUrlParams={useQuerySortUrlParams}
        user={user}
        onSearchParametersChanged={onSearchParametersChanged.current}
      />
      <ContractsGrid
        contracts={pages.length === 0 ? undefined : contracts}
        loadMore={performQuery}
        showTime={showTime}
        onContractClick={onContractClick}
        overrideGridClassName={overrideGridClassName}
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
  useQuerySortLocalStorage?: boolean
  useQuerySortUrlParams?: boolean
  user?: User | null
}) {
  const {
    className,
    defaultSort,
    defaultFilter,
    additionalFilter,
    hideOrderSelector,
    onSearchParametersChanged,
    useQuerySortLocalStorage,
    useQuerySortUrlParams,
    user,
  } = props

  const savedSort = useQuerySortLocalStorage ? getSavedSort() : null
  const initialSort = savedSort ?? defaultSort ?? 'score'
  const [sort, setSort] = useSort(initialSort, !!useQuerySortUrlParams)
  const [query, setQuery] = useQuery('', !!useQuerySortUrlParams)
  const [filter, setFilter] = useState<filter>(defaultFilter ?? 'open')
  const [pillFilter, setPillFilter] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (useQuerySortLocalStorage) {
      setSavedSort(sort)
    }
  }, [sort])

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

  const numericFilters = query
    ? []
    : [
        filter === 'open' ? `closeTime > ${Date.now()}` : '',
        filter === 'closed' ? `closeTime <= ${Date.now()}` : '',
      ].filter((f) => f)

  const selectPill = (pill: string | undefined) => () => {
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

  const indexName = `${indexPrefix}contracts-${sort}`
  const index = useMemo(() => searchClient.initIndex(indexName), [indexName])
  const searchIndex = useMemo(
    () => searchClient.initIndex(searchIndexName),
    [searchIndexName]
  )

  useEffect(() => {
    onSearchParametersChanged({
      index: query ? searchIndex : index,
      query: query,
      numericFilters: numericFilters,
      facetFilters: facetFilters,
      showTime:
        sort === 'close-date' || sort === 'resolve-date' ? sort : undefined,
    })
  }, [query, index, searchIndex, filter, JSON.stringify(facetFilters)])

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
            {sortOptions.map((option) => (
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
            onSelect={selectPill(undefined)}
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
