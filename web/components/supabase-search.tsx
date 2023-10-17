import { ArrowLeftIcon, ChevronDownIcon, XIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import { isEqual, sample, uniqBy } from 'lodash'
import { ReactNode, useEffect, useRef, useState } from 'react'
import { Contract } from 'common/contract'
import { useEvent } from 'web/hooks/use-event'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { track, trackCallback } from 'web/lib/service/analytics'
import { searchContract } from 'web/lib/supabase/contracts'
import DropdownMenu from './comments/dropdown-menu'
import { ContractsList } from './contract/contracts-list'
import { Col } from './layout/col'
import { Row } from './layout/row'
import generateFilterDropdownItems, {
  getLabelFromValue,
} from './search/search-dropdown-helpers'
import { Input } from './widgets/input'
import {
  usePartialUpdater,
  usePersistentQueriesState,
} from 'web/hooks/use-persistent-query-state'
import {
  useGroupFromSlug,
  useRealtimeMemberGroupIds,
} from 'web/hooks/use-group-supabase'
import { DEFAULT_TOPIC, Group, TOPIC_KEY } from 'common/group'
import { TopicTag } from 'web/components/topics/topic-tag'
import { AddContractToGroupButton } from 'web/components/topics/add-contract-to-group-modal'
import { useUser } from 'web/hooks/use-user'

import { FollowOrUnfolowTopicButton } from 'web/components/topics/topics-button'

import { PillButton } from 'web/components/buttons/pill-button'
import { searchUsers, UserSearchResult } from 'web/lib/supabase/users'
import { searchGroups } from 'web/lib/supabase/groups'
import { convertGroup } from 'common/supabase/groups'
import { FollowButton } from 'web/components/buttons/follow-button'
import { shortFormatNumber } from 'common/util/format'
import { StackedUserNames } from 'web/components/widgets/user-link'
import { User } from 'common/user'
import { Avatar } from 'web/components/widgets/avatar'
import { Button, IconButton } from 'web/components/buttons/button'
import Link from 'next/link'
import { useFollowedUsersOnLoad } from 'web/hooks/use-follows'
import { CONTRACTS_PER_SEARCH_PAGE } from 'common/supabase/contracts'
import { UserResults } from './search/user-results'

const USERS_PER_PAGE = 100
const TOPICS_PER_PAGE = 100

export const SORTS = [
  { label: 'Trending', value: 'score' },
  { label: 'Bounty amount', value: 'bounty-amount' },
  { label: 'New', value: 'newest' },
  { label: 'Closing soon', value: 'close-date' },
  { label: 'Daily change', value: 'daily-score' },
  { label: '24h volume', value: '24-hour-vol' },
  { label: 'Total traders', value: 'most-popular' },
  { label: 'High stakes', value: 'liquidity' },
  { label: 'Last activity', value: 'last-updated' },
  { label: 'Just resolved', value: 'resolve-date' },
  { label: 'High %', value: 'prob-descending' },
  { label: 'Low %', value: 'prob-ascending' },
  { label: '🎲 Random!', value: 'random' },
] as const

const predictionMarketSorts = new Set([
  'daily-score',
  '24-hour-vol',
  'liquidity',
  'close-date',
  'resolve-date',
  'most-popular',
  'prob-descending',
  'prob-ascending',
])

const bountySorts = new Set(['bounty-amount'])

const probSorts = new Set(['prob-descending', 'prob-ascending'])

const BOUNTY_MARKET_SORTS = SORTS.filter(
  (item) => !predictionMarketSorts.has(item.value)
)

const POLL_SORTS = BOUNTY_MARKET_SORTS.filter(
  (item) => !bountySorts.has(item.value)
)

const PREDICTION_MARKET_SORTS = SORTS.filter(
  (item) => !bountySorts.has(item.value) && !probSorts.has(item.value)
)

const PREDICTION_MARKET_PROB_SORTS = SORTS.filter(
  (item) => !bountySorts.has(item.value)
)

export type Sort = typeof SORTS[number]['value']

const FILTERS = [
  { label: 'Any status', value: 'all' },
  { label: 'Open', value: 'open' },
  { label: 'Closing this month', value: 'closing-this-month' },
  { label: 'Closing next month', value: 'closing-next-month' },
  { label: 'Closed', value: 'closed' },
  { label: 'Resolved', value: 'resolved' },
] as const

export type Filter = typeof FILTERS[number]['value']

const CONTRACT_TYPES = [
  { label: 'Any type', value: 'ALL' },
  { label: 'Yes/No', value: 'BINARY' },
  { label: 'Multiple Choice', value: 'MULTIPLE_CHOICE' },
  { label: 'Numeric', value: 'PSEUDO_NUMERIC' },
  { label: 'Bounty', value: 'BOUNTIED_QUESTION' },
  { label: 'Stock', value: 'STONK' },
  { label: 'Poll', value: 'POLL' },
] as const

export type ContractTypeType = typeof CONTRACT_TYPES[number]['value']
type SearchType = '' | 'Topics' | 'Users' | 'Questions'

export type SearchParams = {
  [QUERY_KEY]: string
  [SORT_KEY]: Sort
  [FILTER_KEY]: Filter
  [CONTRACT_TYPE_KEY]: ContractTypeType
  [TOPIC_KEY]: string
  [SEARCH_TYPE_KEY]: SearchType
}

const QUERY_KEY = 'q'
export const SORT_KEY = 's'
const FILTER_KEY = 'f'
const CONTRACT_TYPE_KEY = 'ct'
export const SEARCH_TYPE_KEY = 't'

export type SupabaseAdditionalFilter = {
  creatorId?: string
  tag?: string
  excludeContractIds?: string[]
  excludeGroupSlugs?: string[]
  excludeUserIds?: string[]
  nonQueryFacetFilters?: string[]
  contractType?: ContractTypeType
}

export type SearchState = {
  contracts: Contract[] | undefined
  fuzzyContractOffset: number
  shouldLoadMore: boolean
}

export function SupabaseSearch(props: {
  persistPrefix: string
  defaultSort?: Sort
  defaultFilter?: Filter
  additionalFilter?: SupabaseAdditionalFilter
  highlightContractIds?: string[]
  onContractClick?: (contract: Contract) => void
  hideOrderSelector?: boolean
  hideActions?: boolean
  headerClassName?: string
  isWholePage?: boolean
  menuButton?: ReactNode
  rowBelowFilters?: ReactNode
  // used to determine if search params should be updated in the URL
  useUrlParams?: boolean
  includeProbSorts?: boolean
  autoFocus?: boolean
  emptyState?: ReactNode
  hideSearch?: boolean
  hideContractFilters?: boolean
  defaultSearchType?: SearchType
  yourTopics?: Group[]
  contractsOnly?: boolean
  showTopicTag?: boolean
  hideSearchTypes?: boolean
  userResultProps?: {
    onUserClick?: (user: User) => void
    showFollowButton?: boolean
    loadingUserId?: string
  }
}) {
  const {
    defaultSort,
    defaultFilter,
    additionalFilter,
    onContractClick,
    userResultProps,
    hideOrderSelector,
    hideActions,
    highlightContractIds,
    headerClassName,
    persistPrefix,
    includeProbSorts,
    isWholePage,
    useUrlParams,
    autoFocus,
    hideContractFilters,
    menuButton,
    rowBelowFilters,
    defaultSearchType,
    yourTopics,
    contractsOnly,
    showTopicTag,
    hideSearchTypes,
  } = props

  const [searchParams, setSearchParams, defaults] = useSearchQueryState({
    defaultSort,
    defaultFilter,
    useUrlParams,
    defaultSearchType,
  })
  const user = useUser()
  const followingUsers = useFollowedUsersOnLoad(user?.id)
  const follwingTopics = useRealtimeMemberGroupIds(user?.id)

  const [lastSearch, setLastSearch] = usePersistentInMemoryState<
    typeof searchParams
  >(undefined, `${persistPrefix}-last-search`)
  const queryAsString = searchParams?.[QUERY_KEY] ?? ''
  const searchTypeAsString = searchParams?.[SEARCH_TYPE_KEY] ?? ''
  const currentTopicSlug = searchParams?.[TOPIC_KEY]

  const [queriedUserResults, setQueriedUserResults] =
    usePersistentInMemoryState<UserSearchResult[] | undefined>(
      undefined,
      `${persistPrefix}-queried-user-results`
    )
  const [topicResults, setTopicResults] = usePersistentInMemoryState<
    Group[] | undefined
  >(undefined, `${persistPrefix}-topic-results`)
  const [showSearchTypeState, setShowSearchTypeState] = useState(
    queryAsString === '' || searchTypeAsString !== '' || !!currentTopicSlug
  )

  const userResults = uniqBy(
    (
      followingUsers?.filter(
        (f) =>
          f.name.toLowerCase().includes(queryAsString.toLowerCase()) ||
          f.username.toLowerCase().includes(queryAsString.toLowerCase())
      ) ?? []
    ).concat(queriedUserResults ?? []),
    'id'
  )

  const { contracts, loadMoreContracts, queryContracts } = useContractSearch(
    persistPrefix,
    setLastSearch,
    searchParams,
    additionalFilter,
    isWholePage
  )
  const pillOptions: SearchType[] = ['Questions', 'Users', 'Topics']
  const setQuery = (query: string) => setSearchParams({ [QUERY_KEY]: query })
  const setSearchType = (t: SearchType) =>
    setSearchParams({ [SEARCH_TYPE_KEY]: searchTypeAsString === t ? '' : t })
  const showSearchTypes =
    !hideSearchTypes &&
    ((showSearchTypeState &&
      (!currentTopicSlug || currentTopicSlug === 'for-you') &&
      queryAsString !== '') ||
      searchTypeAsString !== '') &&
    !contractsOnly

  useEffect(() => {
    if (searchParams?.[QUERY_KEY] === '') setShowSearchTypeState(true)
  }, [searchParams?.[QUERY_KEY]])

  useEffect(() => {
    if (
      currentTopicSlug &&
      currentTopicSlug !== 'for-you' &&
      showSearchTypeState
    ) {
      setShowSearchTypeState(false)
      setSearchParams({ [SEARCH_TYPE_KEY]: '' })
    } else if (
      !showSearchTypes &&
      currentTopicSlug === '' &&
      queryAsString === ''
    ) {
      setShowSearchTypeState(true)
    }
  }, [currentTopicSlug])

  const queryUsers = useEvent(async (query: string) => {
    const results = await searchUsers(query, USERS_PER_PAGE, [
      'creatorTraders',
      'bio',
      'createdTime',
      'isBannedFromPosting',
    ])
    return results
  })

  const queryTopics = useEvent(async (query: string) => {
    const results = await searchGroups({
      term: query,
      limit: TOPICS_PER_PAGE,
    })
    const groupResults = results.data.map(convertGroup)
    const followedTopics =
      yourTopics?.filter(
        (f) =>
          f.name.toLowerCase().includes(query.toLowerCase()) ||
          f.slug.toLowerCase().includes(query.toLowerCase())
      ) ?? []
    return uniqBy(followedTopics.concat(groupResults), 'name')
  })

  const searchCountRef = useRef(0)
  useEffect(() => {
    if (!searchParams || isEqual(searchParams, lastSearch)) return
    const searchCount = ++searchCountRef.current

    queryContracts(FRESH_SEARCH_CHANGED_STATE, true)
    queryUsers(queryAsString).then((results) => {
      if (searchCount === searchCountRef.current) setQueriedUserResults(results)
    })
    queryTopics(queryAsString).then((results) => {
      if (searchCount === searchCountRef.current) setTopicResults(results)
    })
  }, [JSON.stringify(searchParams)])

  const emptyContractsState =
    props.emptyState ??
    (searchParams?.[QUERY_KEY] ? (
      <NoResults />
    ) : (
      <Col className="text-ink-700 mx-2 my-6 text-center">
        No questions yet.
        {searchParams?.[TOPIC_KEY] && (
          <Row className={'mt-2 w-full items-center justify-center'}>
            <AddContractToGroupButton groupSlug={searchParams[TOPIC_KEY]} />
          </Row>
        )}
      </Col>
    ))

  return (
    <Col>
      <Col className={clsx('sticky top-0 z-20 ', headerClassName)}>
        <Row>
          <Col className={'w-full'}>
            <Row className={'relative'}>
              <Input
                type="text"
                inputMode="search"
                value={queryAsString}
                onChange={(e) => setQuery(e.target.value)}
                onBlur={trackCallback('search', { query: queryAsString })}
                placeholder={
                  searchTypeAsString === 'Users'
                    ? 'Search users'
                    : searchTypeAsString === 'Topics'
                    ? 'Search topics'
                    : searchTypeAsString === 'Questions' ||
                      (currentTopicSlug && currentTopicSlug !== 'for-you')
                    ? 'Search questions'
                    : 'Search questions, users, and topics'
                }
                className="w-full"
                autoFocus={autoFocus}
              />
              {queryAsString !== '' && (
                <IconButton
                  className={'absolute right-2 top-2.5 p-0'}
                  size={'2xs'}
                  onClick={() => {
                    setSearchParams({ [QUERY_KEY]: '' })
                  }}
                >
                  <XIcon className={'h-5 w-5 rounded-full'} />
                </IconButton>
              )}
            </Row>
          </Col>
          {menuButton}
        </Row>
        {!hideContractFilters && (
          <ContractFilters
            hideOrderSelector={hideOrderSelector}
            includeProbSorts={includeProbSorts}
            params={searchParams ?? defaults}
            updateParams={setSearchParams}
            className={
              searchTypeAsString !== '' && searchTypeAsString !== 'Questions'
                ? 'invisible'
                : ''
            }
            showTopicTag={showTopicTag}
          />
        )}
      </Col>
      {showSearchTypes ? (
        <Row className={'bg-canvas-0 md:bg-canvas-50 gap-1 pb-1'}>
          <Button
            size={'sm'}
            color={'gray-white'}
            className={' ml-1 rounded-full sm:hidden'}
            onClick={() => {
              setShowSearchTypeState(false)
              setSearchType('')
            }}
          >
            <ArrowLeftIcon className={'h-4 w-4'} />
          </Button>
          {pillOptions.map((option) => {
            const numHits = Math.min(
              option === 'Questions'
                ? contracts?.length ?? 0
                : option === 'Users'
                ? userResults?.length ?? 0
                : topicResults?.length ?? 0,
              100
            )
            const hitsTitle =
              numHits >= 100 ? '100+ ' : numHits > 0 ? numHits + ' ' : ''
            return (
              <PillButton
                key={option}
                selected={
                  searchTypeAsString === option ||
                  (option === 'Questions' && searchTypeAsString === '')
                }
                onSelect={() => setSearchType(option)}
              >
                {hitsTitle + option}
              </PillButton>
            )
          })}
        </Row>
      ) : (
        rowBelowFilters
      )}
      {searchTypeAsString === '' || searchTypeAsString === 'Questions' ? (
        contracts && contracts.length === 0 ? (
          emptyContractsState
        ) : (
          <ContractsList
            contracts={contracts}
            loadMore={loadMoreContracts}
            onContractClick={onContractClick}
            highlightContractIds={highlightContractIds}
            headerClassName={clsx(headerClassName, '!top-14')}
            hideActions={hideActions}
          />
        )
      ) : searchTypeAsString === 'Users' ? (
        userResults && userResults.length === 0 ? (
          <Col className="text-ink-700 mx-2 my-6 text-center">
            No users found.
            {/* Find users from your contacts!*/}
          </Col>
        ) : (
          <UserResults
            users={userResults ?? []}
            userResultProps={userResultProps}
          />
        )
      ) : searchTypeAsString === 'Topics' ? (
        topicResults && topicResults.length === 0 ? (
          <Col className="text-ink-700 mx-2 my-6 text-center">
            No topics found.
            {/*  Create a new topic! */}
          </Col>
        ) : (
          <TopicResults
            topics={topicResults ?? []}
            yourTopicIds={follwingTopics ?? []}
          />
        )
      ) : null}
    </Col>
  )
}

const TopicResults = (props: { topics: Group[]; yourTopicIds: string[] }) => {
  const { topics, yourTopicIds } = props
  const me = useUser()

  return (
    <Col className={'mt-1 w-full gap-1'}>
      {topics.map((group) => (
        <Link
          key={group.id}
          href={`/browse?${TOPIC_KEY}=${group.slug}&${SEARCH_TYPE_KEY}=&${QUERY_KEY}=`}
        >
          <Row className={'hover:bg-primary-100 min-h-[4rem] p-1 pl-2 pt-2.5'}>
            <Col className={' w-full'}>
              <span className="line-clamp-1 sm:text-lg">{group.name}</span>
              <Row className={'text-ink-500 line-clamp-2 gap-1 text-sm'}>
                {group.totalMembers > 1 && (
                  <span>{group.totalMembers} followers</span>
                )}
              </Row>
            </Col>
            <div>
              <FollowOrUnfolowTopicButton
                group={group}
                user={me}
                isMember={yourTopicIds.includes(group.id)}
              />
            </div>
          </Row>
        </Link>
      ))}
    </Col>
  )
}

const NoResults = () => {
  const [message] = useState(
    sample([
      'no questions found x.x',
      'no questions found u_u',
      'no questions found T_T',
      'no questions found :c',
      'no questions found :(',
      'no questions found :(',
      'no questions found :(',
      'that search is too bananas for me 🍌',
      'only nothingness',
    ])
  )

  return <div className="text-ink-700 mx-2 my-6 text-center">{message}</div>
}

const FRESH_SEARCH_CHANGED_STATE: SearchState = {
  contracts: undefined,
  fuzzyContractOffset: 0,
  shouldLoadMore: true,
}

const useContractSearch = (
  persistPrefix: string,
  setLastSearch: (searchParams: SearchParams) => void,
  searchParams: SearchParams | undefined,
  additionalFilter?: SupabaseAdditionalFilter,
  isWholePage?: boolean
) => {
  const [state, setState] = usePersistentInMemoryState<SearchState>(
    FRESH_SEARCH_CHANGED_STATE,
    `${persistPrefix}-supabase-contract-search`
  )

  const requestId = useRef(0)

  const queryContracts = useEvent(
    async (currentState: SearchState, freshQuery?: boolean) => {
      if (!searchParams) return true
      const {
        q: query,
        s: sort,
        f: filter,
        topic: topicSlug,
        ct: contractType,
      } = searchParams
      setLastSearch(searchParams)

      const offset = freshQuery
        ? 0
        : currentState.contracts
        ? currentState.contracts.length
        : 0

      if (freshQuery || currentState.shouldLoadMore) {
        const id = ++requestId.current

        const results = await searchContract({
          state: currentState,
          query,
          filter,
          sort,
          contractType: additionalFilter?.contractType ?? contractType,
          offset: offset,
          limit: CONTRACTS_PER_SEARCH_PAGE,
          topicSlug: topicSlug !== '' ? topicSlug : undefined,
          creatorId: additionalFilter?.creatorId,
        })

        if (id === requestId.current) {
          const newContracts: Contract[] = results.data

          const freshContracts = freshQuery
            ? newContracts
            : [
                ...(currentState.contracts ? currentState.contracts : []),
                ...newContracts,
              ]

          // TODO: When `deleted` is a native supabase column, filter
          // out deleted contracts in backend.
          const freshContractsWithoutDeleted = freshContracts.filter(
            (contract) => !contract.deleted
          )

          const newFuzzyContractOffset =
            results.fuzzyOffset + currentState.fuzzyContractOffset

          const shouldLoadMore =
            newContracts.length === CONTRACTS_PER_SEARCH_PAGE

          setState({
            fuzzyContractOffset: newFuzzyContractOffset,
            contracts: freshContractsWithoutDeleted,
            shouldLoadMore,
          })
          if (freshQuery && isWholePage) window.scrollTo(0, 0)

          return shouldLoadMore
        }
      }
      return false
    }
  )

  const loadMoreContracts = () => queryContracts(state)

  const contracts = state.contracts
    ? uniqBy(
        state.contracts.filter((c) => {
          return (
            !additionalFilter?.excludeContractIds?.includes(c.id) &&
            !additionalFilter?.excludeGroupSlugs?.some((slug) =>
              c.groupSlugs?.includes(slug)
            ) &&
            !additionalFilter?.excludeUserIds?.includes(c.creatorId)
          )
        }),
        'id'
      )
    : undefined

  return {
    contracts,
    loadMoreContracts,
    queryContracts,
  }
}

const useSearchQueryState = (props: {
  defaultSort?: Sort
  defaultFilter?: Filter
  defaultContractType?: ContractTypeType
  defaultSearchType?: SearchType
  useUrlParams?: boolean
}) => {
  const {
    defaultSort = 'score',
    defaultFilter = 'open',
    defaultContractType = 'ALL',
    defaultSearchType = '',
    useUrlParams,
  } = props

  const defaults = {
    [QUERY_KEY]: '',
    [SORT_KEY]: defaultSort,
    [FILTER_KEY]: defaultFilter,
    [CONTRACT_TYPE_KEY]: defaultContractType,
    [TOPIC_KEY]: DEFAULT_TOPIC,
    [SEARCH_TYPE_KEY]: defaultSearchType,
  }

  const useHook = useUrlParams ? usePersistentQueriesState : usePartialUpdater
  const [state, setState] = useHook(defaults)

  return [state, setState, defaults] as const
}

function ContractFilters(props: {
  className?: string
  hideOrderSelector?: boolean
  includeProbSorts?: boolean
  params: SearchParams
  updateParams: (params: Partial<SearchParams>) => void
  showTopicTag?: boolean
}) {
  const {
    className,
    hideOrderSelector,
    includeProbSorts,
    params,
    updateParams,
    showTopicTag,
  } = props

  const { s: sort, f: filter, ct: contractType, topic: topicSlug } = params

  const selectFilter = (selection: Filter) => {
    if (selection === filter) return

    updateParams({ f: selection })
    track('select search filter', { filter: selection })
  }

  const selectSort = (selection: Sort) => {
    if (selection === sort) return

    if (selection === 'close-date') {
      updateParams({ s: selection, f: 'open' })
    } else if (selection === 'resolve-date') {
      updateParams({ s: selection, f: 'resolved' })
    } else {
      updateParams({ s: selection })
    }

    track('select search sort', { sort: selection })
  }

  const selectContractType = (selection: ContractTypeType) => {
    if (selection === contractType) return

    if (selection === 'BOUNTIED_QUESTION' && predictionMarketSorts.has(sort)) {
      updateParams({ s: 'bounty-amount', ct: selection })
    } else if (selection !== 'BOUNTIED_QUESTION' && bountySorts.has(sort)) {
      updateParams({ s: 'score', ct: selection })
    } else {
      updateParams({ ct: selection })
    }
    track('select contract type', { contractType: selection })
  }
  const hideFilter =
    sort === 'resolve-date' ||
    sort === 'close-date' ||
    contractType === 'BOUNTIED_QUESTION'

  const filterLabel = getLabelFromValue(FILTERS, filter)
  const sortLabel = getLabelFromValue(SORTS, sort)
  const contractTypeLabel = getLabelFromValue(CONTRACT_TYPES, contractType)
  const topic = useGroupFromSlug(topicSlug ?? '')
  const setTopic = (slug: string) => updateParams({ [TOPIC_KEY]: slug })

  return (
    <Col
      className={clsx(
        'my-1 items-stretch gap-2 pb-1 pt-px sm:gap-2',
        className
      )}
    >
      <Row className={'h-6 gap-3'}>
        {!hideOrderSelector && (
          <DropdownMenu
            items={generateFilterDropdownItems(
              contractType == 'BOUNTIED_QUESTION'
                ? BOUNTY_MARKET_SORTS
                : contractType == 'POLL'
                ? POLL_SORTS
                : includeProbSorts &&
                  (contractType === 'ALL' || contractType === 'BINARY')
                ? PREDICTION_MARKET_PROB_SORTS
                : PREDICTION_MARKET_SORTS,
              selectSort
            )}
            icon={
              <Row className=" text-ink-500 items-center gap-0.5">
                <span className="whitespace-nowrap text-sm font-medium">
                  {sortLabel}
                </span>
                <ChevronDownIcon className="h-4 w-4" />
              </Row>
            }
            menuWidth={'w-36'}
            menuItemsClass="left-0 right-auto"
            selectedItemName={sortLabel}
            closeOnClick={true}
          />
        )}
        {!hideFilter && (
          <DropdownMenu
            items={generateFilterDropdownItems(FILTERS, selectFilter)}
            icon={
              <Row className="text-ink-500 items-center gap-0.5">
                <span className="whitespace-nowrap text-sm font-medium">
                  {filterLabel}
                </span>
                <ChevronDownIcon className="h-4 w-4" />
              </Row>
            }
            menuItemsClass="left-0 right-auto"
            menuWidth={'w-40'}
            selectedItemName={filterLabel}
            closeOnClick={true}
          />
        )}
        <DropdownMenu
          items={generateFilterDropdownItems(
            CONTRACT_TYPES,
            selectContractType
          )}
          icon={
            <Row className="text-ink-500 items-center gap-0.5">
              <span className="whitespace-nowrap text-sm font-medium">
                {contractTypeLabel}
              </span>
              <ChevronDownIcon className="h-4 w-4" />
            </Row>
          }
          menuWidth={'w-36'}
          menuItemsClass="left-0 right-auto"
          selectedItemName={contractTypeLabel}
          closeOnClick={true}
        />
        {topicSlug == topic?.slug && topic && showTopicTag && (
          <TopicTag
            className={
              'text-primary-500 overflow-x-hidden text-ellipsis !py-0 lg:hidden'
            }
            topic={topic}
            location={'questions page'}
          >
            <button onClick={() => setTopic('')}>
              <XIcon className="hover:text-ink-700 text-ink-400 ml-1  h-4 w-4" />
            </button>
          </TopicTag>
        )}
        {topicSlug === 'for-you' && showTopicTag && (
          <Row
            className={
              'text-primary-500 dark:text-ink-400 hover:text-ink-600 hover:bg-primary-400/10 group items-center justify-center whitespace-nowrap rounded px-1 text-right text-sm transition-colors lg:hidden'
            }
          >
            <span className="mr-px opacity-50 transition-colors group-hover:text-inherit">
              #
            </span>
            ⭐️ For you
            <button onClick={() => setTopic('')}>
              <XIcon className="hover:text-ink-700 text-ink-400 ml-1 h-4 w-4" />
            </button>
          </Row>
        )}
      </Row>
    </Col>
  )
}
