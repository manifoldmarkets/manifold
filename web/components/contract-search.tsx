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

import { Contract } from '../../common/contract'
import {
  Sort,
  useInitialQueryAndSort,
  useUpdateQueryAndSort,
} from '../hooks/use-sort-and-query-params'
import { ContractsGrid } from './contract/contracts-list'
import { Row } from './layout/row'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Spacer } from './layout/spacer'
import { ENV } from 'common/envs/constants'
import { useUser } from 'web/hooks/use-user'
import { useFollows } from 'web/hooks/use-follows'
import { ChoicesToggleGroup } from './choices-toggle-group'
import { EditCategoriesButton } from './feed/category-selector'
import { Col } from './layout/col'
import { CATEGORIES } from 'common/categories'

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
  }
  showCategorySelector: boolean
  onContractClick?: (contract: Contract) => void
}) {
  const {
    querySortOptions,
    additionalFilter,
    showCategorySelector,
    onContractClick,
  } = props

  const user = useUser()
  const followedCategories = user?.followedCategories
  const follows = useFollows(user?.id)

  const { initialSort } = useInitialQueryAndSort(querySortOptions)

  const sort = sortIndexes
    .map(({ value }) => value)
    .includes(`${indexPrefix}contracts-${initialSort ?? ''}`)
    ? initialSort
    : querySortOptions?.defaultSort ?? '24-hour-vol'

  const [filter, setFilter] = useState<filter>(
    querySortOptions?.defaultFilter ?? 'open'
  )

  const [mode, setMode] = useState<'categories' | 'following'>('categories')

  const { filters, numericFilters } = useMemo(() => {
    let filters = [
      filter === 'open' ? 'isResolved:false' : '',
      filter === 'closed' ? 'isResolved:false' : '',
      filter === 'resolved' ? 'isResolved:true' : '',
      showCategorySelector
        ? mode === 'categories'
          ? followedCategories?.map((cat) => `lowercaseTags:${cat}`) ?? ''
          : follows?.map((creatorId) => `creatorId:${creatorId}`) ?? ''
        : '',
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
  }, [
    filter,
    showCategorySelector,
    mode,
    Object.values(additionalFilter ?? {}).join(','),
    followedCategories?.join(','),
    follows?.join(','),
  ])

  const indexName = `${indexPrefix}contracts-${sort}`

  return (
    <InstantSearch searchClient={searchClient} indexName={indexName}>
      <Row className="gap-1 sm:gap-2">
        <SearchBox
          className="flex-1"
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
        >
          <option value="open">Open</option>
          <option value="closed">Closed</option>
          <option value="resolved">Resolved</option>
          <option value="all">All</option>
        </select>
        <SortBy
          items={sortIndexes}
          classNames={{
            select: '!select !select-bordered',
          }}
        />
        <Configure
          facetFilters={filters}
          numericFilters={numericFilters}
          // Page resets on filters change.
          page={0}
        />
      </Row>

      <Spacer h={3} />

      {showCategorySelector && (
        <CategoryFollowSelector
          mode={mode}
          setMode={setMode}
          followedCategories={followedCategories ?? []}
          follows={follows ?? []}
        />
      )}

      <Spacer h={4} />

      {mode === 'following' && (follows ?? []).length === 0 ? (
        <>You're not following anyone yet.</>
      ) : (
        <ContractSearchInner
          querySortOptions={querySortOptions}
          onContractClick={onContractClick}
        />
      )}
    </InstantSearch>
  )
}

export function ContractSearchInner(props: {
  querySortOptions?: {
    defaultSort: Sort
    shouldLoadFromStorage?: boolean
  }
  onContractClick?: (contract: Contract) => void
}) {
  const { querySortOptions, onContractClick } = props
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
  const contracts = hits as any as Contract[]

  if (isInitialLoad && contracts.length === 0) return <></>

  return (
    <ContractsGrid
      contracts={contracts}
      loadMore={showMore}
      hasMore={!isLastPage}
      showCloseTime={index.endsWith('close-date')}
      onContractClick={onContractClick}
    />
  )
}

function CategoryFollowSelector(props: {
  mode: 'categories' | 'following'
  setMode: (mode: 'categories' | 'following') => void
  followedCategories: string[]
  follows: string[]
}) {
  const { mode, setMode, followedCategories, follows } = props

  const user = useUser()

  const categoriesLabel = `Categories ${
    followedCategories.length ? followedCategories.length : '(All)'
  }`

  let categoriesDescription = `Showing all categories`

  if (followedCategories.length) {
    const categoriesLabel = followedCategories
      .slice(0, 3)
      .map((cat) => CATEGORIES[cat])
      .join(', ')
    const andMoreLabel =
      followedCategories.length > 3
        ? `, and ${followedCategories.length - 3} more`
        : ''
    categoriesDescription = `Showing ${categoriesLabel}${andMoreLabel}`
  }

  const followingLabel = `Following ${follows.length}`

  return (
    <Col className="gap-2">
      <ChoicesToggleGroup
        currentChoice={mode}
        choicesMap={{
          [categoriesLabel]: 'categories',
          [followingLabel]: 'following',
        }}
        setChoice={(c) => setMode(c as 'categories' | 'following')}
      />

      {mode === 'categories' && user && (
        <Row className="items-center gap-2 text-gray-500">
          <div>{categoriesDescription}</div>
          <EditCategoriesButton className="self-start" user={user} />
        </Row>
      )}

      {mode === 'following' && user && (
        <Row className="h-8 items-center gap-2 text-gray-500">
          <div>Showing markets created by users you are following.</div>
        </Row>
      )}
    </Col>
  )
}
