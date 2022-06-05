/* eslint-disable react-hooks/exhaustive-deps */
import algoliasearch from 'algoliasearch/lite'
import {
  InstantSearch,
  SearchBox,
  SortBy,
  useCurrentRefinements,
  useInfiniteHits,
  useRange,
  useRefinementList,
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
import { useEffect, useRef, useState } from 'react'
import { Spacer } from './layout/spacer'
import { ENV } from 'common/envs/constants'
import { useUser } from 'web/hooks/use-user'
import { useFollows } from 'web/hooks/use-follows'
import { ChoicesToggleGroup } from './choices-toggle-group'

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
    category?: string
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
    : querySortOptions?.defaultSort

  const [filter, setFilter] = useState<filter>(
    querySortOptions?.defaultFilter ?? 'open'
  )

  const [mode, setMode] = useState<'categories' | 'following'>('categories')

  if (!sort) return <></>

  const key =
    mode === 'following'
      ? follows?.length
        ? `${follows.join(',')}`
        : ''
      : followedCategories?.length
      ? `${followedCategories.join(',')}`
      : ''

  const categoriesLabel = `Categories ${
    followedCategories ? followedCategories.length : 'all'
  }`

  const followingLabel = `Following ${follows?.length ?? 0}`

  const indexName = `${indexPrefix}contracts-${sort}`

  return (
    <InstantSearch
      searchClient={searchClient}
      indexName={indexName}
      key={`search-${
        additionalFilter?.tag ?? additionalFilter?.creatorId ?? ''
      }${key}`}
      initialUiState={
        mode === 'following'
          ? {
              [indexName]: {
                refinementList: {
                  creatorId: ['', ...(follows ?? [])],
                },
              },
            }
          : followedCategories
          ? {
              [indexName]: {
                refinementList: {
                  lowercaseTags: ['', ...followedCategories],
                },
              },
            }
          : undefined
      }
    >
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
      </Row>

      <Spacer h={3} />

      {showCategorySelector && (
        <ChoicesToggleGroup
          currentChoice={mode}
          choicesMap={{
            [categoriesLabel]: 'categories',
            [followingLabel]: 'following',
          }}
          setChoice={(c) => setMode(c as 'categories' | 'following')}
        />
      )}

      <Spacer h={4} />

      {mode === 'following' && (follows ?? []).length === 0 ? (
        <>You're not following anyone yet.</>
      ) : (
        <ContractSearchInner
          querySortOptions={querySortOptions}
          filter={filter}
          additionalFilter={additionalFilter ?? {}}
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
  filter: filter
  additionalFilter: {
    creatorId?: string
    tag?: string
  }
  onContractClick?: (contract: Contract) => void
}) {
  const { querySortOptions, filter, additionalFilter, onContractClick } = props
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

  const { creatorId, tag } = additionalFilter

  useFilterCreator(creatorId)

  useFilterTag(tag)

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

const useFilterCreator = (creatorId: string | undefined) => {
  const { refine } = useRefinementList({ attribute: 'creatorId' })
  useEffect(() => {
    if (creatorId) refine(creatorId)
  }, [creatorId, refine])
}

const useFilterTag = (tag: string | undefined) => {
  const { items, refine: deleteRefinement } = useCurrentRefinements({
    includedAttributes: ['lowercaseTags'],
  })
  const { refine } = useRefinementList({ attribute: 'lowercaseTags' })
  useEffect(() => {
    const refinements = items[0]?.refinements ?? []
    if (tag) refine(tag.toLowerCase())
    if (refinements[0]) deleteRefinement(refinements[0])
  }, [tag])
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
  const { items, refine: deleteRefinement } = useCurrentRefinements({
    includedAttributes: ['isResolved'],
  })

  const { refine } = useRefinementList({ attribute: 'isResolved' })

  useEffect(() => {
    const refinements = items[0]?.refinements ?? []

    if (value !== undefined) refine(`${value}`)
    refinements.forEach((refinement) => deleteRefinement(refinement))
  }, [value])
}
