/* eslint-disable react-hooks/exhaustive-deps */
import { SearchOptions } from '@algolia/client-search'
import { useRouter } from 'next/router'
import { Contract } from 'common/contract'
import { PAST_BETS, User } from 'common/user'
import { CardHighlightOptions, ContractsGrid } from './contract/contracts-grid'
import { ShowTime } from './contract/contract-details'
import { Row } from './layout/row'
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useMemo,
  ReactNode,
  useState,
} from 'react'
import { IS_PRIVATE_MANIFOLD } from 'common/envs/constants'
import { useFollows } from 'web/hooks/use-follows'
import {
  historyStore,
  urlParamStore,
  usePersistentState,
} from 'web/hooks/use-persistent-state'
import { track, trackCallback } from 'web/lib/service/analytics'
import ContractSearchFirestore from 'web/pages/contract-search-firestore'
import { useMemberGroups } from 'web/hooks/use-group'
import { NEW_USER_GROUP_SLUGS } from 'common/group'
import { PillButton } from './buttons/pill-button'
import { debounce, isEqual, sortBy } from 'lodash'
import { DEFAULT_CATEGORY_GROUPS } from 'common/categories'
import { Col } from './layout/col'
import clsx from 'clsx'
import { safeLocalStorage } from 'web/lib/util/local'
import {
  getIndexName,
  searchClient,
  searchIndexName,
} from 'web/lib/service/algolia'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { AdjustmentsIcon } from '@heroicons/react/solid'
import { Button } from './buttons/button'
import { Modal } from './layout/modal'
import { Title } from './widgets/title'
import { Input } from './widgets/input'
import { Select } from './widgets/select'

export const SORTS = [
  { label: 'Newest', value: 'newest' },
  { label: 'Trending', value: 'score' },
  { label: 'Daily changed', value: 'daily-score' },
  { label: '24h volume', value: '24-hour-vol' },
  { label: 'Most popular', value: 'most-popular' },
  { label: 'Liquidity', value: 'liquidity' },
  { label: 'Last updated', value: 'last-updated' },
  { label: 'Closing soon', value: 'close-date' },
  { label: 'Resolve date', value: 'resolve-date' },
  { label: 'Highest %', value: 'prob-descending' },
  { label: 'Lowest %', value: 'prob-ascending' },
] as const

export type Sort = typeof SORTS[number]['value']
export const PROB_SORTS = ['prob-descending', 'prob-ascending']

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
  defaultPill?: string
  additionalFilter?: AdditionalFilter
  highlightOptions?: CardHighlightOptions
  onContractClick?: (contract: Contract) => void
  hideOrderSelector?: boolean
  cardUIOptions?: {
    hideGroupLink?: boolean
    hideQuickBet?: boolean
    noLinkAvatar?: boolean
    showProbChange?: boolean
  }
  headerClassName?: string
  persistPrefix?: string
  useQueryUrlParam?: boolean
  isWholePage?: boolean
  includeProbSorts?: boolean
  noControls?: boolean
  maxResults?: number
  renderContracts?: (
    contracts: Contract[] | undefined,
    loadMore: () => void
  ) => ReactNode
  autoFocus?: boolean
  profile?: boolean | undefined
}) {
  const {
    user,
    defaultSort,
    defaultFilter,
    defaultPill,
    additionalFilter,
    onContractClick,
    hideOrderSelector,
    cardUIOptions,
    highlightOptions,
    headerClassName,
    persistPrefix,
    useQueryUrlParam,
    includeProbSorts,
    isWholePage,
    noControls,
    maxResults,
    renderContracts,
    autoFocus,
    profile,
  } = props

  const [state, setState] = usePersistentState(
    {
      numPages: 1,
      pages: [] as Contract[][],
      showTime: null as ShowTime | null,
      showProbChange: false,
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
        : searchClient.initIndex(getIndexName(sort))
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
        advancedSyntax: true,
      })
      // if there's a more recent request, forget about this one
      if (id === requestId.current) {
        const newPage = results.hits as any as Contract[]
        const showTime =
          sort === 'close-date' || sort === 'resolve-date' ? sort : null
        const showProbChange = sort === 'daily-score'
        const pages = freshQuery ? [newPage] : [...state.pages, newPage]
        setState({ numPages: results.nbPages, pages, showTime, showProbChange })
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

  const updatedCardUIOptions = useMemo(() => {
    if (cardUIOptions?.showProbChange === undefined && state.showProbChange)
      return { ...cardUIOptions, showProbChange: true }
    return cardUIOptions
  }, [cardUIOptions, state.showProbChange])

  const contracts = state.pages
    .flat()
    .filter((c) => !additionalFilter?.excludeContractIds?.includes(c.id))
  const renderedContracts =
    state.pages.length === 0 ? undefined : contracts.slice(0, maxResults)

  if (IS_PRIVATE_MANIFOLD || process.env.NEXT_PUBLIC_FIREBASE_EMULATE) {
    return <ContractSearchFirestore additionalFilter={additionalFilter} />
  }

  return (
    <Col>
      <ContractSearchControls
        className={headerClassName}
        defaultSort={defaultSort}
        defaultFilter={defaultFilter}
        defaultPill={defaultPill}
        additionalFilter={additionalFilter}
        persistPrefix={persistPrefix}
        hideOrderSelector={hideOrderSelector}
        useQueryUrlParam={useQueryUrlParam}
        includeProbSorts={includeProbSorts}
        user={user}
        onSearchParametersChanged={onSearchParametersChanged}
        noControls={noControls}
        autoFocus={autoFocus}
      />
      {renderContracts ? (
        renderContracts(renderedContracts, performQuery)
      ) : renderedContracts && renderedContracts.length === 0 && profile ? (
        <p className="mx-2 text-gray-500">
          This creator does not yet have any markets.
        </p>
      ) : (
        <ContractsGrid
          contracts={renderedContracts}
          loadMore={noControls ? undefined : performQuery}
          showTime={state.showTime ?? undefined}
          onContractClick={onContractClick}
          highlightOptions={highlightOptions}
          cardUIOptions={updatedCardUIOptions}
        />
      )}
    </Col>
  )
}

function ContractSearchControls(props: {
  className?: string
  defaultSort?: Sort
  defaultFilter?: filter
  defaultPill?: string
  additionalFilter?: AdditionalFilter
  persistPrefix?: string
  hideOrderSelector?: boolean
  includeProbSorts?: boolean
  onSearchParametersChanged: (params: SearchParameters) => void
  useQueryUrlParam?: boolean
  user?: User | null
  noControls?: boolean
  autoFocus?: boolean
}) {
  const {
    className,
    defaultSort,
    defaultFilter,
    defaultPill,
    additionalFilter,
    persistPrefix,
    hideOrderSelector,
    onSearchParametersChanged,
    useQueryUrlParam,
    user,
    noControls,
    autoFocus,
    includeProbSorts,
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

  const isMobile = useIsMobile()

  const sortKey = `${persistPrefix}-search-sort`
  const savedSort = safeLocalStorage()?.getItem(sortKey)

  const [sort, setSort] = usePersistentState(
    savedSort ?? defaultSort ?? 'score',
    !useQueryUrlParam
      ? undefined
      : {
          key: 's',
          store: urlParamStore(router),
        }
  )
  const [filter, setFilter] = usePersistentState(
    defaultFilter ?? 'open',
    !useQueryUrlParam
      ? undefined
      : {
          key: 'f',
          store: urlParamStore(router),
        }
  )
  const [pill, setPill] = usePersistentState(
    defaultPill ?? '',
    !useQueryUrlParam
      ? undefined
      : {
          key: 'p',
          store: urlParamStore(router),
        }
  )

  useEffect(() => {
    if (persistPrefix && sort) {
      safeLocalStorage()?.setItem(sortKey, sort as string)
    }
  }, [persistPrefix, query, sort, sortKey])

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

  const personalFilters = user
    ? [
        // Show contracts in groups that the user is a member of.
        memberGroupSlugs
          .map((slug) => `groupLinks.slug:${slug}`)
          // Or, show contracts created by users the user follows
          .concat(follows?.map((followId) => `creatorId:${followId}`) ?? []),

        // Subtract contracts you bet on, to show new ones.
        `uniqueBettorIds:-${user.id}`,
      ]
    : []

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

        pill && pill !== 'personal' && pill !== 'your-bets'
          ? `groupLinks.slug:${pill}`
          : '',
        ...(pill === 'personal' ? personalFilters : []),
        pill === 'your-bets' && user
          ? // Show contracts bet on by the user
            `uniqueBettorIds:${user.id}`
          : '',
      ].filter((f) => f)

  const openClosedFilter =
    filter === 'open' ? 'open' : filter === 'closed' ? 'closed' : undefined

  const selectPill = (pill: string | null) => () => {
    setPill(pill ?? '')
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
      sort: sort as Sort,
      openClosedFilter: openClosedFilter,
      facetFilters: facetFilters,
    })
  }, [query, sort, openClosedFilter, JSON.stringify(facetFilters)])

  if (noControls) {
    return <></>
  }

  return (
    <Col className={clsx('bg-greyscale-1 top-0 z-20 gap-3 pb-3', className)}>
      <Row className="gap-1 sm:gap-2">
        <Input
          type="text"
          value={query}
          onChange={(e) => updateQuery(e.target.value)}
          onBlur={trackCallback('search', { query: query })}
          placeholder="Search"
          className="w-full"
          autoFocus={autoFocus}
        />
        {!isMobile && !query && (
          <SearchFilters
            filter={filter}
            selectFilter={selectFilter}
            hideOrderSelector={hideOrderSelector}
            selectSort={selectSort}
            sort={sort}
            className={'flex flex-row gap-2'}
            includeProbSorts={includeProbSorts}
          />
        )}
        {isMobile && !query && (
          <>
            <MobileSearchBar
              children={
                <SearchFilters
                  filter={filter}
                  selectFilter={selectFilter}
                  hideOrderSelector={hideOrderSelector}
                  selectSort={selectSort}
                  sort={sort}
                  className={'flex flex-col gap-4'}
                  includeProbSorts={includeProbSorts}
                />
              }
            />
          </>
        )}
      </Row>

      {!additionalFilter && !query && (
        <Row className="scrollbar-hide items-start gap-2 overflow-x-auto">
          <PillButton key={'all'} selected={!pill} onSelect={selectPill(null)}>
            All
          </PillButton>
          <PillButton
            key={'personal'}
            selected={pill === 'personal'}
            onSelect={selectPill('personal')}
          >
            {user ? 'For you' : 'Featured'}
          </PillButton>

          {user && (
            <PillButton
              key={'your-bets'}
              selected={pill === 'your-bets'}
              onSelect={selectPill('your-bets')}
            >
              Your {PAST_BETS}
            </PillButton>
          )}

          {pillGroups.map(({ name, slug }) => {
            return (
              <PillButton
                key={slug}
                selected={pill === slug}
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

export function SearchFilters(props: {
  filter: string
  selectFilter: (newFilter: filter) => void
  hideOrderSelector: boolean | undefined
  selectSort: (newSort: Sort) => void
  sort: string
  className?: string
  includeProbSorts?: boolean
}) {
  const {
    filter,
    selectFilter,
    hideOrderSelector,
    selectSort,
    sort,
    className,
    includeProbSorts,
  } = props

  const sorts = includeProbSorts
    ? SORTS
    : SORTS.filter((sort) => !PROB_SORTS.includes(sort.value))

  return (
    <div className={className}>
      <Select
        value={filter}
        onChange={(e) => selectFilter(e.target.value as filter)}
      >
        <option value="open">Open</option>
        <option value="closed">Closed</option>
        <option value="resolved">Resolved</option>
        <option value="all">All</option>
      </Select>
      {!hideOrderSelector && (
        <Select
          value={sort}
          onChange={(e) => selectSort(e.target.value as Sort)}
        >
          {sorts.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      )}
    </div>
  )
}

export function MobileSearchBar(props: { children: ReactNode }) {
  const { children } = props
  const [openFilters, setOpenFilters] = useState(false)
  return (
    <>
      <Button color="gray-white" onClick={() => setOpenFilters(true)}>
        <AdjustmentsIcon className="my-auto h-7" />
      </Button>
      <Modal
        open={openFilters}
        setOpen={setOpenFilters}
        position="top"
        className="rounded-lg bg-white px-4 pb-4"
      >
        <Col>
          <Title text="Filter Markets" />
          {children}
        </Col>
      </Modal>
    </>
  )
}
