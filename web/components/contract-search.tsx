/* eslint-disable react-hooks/exhaustive-deps */
import algoliasearch from 'algoliasearch/lite'

import { Contract } from 'common/contract'
import { User } from 'common/user'
import { Sort, useQueryAndSortParams } from '../hooks/use-sort-and-query-params'
import {
  ContractHighlightOptions,
  ContractsGrid,
} from './contract/contracts-grid'
import { Row } from './layout/row'
import { useEffect, useMemo, useState } from 'react'
import { Spacer } from './layout/spacer'
import { ENV, IS_PRIVATE_MANIFOLD } from 'common/envs/constants'
import { useFollows } from 'web/hooks/use-follows'
import { track, trackCallback } from 'web/lib/service/analytics'
import ContractSearchFirestore from 'web/pages/contract-search-firestore'
import { useMemberGroups } from 'web/hooks/use-group'
import { Group, NEW_USER_GROUP_SLUGS } from 'common/group'
import { PillButton } from './buttons/pill-button'
import { range, sortBy } from 'lodash'
import { DEFAULT_CATEGORY_GROUPS } from 'common/categories'
import { Col } from './layout/col'

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

export function ContractSearch(props: {
  user: User | null | undefined
  querySortOptions?: {
    defaultSort: Sort
    defaultFilter?: filter
    shouldLoadFromStorage?: boolean
  }
  additionalFilter?: {
    creatorId?: string
    tag?: string
    excludeContractIds?: string[]
    groupSlug?: string
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
    user,
    querySortOptions,
    additionalFilter,
    onContractClick,
    overrideGridClassName,
    hideOrderSelector,
    showPlaceHolder,
    cardHideOptions,
    highlightOptions,
  } = props

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

  const defaultPillGroups = DEFAULT_CATEGORY_GROUPS as Group[]

  const pillGroups =
    memberPillGroups.length > 0 ? memberPillGroups : defaultPillGroups

  const follows = useFollows(user?.id)

  const { shouldLoadFromStorage, defaultSort } = querySortOptions ?? {}
  const { query, setQuery, sort, setSort } = useQueryAndSortParams({
    defaultSort,
    shouldLoadFromStorage,
  })

  const [filter, setFilter] = useState<filter>(
    querySortOptions?.defaultFilter ?? 'open'
  )
  const pillsEnabled = !additionalFilter && !query

  const [pillFilter, setPillFilter] = useState<string | undefined>(undefined)

  const selectPill = (pill: string | undefined) => () => {
    setPillFilter(pill)
    setPage(0)
    track('select search category', { category: pill ?? 'all' })
  }

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

  if (IS_PRIVATE_MANIFOLD || process.env.NEXT_PUBLIC_FIREBASE_EMULATE) {
    return (
      <ContractSearchFirestore
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

      <Spacer h={3} />

      {pillsEnabled && (
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

      <Spacer h={3} />

      {filter === 'personal' &&
      (follows ?? []).length === 0 &&
      memberGroupSlugs.length === 0 ? (
        <>You're not following anyone, nor in any of your own groups yet.</>
      ) : (
        <ContractsGrid
          contracts={hitsByPage[0] === undefined ? undefined : contracts}
          loadMore={loadMore}
          hasMore={true}
          showTime={showTime}
          onContractClick={onContractClick}
          overrideGridClassName={overrideGridClassName}
          highlightOptions={highlightOptions}
          cardHideOptions={cardHideOptions}
        />
      )}
    </Col>
  )
}
