/* eslint-disable react-hooks/exhaustive-deps */
import algoliasearch from 'algoliasearch/lite'
import {
  Configure,
  InstantSearch,
  SearchBox,
  SortBy,
  useInfiniteHits,
  useSortBy,
} from 'react-instantsearch-hooks-web'

import { Contract } from 'common/contract'
import {
  Sort,
  useInitialQueryAndSort,
  useUpdateQueryAndSort,
} from '../hooks/use-sort-and-query-params'
import { ContractsGrid } from './contract/contracts-list'
import { Row } from './layout/row'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Spacer } from './layout/spacer'
import { ENV, IS_PRIVATE_MANIFOLD } from 'common/envs/constants'
import { trackCallback } from 'web/lib/service/analytics'
import ContractSearchFirestore from 'web/pages/contract-search-firestore'

const searchClient = algoliasearch(
  'GJQPAYENIF',
  '75c28fc084a80e1129d427d470cf41a3'
)

const indexPrefix = ENV === 'DEV' ? 'dev-' : ''

const sortIndexes = [
  { label: 'Newest', value: indexPrefix + 'contracts-newest' },
  { label: 'Oldest', value: indexPrefix + 'contracts-oldest' },
  { label: 'Most traded', value: indexPrefix + 'contracts-most-traded' },
  { label: '24h volume', value: indexPrefix + 'contracts-24-hour-vol' },
  { label: 'Last updated', value: indexPrefix + 'contracts-last-updated' },
  { label: 'Close date', value: indexPrefix + 'contracts-close-date' },
  { label: 'Resolve date', value: indexPrefix + 'contracts-resolve-date' },
]

type filter = 'open' | 'closed' | 'resolved' | 'all'

export function ContractSearch(props: {
  querySortOptions?: {
    defaultSort: Sort
    defaultFilter?: filter
    shouldLoadFromStorage?: boolean
  }
  additionalFilter?: {
    creatorId?: string
    tag?: string
    excludeContractIds?: string[]
  }
  onContractClick?: (contract: Contract) => void
  showPlaceHolder?: boolean
  hideOrderSelector?: boolean
  overrideGridClassName?: string
  hideQuickBet?: boolean
}) {
  const {
    querySortOptions,
    additionalFilter,
    onContractClick,
    overrideGridClassName,
    hideOrderSelector,
    showPlaceHolder,
    hideQuickBet,
  } = props

  const { initialSort } = useInitialQueryAndSort(querySortOptions)

  const sort = sortIndexes
    .map(({ value }) => value)
    .includes(`${indexPrefix}contracts-${initialSort ?? ''}`)
    ? initialSort
    : querySortOptions?.defaultSort ?? '24-hour-vol'

  const [filter, setFilter] = useState<filter>(
    querySortOptions?.defaultFilter ?? 'open'
  )

  const { filters, numericFilters } = useMemo(() => {
    let filters = [
      filter === 'open' ? 'isResolved:false' : '',
      filter === 'closed' ? 'isResolved:false' : '',
      filter === 'resolved' ? 'isResolved:true' : '',
      additionalFilter?.creatorId
        ? `creatorId:${additionalFilter.creatorId}`
        : '',
      additionalFilter?.tag ? `lowercaseTags:${additionalFilter.tag}` : '',
    ].filter((f) => f)
    // Hack to make Algolia work.
    filters = ['', ...filters]

    const numericFilters = [
      filter === 'open' ? `closeTime > ${Date.now()}` : '',
      filter === 'closed' ? `closeTime <= ${Date.now()}` : '',
    ].filter((f) => f)

    return { filters, numericFilters }
  }, [filter, Object.values(additionalFilter ?? {}).join(',')])

  const indexName = `${indexPrefix}contracts-${sort}`

  if (IS_PRIVATE_MANIFOLD || process.env.NEXT_PUBLIC_FIREBASE_EMULATE) {
    return (
      <ContractSearchFirestore
        querySortOptions={querySortOptions}
        additionalFilter={additionalFilter}
      />
    )
  }

  return (
    <InstantSearch searchClient={searchClient} indexName={indexName}>
      <Row className="gap-1 sm:gap-2">
        <SearchBox
          className="flex-1"
          placeholder={showPlaceHolder ? `Search ${filter} contracts` : ''}
          classNames={{
            form: 'before:top-6',
            input: '!pl-10 !input !input-bordered shadow-none w-[100px]',
            resetIcon: 'mt-2 hidden sm:flex',
          }}
        />
        <select
          className="!select !select-bordered"
          value={filter}
          onChange={(e) => setFilter(e.target.value as filter)}
          onBlur={trackCallback('select search filter')}
        >
          <option value="open">Open</option>
          <option value="closed">Closed</option>
          <option value="resolved">Resolved</option>
          <option value="all">All</option>
        </select>
        {!hideOrderSelector && (
          <SortBy
            items={sortIndexes}
            classNames={{
              select: '!select !select-bordered',
            }}
            onBlur={trackCallback('select search sort')}
          />
        )}
        <Configure
          facetFilters={filters}
          numericFilters={numericFilters}
          // Page resets on filters change.
          page={0}
        />
      </Row>

      <Spacer h={3} />

      <ContractSearchInner
        querySortOptions={querySortOptions}
        onContractClick={onContractClick}
        overrideGridClassName={overrideGridClassName}
        hideQuickBet={hideQuickBet}
        excludeContractIds={additionalFilter?.excludeContractIds}
      />
    </InstantSearch>
  )
}

export function ContractSearchInner(props: {
  querySortOptions?: {
    defaultSort: Sort
    shouldLoadFromStorage?: boolean
  }
  onContractClick?: (contract: Contract) => void
  overrideGridClassName?: string
  hideQuickBet?: boolean
  excludeContractIds?: string[]
}) {
  const {
    querySortOptions,
    onContractClick,
    overrideGridClassName,
    hideQuickBet,
    excludeContractIds,
  } = props
  const { initialQuery } = useInitialQueryAndSort(querySortOptions)

  const { query, setQuery, setSort } = useUpdateQueryAndSort({
    shouldLoadFromStorage: true,
  })

  useEffect(() => {
    setQuery(initialQuery)
  }, [initialQuery])

  const { currentRefinement: index } = useSortBy({
    items: [],
  })

  useEffect(() => {
    setQuery(query)
  }, [query])

  const isFirstRender = useRef(true)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }

    const sort = index.split('contracts-')[1] as Sort
    if (sort) {
      setSort(sort)
    }
  }, [index])

  const [isInitialLoad, setIsInitialLoad] = useState(true)
  useEffect(() => {
    const id = setTimeout(() => setIsInitialLoad(false), 1000)
    return () => clearTimeout(id)
  }, [])

  const { showMore, hits, isLastPage } = useInfiniteHits()
  let contracts = hits as any as Contract[]

  if (isInitialLoad && contracts.length === 0) return <></>

  const showTime = index.endsWith('close-date')
    ? 'close-date'
    : index.endsWith('resolve-date')
    ? 'resolve-date'
    : undefined

  if (excludeContractIds)
    contracts = contracts.filter((c) => !excludeContractIds.includes(c.id))

  return (
    <ContractsGrid
      contracts={contracts}
      loadMore={showMore}
      hasMore={!isLastPage}
      showTime={showTime}
      onContractClick={onContractClick}
      overrideGridClassName={overrideGridClassName}
      hideQuickBet={hideQuickBet}
    />
  )
}
