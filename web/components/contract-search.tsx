import algoliasearch from 'algoliasearch/lite'
import {
  InstantSearch,
  SearchBox,
  SortBy,
  useInfiniteHits,
  useRange,
  useRefinementList,
  useSortBy,
  useToggleRefinement,
} from 'react-instantsearch-hooks-web'
import { Contract } from '../../common/contract'
import {
  Sort,
  useInitialQueryAndSort,
  useUpdateQueryAndSort,
} from '../hooks/use-sort-and-query-params'
import { ContractsGrid } from './contract/contracts-list'
import { Row } from './layout/row'
import { useEffect, useRef, useState } from 'react'
import { Spacer } from './layout/spacer'
import { useRouter } from 'next/router'
import { ENV } from 'common/envs/constants'
import { CategorySelector } from './feed/category-selector'
import { useUser } from 'web/hooks/use-user'

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
    category?: string
  }
}) {
  const { querySortOptions, additionalFilter } = props

  const user = useUser()
  const { initialSort } = useInitialQueryAndSort(querySortOptions)

  const sort = sortIndexes
    .map(({ value }) => value)
    .includes(`${indexPrefix}contracts-${initialSort ?? ''}`)
    ? initialSort
    : querySortOptions?.defaultSort

  const [filter, setFilter] = useState<filter>(
    querySortOptions?.defaultFilter ?? 'open'
  )

  const [category, setCategory] = useState<string>('all')

  if (!sort) return <></>
  return (
    <InstantSearch
      searchClient={searchClient}
      indexName={`${indexPrefix}contracts-${sort}`}
      key={`search-${
        additionalFilter?.tag ?? additionalFilter?.creatorId ?? ''
      }`}
    >
      <Row className="flex-wrap gap-2">
        <SearchBox
          className="flex-1"
          classNames={{
            form: 'before:top-6',
            input: '!pl-10 !input !input-bordered shadow-none',
            resetIcon: 'mt-2',
          }}
          placeholder="Search markets"
        />
        <Row className="mt-2 gap-2 sm:mt-0">
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
        </Row>
      </Row>
      <div>
        <Spacer h={4} />
        <CategorySelector
          user={user}
          category={category}
          setCategory={setCategory}
        />
        <Spacer h={4} />

        <ContractSearchInner
          querySortOptions={querySortOptions}
          filter={filter}
          additionalFilter={{ category, ...additionalFilter }}
        />
      </div>
    </InstantSearch>
  )
}

export function ContractSearchInner(props: {
  querySortOptions?: {
    defaultSort: Sort
    shouldLoadFromStorage?: boolean
  }
  filter: filter
  additionalFilter: {
    creatorId?: string
    tag?: string
    category?: string
  }
}) {
  const { querySortOptions, filter, additionalFilter } = props
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

  const { creatorId, category, tag } = additionalFilter

  useFilterCreator(creatorId)

  useFilterTag(category === 'all' ? tag : category)

  useFilterClosed(
    filter === 'closed'
      ? true
      : filter === 'all' || filter === 'resolved'
      ? undefined
      : false
  )
  useFilterResolved(
    filter === 'resolved' ? true : filter === 'all' ? undefined : false
  )

  const { showMore, hits, isLastPage } = useInfiniteHits()
  const contracts = hits as any as Contract[]

  const router = useRouter()
  const hasLoaded = contracts.length > 0 || router.isReady

  if (!hasLoaded) return <></>

  return (
    <ContractsGrid
      contracts={contracts}
      loadMore={showMore}
      hasMore={!isLastPage}
      showCloseTime={index === 'contracts-closing-soon'}
    />
  )
}

const useFilterCreator = (creatorId: string | undefined) => {
  const { refine } = useRefinementList({ attribute: 'creatorId' })
  useEffect(() => {
    if (creatorId) refine(creatorId)
  }, [creatorId, refine])
}

const useFilterTag = (tag: string | undefined) => {
  const { refine } = useRefinementList({ attribute: 'lowercaseTags' })
  useEffect(() => {
    if (tag) refine(tag.toLowerCase())
  }, [tag, refine])
}

const useFilterClosed = (value: boolean | undefined) => {
  const [now] = useState(Date.now())
  useRange({
    attribute: 'closeTime',
    min: value === false ? now : undefined,
    max: value ? now : undefined,
  })
}

const useFilterResolved = (value: boolean | undefined) => {
  // Note (James): I don't know why this works.
  const { refine: refineResolved } = useToggleRefinement({
    attribute: value === undefined ? 'non-existant-field' : 'isResolved',
    on: true,
    off: value === undefined ? undefined : false,
  })
  useEffect(() => {
    refineResolved({ isRefined: !value })
  }, [value])
}
