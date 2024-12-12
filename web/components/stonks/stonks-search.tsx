'use client'
import { XIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import { Contract, contractPath, StonkContract } from 'common/contract'
import { LiteGroup } from 'common/group'
import { StonkImage } from 'common/stonk-images'
import { CONTRACTS_PER_SEARCH_PAGE } from 'common/supabase/contracts'
import { ALL_PARENT_TOPICS, TOPICS_TO_SUBTOPICS } from 'common/topics'
import { buildArray } from 'common/util/array'
import { capitalize, sample, uniqBy } from 'lodash'
import Link from 'next/link'
import { ReactNode, useEffect, useRef, useState } from 'react'
import { Button, IconButton } from 'web/components/buttons/button'
import { AddContractToGroupButton } from 'web/components/topics/add-contract-to-group-modal'
import { useDebouncedEffect } from 'web/hooks/use-debounced-effect'
import { useEffectCheckEquality } from 'web/hooks/use-effect-check-equality'
import { useEvent } from 'web/hooks/use-event'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { searchContracts, searchGroups } from 'web/lib/api/api'
import { track, trackCallback } from 'web/lib/service/analytics'
import { searchUsers } from 'web/lib/supabase/users'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { Spacer } from '../layout/spacer'
import {
  CONTRACT_TYPE_KEY,
  ContractTypeType,
  Filter,
  FILTER_KEY,
  GROUP_IDS_KEY,
  PRIZE_MARKET_KEY,
  QUERY_KEY,
  SEARCH_TYPE_KEY,
  SearchParams,
  SearchState,
  SearchType,
  Sort,
  SupabaseAdditionalFilter,
  SWEEPIES_KEY,
  TOPIC_FILTER_KEY,
  useSearchQueryState,
} from '../search'
import { FilterPill } from '../search/filter-pills'
import { Carousel } from '../widgets/carousel'
import { Input } from '../widgets/input'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { StonkPrice } from './StonkValue'
import { StonkBetButton } from './bet/stonk-bet-button'
import { StonkImageUploader } from './StonkImageUploader'
import { useUser } from 'web/hooks/use-user'

const USERS_PER_PAGE = 100
const TOPICS_PER_PAGE = 100

const STONK_SORTS = [
  { label: 'Highest', value: 'prob-descending' },
  { label: 'Lowest', value: 'prob-ascending' },
  { label: 'Popular', value: 'most-popular' },
] as const

const STONK_TOPICS = [
  { label: 'Destiny', value: 'destinygg' },
  { label: 'One Piece', value: 'one-piece-stocks' },
  { label: 'JasonTheWeen', value: 'jasontheween' },
] as const

export function StonksSearch(props: {
  persistPrefix: string
  defaultSort?: Sort
  defaultFilter?: Filter
  defaultContractType?: ContractTypeType
  defaultSearchType?: SearchType
  defaultForYou?: '1' | '0'
  additionalFilter?: SupabaseAdditionalFilter
  highlightContractIds?: string[]
  onContractClick?: (contract: Contract) => void
  hideActions?: boolean
  hideSweepsToggle?: boolean
  headerClassName?: string
  isWholePage?: boolean
  // used to determine if search params should be updated in the URL
  useUrlParams?: boolean
  autoFocus?: boolean
  emptyState?: ReactNode
  hideSearch?: boolean
  hideContractFilters?: boolean
  topicSlug?: string
  contractsOnly?: boolean
  hideSearchTypes?: boolean
  hideAvatars?: boolean
  initialTopics?: LiteGroup[]
  showTopicsFilterPills?: boolean
}) {
  const {
    defaultSort,
    defaultFilter,
    defaultContractType,
    defaultSearchType,
    defaultForYou,
    additionalFilter,
    onContractClick,
    hideActions,
    hideSweepsToggle,
    highlightContractIds,
    headerClassName,
    persistPrefix,
    isWholePage,
    useUrlParams,
    autoFocus,
    hideContractFilters,
    topicSlug = '',
    contractsOnly,
    hideSearch,
    hideSearchTypes,
    hideAvatars,
    showTopicsFilterPills,
  } = props

  const isMobile = useIsMobile()
  const [searchParams, setSearchParams, isReady] = useSearchQueryState({
    defaultSort,
    defaultFilter,
    defaultContractType,
    defaultSearchType,
    defaultForYou,
    useUrlParams,
    persistPrefix,
    defaultSweepies: '0',
  })

  const query = searchParams[QUERY_KEY]
  const searchType = searchParams[SEARCH_TYPE_KEY]
  const filter = searchParams[FILTER_KEY]
  const contractType = searchParams[CONTRACT_TYPE_KEY]
  const prizeMarketState = searchParams[PRIZE_MARKET_KEY]
  const sweepiesState = searchParams[SWEEPIES_KEY]
  const groupIds = searchParams[GROUP_IDS_KEY]

  const showSearchTypes = !!query && !hideSearchTypes && !contractsOnly
  const [images, setImages] = useState<StonkImage[]>([])
  const [error, setError] = useState<string | null>(null)
  const user = useUser()

  const {
    contracts,
    users,
    topics,
    loading,
    shouldLoadMore,
    querySearchResults,
  } = useSearchResults(
    persistPrefix,
    searchParams,
    showSearchTypes,
    topicSlug,
    additionalFilter,
    hideSweepsToggle
  )

  useEffectCheckEquality(() => {
    const fetchStonks = async () => {
      try {
        const stonkImages = await api('get-stonk-images', {
          contracts: contracts ? contracts.map((c) => c.id) : [],
        })
        setImages(stonkImages.images)
      } catch (e) {
        setError('Failed to load stonks')
        console.error(e)
      }
    }
    fetchStonks()
  }, [contracts])

  const onChange = (changes: Partial<SearchParams>) => {
    const updatedParams = { ...changes }

    setSearchParams(updatedParams)
    if (isWholePage) window.scrollTo(0, 0)
  }

  const setQuery = (query: string) => onChange({ [QUERY_KEY]: query })

  const showContractFilters = !hideContractFilters
  console.log('contracts', contracts)

  useDebouncedEffect(
    () => {
      if (isReady) {
        querySearchResults(true)
      }
    },
    50,
    [topicSlug, isReady, JSON.stringify(searchParams)]
  )

  const emptyContractsState =
    props.emptyState ??
    (filter !== 'all' ||
    contractType !== 'ALL' ||
    prizeMarketState === '1' ||
    sweepiesState === '1' ? (
      <Col className="mt-2 items-center gap-3">
        <span className="text-ink-700 text-center">
          No stonks found under this filter.
        </span>
        <Col className="gap-2">
          <Button
            onClick={() =>
              onChange({
                [FILTER_KEY]: 'all',
                [CONTRACT_TYPE_KEY]: 'ALL',
                [TOPIC_FILTER_KEY]: '',
                p: '0',
              })
            }
            color="gray-outline"
          >
            Clear filter
          </Button>
        </Col>
      </Col>
    ) : query ? (
      <NoResults />
    ) : (
      <Col className="text-ink-700 mx-2 my-6 text-center">
        No questions yet.
        {topicSlug && (
          <Row className={'mt-2 w-full items-center justify-center'}>
            <AddContractToGroupButton groupSlug={topicSlug} />
          </Row>
        )}
      </Col>
    ))

  const hasQuery = query !== ''
  const selectedTopic = groupIds
    ? ALL_PARENT_TOPICS.find((topic) =>
        TOPICS_TO_SUBTOPICS[topic].some((subtopic) =>
          groupIds.split(',').some((id) => subtopic.groupIds.includes(id))
        )
      )
    : undefined

  console.log(selectedTopic)
  return (
    <Col className="w-full">
      <Col
        className={clsx(
          'sticky top-0 z-20',
          !headerClassName && ' bg-canvas-50',
          headerClassName
        )}
      >
        {!hideSearch && (
          <Row className="relative w-full">
            <Input
              type="text"
              inputMode="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onBlur={trackCallback('search', { query: query })}
              placeholder={
                searchType === 'Users'
                  ? 'Search users'
                  : searchType === 'Questions' || contractsOnly
                  ? 'Search questions'
                  : isMobile
                  ? 'Search'
                  : 'Search questions, users, and topics'
              }
              className={clsx('w-full')}
              style={{
                paddingRight: hasQuery ? '40px' : '0px',
              }}
              autoFocus={autoFocus}
            />
            <Row className="absolute right-2 top-1/2 -translate-y-1/2">
              {hasQuery && (
                <IconButton
                  size={'2xs'}
                  onClick={() => {
                    onChange({ [QUERY_KEY]: '' })
                  }}
                >
                  {loading ? (
                    <LoadingIndicator size="sm" />
                  ) : (
                    <XIcon className={'h-5 w-5 rounded-full'} />
                  )}
                </IconButton>
              )}
            </Row>
          </Row>
        )}

        <Col className="mb-2">
          {/* Main topics row */}

          <Carousel fadeEdges labelsParentClassName="gap-1 items-center">
            {STONK_TOPICS.map((topic) => (
              <FilterPill
                key={topic.value}
                selected={selectedTopic === topic.value}
                onSelect={() => {
                  if (selectedTopic === topic.value) {
                    onChange({ [GROUP_IDS_KEY]: '' })
                  } else {
                    onChange({ [GROUP_IDS_KEY]: topic.value })
                  }
                  //   } else {
                  //     track('select search topic', { topic })
                  //     // Join all group IDs for this topic's subtopics
                  //     const allGroupIds = TOPICS_TO_SUBTOPICS[topic.value]
                  //       .map((subtopic) => subtopic.groupIds)
                  //       .flat()
                  //     onChange({ [GROUP_IDS_KEY]: allGroupIds.join(',') })
                  //   }
                }}
              >
                {topic.label}
              </FilterPill>
            ))}
          </Carousel>

          {/* Subtopics row */}
          {selectedTopic && (
            <Carousel fadeEdges labelsParentClassName="gap-1 mt-1">
              {TOPICS_TO_SUBTOPICS[selectedTopic].map(({ name, groupIds }) => (
                <FilterPill
                  key={name}
                  selected={searchParams[GROUP_IDS_KEY] === groupIds.join(',')}
                  onSelect={() => {
                    if (searchParams[GROUP_IDS_KEY] === groupIds.join(',')) {
                      onChange({
                        [GROUP_IDS_KEY]: TOPICS_TO_SUBTOPICS[selectedTopic]
                          .map((subtopic) => subtopic.groupIds)
                          .flat()
                          .join(','),
                      })
                    } else {
                      track('select search subtopic', { subtopic: name })
                      onChange({ [GROUP_IDS_KEY]: groupIds.join(',') })
                    }
                  }}
                >
                  {name}
                </FilterPill>
              ))}
            </Carousel>
          )}
        </Col>
      </Col>
      <Spacer h={2} />

      {!contracts ? (
        <LoadingResults />
      ) : contracts.length === 0 ? (
        emptyContractsState
      ) : (
        <>
          {contracts.map((stonk: StonkContract, index) => {
            const image = images.find((i) => i.contractId === stonk.id)
            const cleanQuestion = (question: string) => {
              return (
                question
                  // Remove "Stock", "stock", with optional special characters around them
                  .replace(/[^\w\s]?stock[^\w\s]?/gi, '')
                  // Remove "(Permanent)" or "[Permanent]" with optional special characters
                  .replace(/[^\w\s]?\(permanent\)[^\w\s]?/gi, '')
                  .replace(/[^\w\s]?\[permanent\][^\w\s]?/gi, '')
                  .trim()
              )
            }

            return (
              <Row
                key={stonk.id}
                className="hover:bg-ink-100 w-full flex-wrap items-center rounded-lg p-4 transition-colors"
              >
                <div className="text-ink-500 mr-4 w-6 text-lg font-semibold sm:w-8 sm:text-xl">
                  {index + 1}
                </div>
                {image?.imageUrl ? (
                  <img
                    src={image.imageUrl}
                    alt={cleanQuestion(stonk.question)}
                    className="mr-4 h-16 w-16 shrink-0 rounded-lg object-cover shadow-sm sm:h-20 sm:w-20"
                  />
                ) : (
                  <StonkImageUploader
                    stonkId={stonk.id}
                    onImageUploaded={(imageUrl) => {
                      setImages([...images, { contractId: stonk.id, imageUrl }])
                    }}
                  />
                )}
                <Col className="min-w-0 flex-1 gap-2">
                  <div className="flex flex-col items-center sm:flex-row sm:justify-between sm:gap-2">
                    <Link
                      href={contractPath(stonk)}
                      className="break-words font-semibold hover:text-indigo-500 hover:underline"
                    >
                      {cleanQuestion(stonk.question)}
                    </Link>
                    <div className="text-ink-500 whitespace-nowrap text-xs sm:text-sm">
                      {stonk.uniqueBettorCount ?? 0} traders
                    </div>
                  </div>

                  <Row className="flex-wrap items-center justify-between gap-2">
                    <StonkPrice contract={stonk} />
                    <StonkBetButton contract={stonk} user={user} />
                  </Row>
                </Col>
              </Row>
            )
          })}
        </>
      )}
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

  return (
    <span className="text-ink-700 mx-2 my-6 text-center">
      {capitalize(message)}
    </span>
  )
}

const LoadingResults = () => {
  return (
    <Col className="w-full">
      <LoadingIndicator />
    </Col>
  )
}

const FRESH_SEARCH_CHANGED_STATE: SearchState = {
  contracts: undefined,
  users: undefined,
  topics: undefined,
  shouldLoadMore: true,
}

const useSearchResults = (
  persistPrefix: string,
  searchParams: SearchParams,
  showSearchTypes: boolean,
  topicSlug: string,
  additionalFilter?: SupabaseAdditionalFilter,
  hideSweepsToggle?: boolean
) => {
  const [state, setState] = usePersistentInMemoryState<SearchState>(
    FRESH_SEARCH_CHANGED_STATE,
    `${persistPrefix}-supabase-contract-search`
  )
  const [loading, setLoading] = useState(false)

  const requestId = useRef(0)

  const querySearchResults = useEvent(
    async (freshQuery?: boolean, contractsOnly?: boolean) => {
      const {
        q: query,
        s: sort,
        f: filter,
        ct: contractType,
        p: isPrizeMarketString,
        fy: forYou,
        mt: marketTier,
        tf: topicFilter,
        sw: isSweepiesString,
        gids,
      } = searchParams
      // if fresh query and the search params haven't changed (like user clicked back) do nothing
      if (
        freshQuery &&
        query === state.lastSearchParams?.query &&
        sort === state.lastSearchParams?.sort &&
        filter === state.lastSearchParams?.filter &&
        contractType === state.lastSearchParams?.contractType &&
        topicSlug === state.lastSearchParams?.topicSlug &&
        topicSlug !== 'recent' &&
        isPrizeMarketString == state.lastSearchParams?.isPrizeMarket &&
        forYou == state.lastSearchParams?.forYou &&
        marketTier == state.lastSearchParams?.marketTier &&
        topicFilter == state.lastSearchParams?.topicFilter &&
        isSweepiesString == state.lastSearchParams?.isSweepies &&
        gids == state.lastSearchParams?.gids
      ) {
        return state.shouldLoadMore
      }

      const includeUsersAndTopics = !contractsOnly && showSearchTypes

      if (freshQuery || state.shouldLoadMore) {
        const id = ++requestId.current
        let timeoutId: NodeJS.Timeout | undefined
        if (freshQuery) {
          timeoutId = setTimeout(() => {
            if (id === requestId.current) {
              setLoading(true)
            }
          }, 500)
        }

        try {
          const searchPromises: Promise<any>[] = [
            searchContracts({
              term: query,
              filter,
              sort,
              contractType,
              offset: freshQuery ? 0 : state.contracts?.length ?? 0,
              limit: CONTRACTS_PER_SEARCH_PAGE,
              topicSlug:
                topicSlug !== ''
                  ? topicSlug
                  : topicFilter !== ''
                  ? topicFilter
                  : undefined,
              creatorId: additionalFilter?.creatorId,
              isPrizeMarket: isPrizeMarketString,
              marketTier,
              forYou,
              token: hideSweepsToggle
                ? 'ALL'
                : isSweepiesString === '1'
                ? 'CASH'
                : 'MANA',
              gids,
            }),
          ]

          if (includeUsersAndTopics) {
            searchPromises.push(
              searchUsers(query, USERS_PER_PAGE),
              searchGroups({
                term: query,
                limit: TOPICS_PER_PAGE,
                type: 'lite',
              })
            )
          }

          const results = await Promise.all(searchPromises)

          if (id === requestId.current) {
            const newContracts = results[0]
            const newUsers = results[1]
            const newTopics = results[2]
            const freshContracts = freshQuery
              ? newContracts
              : buildArray(state.contracts, newContracts)

            const shouldLoadMore =
              newContracts.length === CONTRACTS_PER_SEARCH_PAGE

            setState({
              contracts: freshContracts,
              users: includeUsersAndTopics ? newUsers : state.users,
              topics: includeUsersAndTopics ? newTopics.lite : state.topics,
              shouldLoadMore,
              lastSearchParams: {
                query,
                sort,
                filter,
                contractType,
                topicSlug,
                isPrizeMarket: isPrizeMarketString,
                forYou,
                marketTier,
                topicFilter,
                isSweepies: isSweepiesString,
                gids,
              },
            })
            clearTimeout(timeoutId)
            setLoading(false)

            return shouldLoadMore
          }
        } catch (error) {
          console.error('Error fetching search results:', error)
          setLoading(false)
        }
      }
      return false
    }
  )

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
    users: state.users,
    topics: state.topics,
    loading,
    shouldLoadMore: state.shouldLoadMore,
    querySearchResults,
  }
}
