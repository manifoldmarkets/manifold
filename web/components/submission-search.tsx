/* eslint-disable react-hooks/exhaustive-deps */
import algoliasearch from 'algoliasearch/lite'

import { Contract } from 'common/contract'
import { Sort, useQueryAndSortParams } from '../hooks/use-sort-and-query-params'
import {
  ContractHighlightOptions,
  ContractsGrid,
} from './contract/contracts-list'
import { Row } from './layout/row'
import { useEffect, useMemo, useState } from 'react'
import { Spacer } from './layout/spacer'
import { ENV, IS_PRIVATE_MANIFOLD } from 'common/envs/constants'
import { useUser } from 'web/hooks/use-user'
import { useFollows } from 'web/hooks/use-follows'
import { track, trackCallback } from 'web/lib/service/analytics'
import ContractSearchFirestore from 'web/pages/contract-search-firestore'
import { useMemberGroups } from 'web/hooks/use-group'
import { Group, NEW_USER_GROUP_SLUGS } from 'common/group'
import { PillButton } from './buttons/pill-button'
import { range, sortBy } from 'lodash'
import { DEFAULT_CATEGORY_GROUPS } from 'common/categories'
import { Col } from './layout/col'
import SubmissionSearchFirestore from 'web/pages/submission-search-firestore'
import { SubmissionsGrid } from './submission/submission-list'
import { contest_data } from 'common/contest'

// All contest scraping data imports
import { default as causeExploration } from 'web/lib/util/contests/causeExploration.json'
import { getGroupBySlug } from 'web/lib/firebase/groups'
import { getContractFromId } from 'web/lib/firebase/contracts'
import { contractTextDetails } from './contract/contract-details'
import { createMarket } from 'web/lib/firebase/api'
import { removeUndefinedProps } from 'common/util/object'
import dayjs from 'dayjs'
import { useRouter } from 'next/router'

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
export const DEFAULT_SORT = 'score'

type filter = 'personal' | 'open' | 'closed' | 'resolved' | 'all'

export function SubmissionSearch(props: {
  querySortOptions?: {
    defaultSort: Sort
    defaultFilter?: filter
    shouldLoadFromStorage?: boolean
  }
  additionalFilter: {
    creatorId?: string
    tag?: string
    excludeContractIds?: string[]
    contestSlug: string
  }
  highlightOptions?: ContractHighlightOptions
  onContractClick?: (contract: Contract) => void
  showPlaceHolder?: boolean
  hideOrderSelector?: boolean
  overrideGridClassName?: string
  cardHideOptions?: {
    hideGroupLink?: boolean
    hideQuickBet?: boolean
  }
}) {
  const {
    querySortOptions,
    additionalFilter,
    onContractClick,
    overrideGridClassName,
    hideOrderSelector,
    showPlaceHolder,
    cardHideOptions,
    highlightOptions,
  } = props

  const user = useUser()
  const router = useRouter()

  const { shouldLoadFromStorage, defaultSort } = querySortOptions ?? {}
  const { query, setQuery, sort, setSort } = useQueryAndSortParams({
    defaultSort,
    shouldLoadFromStorage,
  })

  const [filter, setFilter] = useState<filter>(
    querySortOptions?.defaultFilter ?? 'open'
  )

  const additionalFilters = [
    additionalFilter?.contestSlug
      ? `groupLinks.slug:${additionalFilter.contestSlug}`
      : '',
  ]

  let facetFilters = query
    ? additionalFilters
    : [
        ...additionalFilters,
        filter === 'open' ? 'isResolved:false' : '',
        filter === 'closed' ? 'isResolved:false' : '',
        filter === 'resolved' ? 'isResolved:true' : '',
      ].filter((f) => f)
  // Hack to make Algolia work.
  facetFilters = ['', ...facetFilters]

  const numericFilters = query
    ? []
    : [
        filter === 'open' ? `closeTime > ${Date.now()}` : '',
        filter === 'closed' ? `closeTime <= ${Date.now()}` : '',
      ].filter((f) => f)

  const indexName = `${indexPrefix}contracts-${sort}`
  const index = useMemo(() => searchClient.initIndex(indexName), [indexName])
  const searchIndex = useMemo(
    () => searchClient.initIndex(searchIndexName),
    [searchIndexName]
  )

  const [page, setPage] = useState(0)
  const [numPages, setNumPages] = useState(1)
  const [hitsByPage, setHitsByPage] = useState<{ [page: string]: Contract[] }>(
    {}
  )

  useEffect(() => {
    let wasMostRecentQuery = true
    const algoliaIndex = query ? searchIndex : index

    algoliaIndex
      .search(query, {
        facetFilters,
        numericFilters,
        page,
        hitsPerPage: 20,
      })
      .then((results) => {
        if (!wasMostRecentQuery) return

        if (page === 0) {
          setHitsByPage({
            [0]: results.hits as any as Contract[],
          })
        } else {
          setHitsByPage((hitsByPage) => ({
            ...hitsByPage,
            [page]: results.hits,
          }))
        }
        setNumPages(results.nbPages)
      })
    return () => {
      wasMostRecentQuery = false
    }
    // Note numeric filters are unique based on current time, so can't compare
    // them by value.
  }, [query, page, index, searchIndex, JSON.stringify(facetFilters), filter])

  const loadMore = () => {
    if (page >= numPages - 1) return

    const haveLoadedCurrentPage = hitsByPage[page]
    if (haveLoadedCurrentPage) setPage(page + 1)
  }

  const hits = range(0, page + 1)
    .map((p) => hitsByPage[p] ?? [])
    .flat()

  const contracts = hits.filter(
    (c) => !additionalFilter?.excludeContractIds?.includes(c.id)
  )

  const showTime =
    sort === 'close-date' || sort === 'resolve-date' ? sort : undefined

  const updateQuery = (newQuery: string) => {
    setQuery(newQuery)
    setPage(0)
  }

  const selectFilter = (newFilter: filter) => {
    if (newFilter === filter) return
    setFilter(newFilter)
    setPage(0)
    trackCallback('select search filter', { filter: newFilter })
  }

  const selectSort = (newSort: Sort) => {
    if (newSort === sort) return

    setPage(0)
    setSort(newSort)
    track('select sort', { sort: newSort })
  }

  const contestSlug = additionalFilter?.contestSlug

  // Getting all submissions in a group and seeing if there's any new ones from the last scraping
  // if so, creates new submission

  async function syncSubmissions() {
    let scrapedTitles = causeExploration.map((entry) => entry.title)
    if (contestSlug) {
      let group = await getGroupBySlug(contestSlug).catch((err) => {
        return err
      })

      let questions: string[] = await Promise.all(
        group.contractIds.map(async (contractId: string) => {
          return (await getContractFromId(contractId))?.question
        })
      )

      scrapedTitles.map(async (title) => {
        if (!questions.includes(title)) {
          // INGA/TODO: I don't know how to create a market, we should also be creating these markets under some like manifold account so that users aren't creating markets on their own when the backend updates. Pls help
          // await createMarket(
          //   removeUndefinedProps({
          //     title,
          //     outcomeType: 'BINARY',
          //     initialProb: 50,
          //     groupId: group.id,
          //     closeTime: dayjs(
          //       contest_data[contestSlug].closeTime
          //     ).valueOf(),
          //   })
          // )
        }
      })
    }
  }

  syncSubmissions()

  if (IS_PRIVATE_MANIFOLD || process.env.NEXT_PUBLIC_FIREBASE_EMULATE) {
    return (
      <SubmissionSearchFirestore
        querySortOptions={querySortOptions}
        additionalFilter={additionalFilter}
      />
    )
  }

  return (
    <Col>
      <Row className="gap-1 sm:gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => updateQuery(e.target.value)}
          placeholder={showPlaceHolder ? `Search ${filter} markets` : ''}
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

      <Spacer h={4} />
      <SubmissionsGrid
        contracts={contracts}
        loadMore={loadMore}
        hasMore={true}
        showTime={showTime}
        onContractClick={onContractClick}
        overrideGridClassName={overrideGridClassName}
        highlightOptions={highlightOptions}
        cardHideOptions={cardHideOptions}
        contestSlug={contestSlug}
      />
    </Col>
  )
}
