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
import { useEffect, useState } from 'react'
import { Spacer } from './layout/spacer'
import { useRouter } from 'next/router'

const searchClient = algoliasearch(
  'GJQPAYENIF',
  '75c28fc084a80e1129d427d470cf41a3'
)

const sortIndexes = [
  { label: 'Newest', value: 'contracts-newest' },
  { label: 'Oldest', value: 'contracts-oldest' },
  { label: 'Most traded', value: 'contracts-most-traded' },
  { label: '24h volume', value: 'contracts-24-hour-vol' },
  { label: 'Closing soon', value: 'contracts-closing-soon' },
  { label: 'Closed', value: 'contracts-closed' },
  { label: 'Resolved', value: 'contracts-resolved' },
]

export function ContractSearch(props: {
  querySortOptions?: {
    defaultSort: Sort
    filter?: {
      creatorId?: string
      tag?: string
    }
    shouldLoadFromStorage?: boolean
  }
}) {
  const { querySortOptions } = props

  const { initialSort } = useInitialQueryAndSort(querySortOptions)

  const sort = sortIndexes
    .map(({ value }) => value)
    .includes(`contracts-${initialSort ?? ''}`)
    ? initialSort
    : querySortOptions?.defaultSort

  console.log('sort', sort)
  if (!sort) return <></>
  return (
    <InstantSearch searchClient={searchClient} indexName={`contracts-${sort}`}>
      <Row className="gap-2">
        <SearchBox
          className="flex-1"
          classNames={{
            form: 'before:top-5',
            input: 'pl-10 input input-bordered h-[40px]',
          }}
          placeholder="Search markets"
        />
        <SortBy items={sortIndexes} />
      </Row>
      <ContractSearchInner querySortOptions={querySortOptions} />
    </InstantSearch>
  )
}

export function ContractSearchInner(props: {
  querySortOptions?: {
    defaultSort: Sort
    filter?: {
      creatorId?: string
      tag?: string
    }
    shouldLoadFromStorage?: boolean
  }
}) {
  const { querySortOptions } = props
  const { initialQuery } = useInitialQueryAndSort(querySortOptions)

  const { query, setQuery, setSort } = useUpdateQueryAndSort({
    shouldLoadFromStorage: true,
  })

  useEffect(() => {
    console.log('initial query', initialQuery)
    setQuery(initialQuery)
  }, [initialQuery])

  const { currentRefinement: index } = useSortBy({
    items: [],
  })

  useEffect(() => {
    console.log('setting query', query)
    setQuery(query)
  }, [query])

  useEffect(() => {
    console.log('effect sort', 'curr', index)
    const sort = index.split('contracts-')[1] as Sort
    if (sort) {
      setSort(sort)
    }
  }, [index])

  const creatorId = querySortOptions?.filter?.creatorId
  useFilterCreator(creatorId)

  const tag = querySortOptions?.filter?.tag
  useFilterTag(tag)

  if (
    !creatorId ||
    index === 'contracts-closed' ||
    index === 'contracts-resolved'
  ) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useFilterClosed(index)

    // eslint-disable-next-line react-hooks/rules-of-hooks
    useFilterResolved(index)
  }

  const { showMore, hits, isLastPage } = useInfiniteHits()
  const contracts = hits as any as Contract[]

  const router = useRouter()
  const hasLoaded = contracts.length > 0 || router.isReady

  return (
    <div>
      <Spacer h={8} />

      {hasLoaded && (
        <ContractsGrid
          contracts={contracts}
          loadMore={showMore}
          hasMore={!isLastPage}
          showCloseTime={index === 'contracts-closing-soon'}
        />
      )}
    </div>
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

const useFilterClosed = (index: string) => {
  const [now] = useState(Date.now())
  useRange({
    attribute: 'closeTime',
    min:
      index === 'contracts-resolved' || index === 'contracts-closed' ? 0 : now,
    max: index === 'contracts-closed' ? now : undefined,
  })
}

const useFilterResolved = (index: string) => {
  const { refine: refineResolved } = useToggleRefinement({
    attribute: 'isResolved',
    on: true,
    off: false,
  })
  useEffect(() => {
    console.log(
      'effect',
      'curr',
      index,
      'update',
      index === 'contracts-resolved'
    )
    refineResolved({ isRefined: index !== 'contracts-resolved' })
  }, [index])
}
