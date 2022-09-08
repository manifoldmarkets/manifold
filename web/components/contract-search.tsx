/* eslint-disable react-hooks/exhaustive-deps */
import algoliasearch from 'algoliasearch/lite'
import { SearchOptions } from '@algolia/client-search'
import { useRouter } from 'next/router'
import { Contract } from 'common/contract'
import { User } from 'common/user'
import {
  ContractHighlightOptions,
  ContractsGrid,
} from './contract/contracts-grid'
import { ShowTime } from './contract/contract-details'
import { Row } from './layout/row'
import { useEffect, useLayoutEffect, useRef, useMemo, ReactNode } from 'react'
import { ENV, IS_PRIVATE_MANIFOLD } from 'common/envs/constants'
import { useFollows } from 'web/hooks/use-follows'
import {
  storageStore,
  historyStore,
  urlParamStore,
  usePersistentState,
} from 'web/hooks/use-persistent-state'
import { safeLocalStorage } from 'web/lib/util/local'
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

export const SORTS = [
  { label: 'Newest', value: 'newest' },
  { label: 'Trending', value: 'score' },
  { label: 'Most traded', value: 'most-traded' },
  { label: '24h volume', value: '24-hour-vol' },
  { label: '24h change', value: 'prob-change-day' },
  { label: 'Last updated', value: 'last-updated' },
  { label: 'Subsidy', value: 'liquidity' },
  { label: 'Close date', value: 'close-date' },
  { label: 'Resolve date', value: 'resolve-date' },
  { label: 'Highest %', value: 'prob-descending' },
  { label: 'Lowest %', value: 'prob-ascending' },
] as const

export type Sort = typeof SORTS[number]['value']

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
  yourBets?: boolean
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
  useQueryUrlParam?: boolean
  isWholePage?: boolean
  noControls?: boolean
  maxResults?: number
  renderContracts?: (
    contracts: Contract[] | undefined,
    loadMore: () => void
  ) => ReactNode
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
    useQueryUrlParam,
    isWholePage,
    noControls,
    maxResults,
    renderContracts,
  } = props

  const [state, setState] = usePersistentState(
    {
      numPages: 1,
      pages: [] as Contract[][],
      showTime: null as ShowTime | null,
    },
    !persistPrefix
      ? undefined
      : { key: `${persistPrefix}-search`, store: historyStore() }
  )

  const searchParams = useRef<SearchParameters | null>(null)
  const searchParamsStore = historyStore<SearchParameters>()
  const requestId = useRef(0)

  useLayoutEffect(() => {
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
        const pages = freshQuery ? [newPage] : [...state.pages, newPage]
        setState({ numPages: results.nbPages, pages, showTime })
        if (freshQuery && isWholePage) window.scrollTo(0, 0)
      }
    }
  }

  const onSearchParametersChanged = useRef(
    debounce((params) => {
      if (!isEqual(searchParams.current, params)) {
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
    <Col className="h-full">
      <ContractSearchControls
        className={headerClassName}
        defaultSort={defaultSort}
        defaultFilter={defaultFilter}
        additionalFilter={additionalFilter}
        hideOrderSelector={hideOrderSelector}
        persistPrefix={persistPrefix ? `${persistPrefix}-controls` : undefined}
        useQueryUrlParam={useQueryUrlParam}
        user={user}
        onSearchParametersChanged={onSearchParametersChanged}
        noControls={noControls}
      />
      {renderContracts ? (
        renderContracts(renderedContracts, performQuery)
      ) : (
        <ContractsGrid
          contracts={renderedContracts}
          loadMore={noControls ? undefined : performQuery}
          showTime={state.showTime ?? undefined}
          onContractClick={onContractClick}
          highlightOptions={highlightOptions}
          cardHideOptions={cardHideOptions}
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
  hideOrderSelector?: boolean
  onSearchParametersChanged: (params: SearchParameters) => void
  persistPrefix?: string
  useQueryUrlParam?: boolean
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
    useQueryUrlParam,
    user,
    noControls,
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

  const [state, setState] = usePersistentState(
    {
      sort: defaultSort ?? 'score',
      filter: defaultFilter ?? 'open',
      pillFilter: null as string | null,
    },
    !persistPrefix
      ? undefined
      : {
          key: `${persistPrefix}-params`,
          store: storageStore(safeLocalStorage()),
        }
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
    memberGroups.filter((group) => group.totalContracts > 0),
    (group) => group.totalContracts
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
    additionalFilter?.yourBets && user
      ? // Show contracts bet on by the user
        `uniqueBettorIds:${user.id}`
      : '',
  ]
  const facetFilters = query
    ? additionalFilters
    : [
        ...additionalFilters,
        additionalFilter ? '' : 'visibility:public',

        state.filter === 'open' ? 'isResolved:false' : '',
        state.filter === 'closed' ? 'isResolved:false' : '',
        state.filter === 'resolved' ? 'isResolved:true' : '',

        state.pillFilter &&
        state.pillFilter !== 'personal' &&
        state.pillFilter !== 'your-bets'
          ? `groupLinks.slug:${state.pillFilter}`
          : '',
        state.pillFilter === 'personal'
          ? // Show contracts in groups that the user is a member of
            memberGroupSlugs
              .map((slug) => `groupLinks.slug:${slug}`)
              // Show contracts created by users the user follows
              .concat(follows?.map((followId) => `creatorId:${followId}`) ?? [])
          : '',
        // Subtract contracts you bet on from For you.
        state.pillFilter === 'personal' && user
          ? `uniqueBettorIds:-${user.id}`
          : '',
        state.pillFilter === 'your-bets' && user
          ? // Show contracts bet on by the user
            `uniqueBettorIds:${user.id}`
          : '',
      ].filter((f) => f)

  const openClosedFilter =
    state.filter === 'open'
      ? 'open'
      : state.filter === 'closed'
      ? 'closed'
      : undefined

  const selectPill = (pill: string | null) => () => {
    setState({ ...state, pillFilter: pill })
    track('select search category', { category: pill ?? 'all' })
  }

  const updateQuery = (newQuery: string) => {
    setQuery(newQuery)
  }

  const selectFilter = (newFilter: filter) => {
    if (newFilter === state.filter) return
    setState({ ...state, filter: newFilter })
    track('select search filter', { filter: newFilter })
  }

  const selectSort = (newSort: Sort) => {
    if (newSort === state.sort) return
    setState({ ...state, sort: newSort })
    track('select search sort', { sort: newSort })
  }

  useEffect(() => {
    onSearchParametersChanged({
      query: query,
      sort: state.sort,
      openClosedFilter: openClosedFilter,
      facetFilters: facetFilters,
    })
  }, [query, state.sort, openClosedFilter, JSON.stringify(facetFilters)])

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
          onBlur={trackCallback('search', { query: query })}
          placeholder={'Search'}
          className="input input-bordered w-full"
        />
        {!query && (
          <select
            className="select select-bordered"
            value={state.filter}
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
            value={state.sort}
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
            selected={state.pillFilter === undefined}
            onSelect={selectPill(null)}
          >
            All
          </PillButton>
          <PillButton
            key={'personal'}
            selected={state.pillFilter === 'personal'}
            onSelect={selectPill('personal')}
          >
            {user ? 'For you' : 'Featured'}
          </PillButton>

          {user && (
            <PillButton
              key={'your-bets'}
              selected={state.pillFilter === 'your-bets'}
              onSelect={selectPill('your-bets')}
            >
              Your trades
            </PillButton>
          )}

          {pillGroups.map(({ name, slug }) => {
            return (
              <PillButton
                key={slug}
                selected={state.pillFilter === slug}
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
