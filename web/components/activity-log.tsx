import { Menu, MenuItem, MenuItems, Transition } from '@headlessui/react'
import { ChevronDownIcon, PencilIcon, XIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { DisplayUser } from 'common/api/user-types'
import { ContractComment } from 'common/comment'
import { Contract, MarketContract } from 'common/contract'
import { DESTINY_GROUP_SLUG } from 'common/envs/constants'
import { Group } from 'common/group'
import { buildArray, filterDefined } from 'common/util/array'
import {
  groupBy,
  keyBy,
  orderBy,
  partition,
  range,
  sortBy,
  uniq,
  uniqBy,
} from 'lodash'
import {
  Dispatch,
  Fragment,
  ReactNode,
  SetStateAction,
  memo,
  useEffect,
  useRef,
  useState,
} from 'react'
import {
  useBetsOnce,
  useSubscribeGlobalBets,
} from 'client-common/hooks/use-bets'
import { usePersistentInMemoryState } from 'client-common/hooks/use-persistent-in-memory-state'
import {
  useGlobalComments,
  useSubscribeGlobalComments,
} from 'web/hooks/use-comments'
import {
  usePublicContracts,
  useLiveAllNewContracts,
} from 'web/hooks/use-contract'
import {
  usePrivateUser,
  useShouldBlockDestiny,
  useUser,
} from 'web/hooks/use-user'
import { ContractMention } from './contract/contract-mention'
import { FeedBet } from './feed/feed-bets'
import { Col } from './layout/col'
import { Row } from './layout/row'
import { RelativeTimestamp } from './relative-timestamp'
import { Avatar } from './widgets/avatar'
import { Content } from './widgets/editor'
import DropdownMenu from './widgets/dropdown-menu'
import { Input } from './widgets/input'
import { LoadingIndicator } from './widgets/loading-indicator'
import ShortToggle from './widgets/short-toggle'
import { UserLink } from './widgets/user-link'
import { track } from 'web/lib/service/analytics'
import { getRecentCommentsOnContracts } from 'web/lib/supabase/comments'
import { getRecentActiveContractsOnTopics } from 'web/lib/supabase/contracts'
import { Bet } from 'common/bet'
import { UserHovercard } from './user/user-hovercard'
import { api } from 'web/lib/api/api'
import { useDisplayUserById } from 'web/hooks/use-user-supabase'
import generateFilterDropdownItems from './search/search-dropdown-helpers'
import { TopicSelector } from './topics/topic-selector'

export function ActivityLog(props: {
  count: number
  className?: string
  topicSlugs?: string[]
  blockedUserIds?: string[]
  hideQuestions?: boolean
  showHideApiTrades?: boolean
  showTopicFilter?: boolean
  selectedTopic?: Group
  onSelectTopic?: (topic: Group) => void
  onClearTopic?: () => void
}) {
  const {
    count,
    topicSlugs,
    hideQuestions,
    className,
    showHideApiTrades,
    showTopicFilter,
    selectedTopic,
    onSelectTopic,
    onClearTopic,
  } = props

  const privateUser = usePrivateUser()
  const user = useUser()
  const shouldBlockDestiny = useShouldBlockDestiny(user?.id)

  const blockedGroupSlugs = buildArray(
    privateUser?.blockedGroupSlugs ?? [],
    shouldBlockDestiny && DESTINY_GROUP_SLUG
  ).filter((t) => !topicSlugs?.includes(t))
  const blockedContractIds = privateUser?.blockedContractIds ?? []
  const blockedUserIds = (privateUser?.blockedUserIds ?? []).concat(
    props.blockedUserIds ?? []
  )

  const [pill, setPill] = useState<PillOptions>('all')
  const [hideApiTrades, setHideApiTrades] = usePersistentInMemoryState(
    false,
    'live-hide-api-trades'
  )
  const effectiveHideApiTrades = showHideApiTrades && hideApiTrades

  const [minAmountFilterIndex, setMinAmountFilterIndex] =
    usePersistentInMemoryState(0, 'live-bet-amount-filter')
  const minAmountOptions = [
    { label: 'Any amount', value: undefined },
    { label: 'M$100+', value: 100 },
    { label: 'M$1,000+', value: 1000 },
    { label: 'M$10,000+', value: 10000 },
  ]
  const selectedMinAmount = showHideApiTrades
    ? minAmountOptions[minAmountFilterIndex].value
    : undefined

  const [selectedUser, setSelectedUser] = useState<DisplayUser | undefined>()
  const [userSearchTerm, setUserSearchTerm] = useState('')
  const [isEditingUserFilter, setIsEditingUserFilter] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const [searchedUsers, setSearchedUsers] = useState<DisplayUser[]>([])
  const userSearchInputRef = useRef<HTMLInputElement>(null)
  const searchRequestId = useRef(0)
  const selectedUserId = showHideApiTrades ? selectedUser?.id : undefined

  const [recentTopicalBets, setRecentTopicalBets] = useState<Bet[]>()
  const [recentTopicalComments, setRecentTopicalComments] =
    useState<ContractComment[]>()
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setHighlightedIndex(-1)
    if (!userSearchTerm) {
      setSearchedUsers([])
      return
    }
    const requestId = ++searchRequestId.current
    api('search-users', {
      term: userSearchTerm,
      limit: 5,
    }).then((results) => {
      if (requestId === searchRequestId.current) {
        setSearchedUsers(results)
      }
    })
  }, [userSearchTerm])

  useEffect(() => {
    if (isEditingUserFilter && userSearchInputRef.current) {
      userSearchInputRef.current.focus()
    }
  }, [isEditingUserFilter])

  const selectUser = (user: DisplayUser) => {
    setSelectedUser(user)
    setUserSearchTerm('')
    setIsEditingUserFilter(false)
    setHighlightedIndex(-1)
    track('select-live-bet-user-filter', {
      userId: user.id,
      userName: user.name,
    })
  }

  const getRecentTopicalContent = async (topicSlugs: string[]) => {
    setLoading(true)
    const recentContracts = await getRecentActiveContractsOnTopics(
      topicSlugs,
      blockedGroupSlugs,
      count
    )
    const recentContractIds = recentContracts.map((c) => c.id)
    const recentBets = await api('bets', {
      contractId: recentContractIds,
      limit: count * 3,
      filterRedemptions: true,
      order: 'desc',
      excludeApi: effectiveHideApiTrades,
      minAmount: selectedMinAmount,
      userId: selectedUserId,
    })
    const recentComments = await getRecentCommentsOnContracts(
      recentContractIds,
      count
    )
    setRecentTopicalBets(recentBets)
    setRecentTopicalComments(recentComments)
    setLoading(false)
  }

  const topicSlugsKey = topicSlugs?.join(',')
  useEffect(() => {
    if (topicSlugs) getRecentTopicalContent(topicSlugs)
  }, [topicSlugsKey, effectiveHideApiTrades, selectedMinAmount, selectedUserId])

  const recentBets = useBetsOnce((params) => api('bets', params), {
    limit: count * 3,
    filterRedemptions: true,
    order: 'desc',
    excludeApi: effectiveHideApiTrades,
    minAmount: selectedMinAmount,
    userId: selectedUserId,
  })
  const allRealtimeBets = useSubscribeGlobalBets({
    filterRedemptions: true,
    excludeApi: effectiveHideApiTrades,
    minAmount: selectedMinAmount,
    userId: selectedUserId,
  })
  const realtimeBets = sortBy(allRealtimeBets, 'createdTime')
    .reverse()
    .slice(0, count * 3)

  const recentComments = useGlobalComments(count * 3)
  const realtimeComments = useSubscribeGlobalComments()

  const newContracts = useLiveAllNewContracts(count * 3)?.filter(
    (c) =>
      !blockedContractIds.includes(c.id) &&
      !blockedUserIds.includes(c.creatorId) &&
      c.visibility === 'public' &&
      (!c.groupSlugs?.some((slug) => blockedGroupSlugs.includes(slug)) ||
        true) &&
      (topicSlugs?.some((s) => c.groupSlugs?.includes(s)) ?? true)
  )
  const bets = uniqBy(
    [
      ...(realtimeBets ?? []),
      ...(recentTopicalBets ?? []),
      ...(recentBets ?? []),
    ],
    'id'
  ).filter(
    (bet) =>
      !blockedContractIds.includes(bet.contractId) &&
      !blockedUserIds.includes(bet.userId) &&
      (!effectiveHideApiTrades || !bet.isApi) &&
      (!selectedMinAmount || Math.abs(bet.amount) >= selectedMinAmount) &&
      (!selectedUserId || bet.userId === selectedUserId)
  )
  const comments = uniqBy(
    [
      ...(realtimeComments ?? []),
      ...(recentTopicalComments ?? []),
      ...(recentComments ?? []),
    ],
    'id'
  ).filter(
    (c) =>
      c.commentType === 'contract' &&
      !blockedContractIds.includes(c.contractId) &&
      !blockedUserIds.includes(c.userId)
  )

  const activeContractIds = uniq([
    ...bets.map((b) => b.contractId),
    ...comments.map((c) => c.contractId),
  ])

  const activeContracts = usePublicContracts(
    activeContractIds,
    topicSlugs,
    blockedGroupSlugs
  )?.filter((c) =>
    c.groupSlugs
      ? (topicSlugs?.some((s) => c.groupSlugs?.includes(s)) ?? true) &&
        !c.groupSlugs.some((slug) => blockedGroupSlugs.includes(slug))
      : true
  )

  const [contracts, _unlistedContracts] = partition(
    filterDefined(activeContracts ?? []).concat(newContracts ?? []),
    (c) => c.visibility === 'public'
  )
  const contractsById = keyBy(contracts, 'id')

  const items = sortBy(
    pill === 'all'
      ? [...bets, ...comments, ...(newContracts ?? [])]
      : pill === 'comments'
      ? comments
      : pill === 'trades'
      ? bets
      : newContracts ?? [],
    (i) => i.createdTime
  )
    .reverse()
    .filter((i) =>
      // filter out comments and bets on ignored/off-topic contracts
      'contractId' in i ? contractsById[i.contractId] : true
    )

  const startIndex =
    range(0, items.length - count).find((i) =>
      items
        .slice(i, i + count)
        .every((item) =>
          'contractId' in item ? contractsById[item.contractId] : true
        )
    ) ?? 0
  const itemsSubset = items.slice(startIndex, startIndex + count)
  const allLoaded =
    realtimeBets &&
    realtimeComments &&
    contracts &&
    activeContracts &&
    itemsSubset.every((item) =>
      'contractId' in item ? contractsById[item.contractId] : true
    )

  const showTradeFilters = showHideApiTrades && pill === 'trades'

  const groups = orderBy(
    Object.entries(
      groupBy(itemsSubset, (item) =>
        'contractId' in item ? item.contractId : item.id
      )
    ).map(([parentId, items]) => ({
      parentId,
      items,
    })),
    ({ items }) =>
      // get the largest createdTime of any item in the group
      Math.max(...items.map((item) => item.createdTime)),
    'desc'
  )

  return (
    <Col className={clsx('gap-4', className)}>
      <LivePillOptions
        pill={pill}
        setPill={setPill}
        hideQuestions={hideQuestions}
      >
        {loading && <LoadingIndicator size="sm" />}
      </LivePillOptions>
      {showTopicFilter && onSelectTopic && onClearTopic && (
        <LiveTopicFilter
          selectedTopic={selectedTopic}
          onSelectTopic={onSelectTopic}
          onClearTopic={onClearTopic}
        />
      )}
      {showTradeFilters && (
        <LiveTradeFilters
          minAmountOptions={minAmountOptions}
          minAmountFilterIndex={minAmountFilterIndex}
          setMinAmountFilterIndex={setMinAmountFilterIndex}
          selectedUser={selectedUser}
          setSelectedUser={setSelectedUser}
          userSearchTerm={userSearchTerm}
          setUserSearchTerm={setUserSearchTerm}
          isEditingUserFilter={isEditingUserFilter}
          setIsEditingUserFilter={setIsEditingUserFilter}
          highlightedIndex={highlightedIndex}
          setHighlightedIndex={setHighlightedIndex}
          searchedUsers={searchedUsers}
          userSearchInputRef={userSearchInputRef}
          selectUser={selectUser}
          hideApiTrades={hideApiTrades}
          setHideApiTrades={setHideApiTrades}
        />
      )}
      {!allLoaded && <LoadingIndicator />}
      {allLoaded && (
        <Col className="gap-0.5">
          {groups.length === 0 ? (
            <div className="text-ink-500 py-8 text-center text-sm">
              {pill === 'trades'
                ? 'No trades found with the selected filters.'
                : 'No activity found.'}
            </div>
          ) : (
            groups.map(({ parentId, items }) => {
              const contract = contractsById[parentId] as Contract

              return (
                <Col key={parentId} className="bg-canvas-0 gap-2 px-4 py-3">
                  <ContractMention contract={contract} />
                  {items.map((item) =>
                    'amount' in item ? (
                      <FeedBet
                        className="!pt-0"
                        key={item.id}
                        contract={contract as MarketContract}
                        bet={item}
                        avatarSize="xs"
                      />
                    ) : 'question' in item ? (
                      <MarketCreatedLog key={item.id} contract={item} />
                    ) : 'channelId' in item ? null : (
                      <CommentLog key={item.id} comment={item} />
                    )
                  )}
                </Col>
              )
            })
          )}
        </Col>
      )}
    </Col>
  )
}

type PillOptions = 'all' | 'questions' | 'comments' | 'trades'
const LivePillOptions = (props: {
  pill: PillOptions
  setPill: (pill: PillOptions) => void
  hideQuestions?: boolean
  children?: ReactNode
}) => {
  const { pill, setPill, hideQuestions, children } = props

  const selectPill = (pill: PillOptions) => {
    setPill(pill)
    track('select live feed pill', { pill })
  }

  const tabs = buildArray(
    { pill: 'all' as const, label: 'All' },
    !hideQuestions && { pill: 'questions' as const, label: 'Questions' },
    { pill: 'comments' as const, label: 'Comments' },
    { pill: 'trades' as const, label: 'Trades' }
  )

  return (
    <Row
      role="tablist"
      aria-label="Live activity type"
      className="border-ink-200 mx-2 items-center gap-4 border-b sm:mx-0"
    >
      {tabs.map((tab) => (
        <button
          key={tab.pill}
          type="button"
          role="tab"
          aria-selected={pill === tab.pill}
          onClick={() => selectPill(tab.pill)}
          className={clsx(
            pill === tab.pill
              ? 'border-primary-500 text-primary-600'
              : 'text-ink-500 hover:text-ink-700 border-transparent',
            '-mb-px border-b-2 px-1 py-2 text-sm font-medium transition-colors'
          )}
        >
          {tab.label}
        </button>
      ))}
      {children && <Row className="ml-auto items-center">{children}</Row>}
    </Row>
  )
}

const LiveTopicFilter = (props: {
  selectedTopic?: Group
  onSelectTopic: (topic: Group) => void
  onClearTopic: () => void
}) => {
  const { selectedTopic, onSelectTopic, onClearTopic } = props

  return (
    <Row className="bg-canvas-50 mx-2 flex-wrap items-center gap-3 rounded-lg px-3 py-2 sm:mx-0 sm:px-4">
      <span className="text-ink-500 text-xs font-medium uppercase tracking-wide">
        Topic
      </span>
      {selectedTopic && (
        <Row className="bg-primary-100 dark:bg-primary-900/30 border-primary-200 dark:border-primary-700/50 items-center gap-1.5 rounded-full border py-0.5 pl-2 pr-1">
          <span className="text-ink-900 max-w-48 truncate text-sm font-medium">
            {selectedTopic.name}
          </span>
          <button
            onClick={onClearTopic}
            className="text-ink-500 hover:text-ink-700 hover:bg-primary-200 dark:hover:bg-primary-800/50 rounded-full p-0.5 transition-colors"
            aria-label="Clear topic filter"
          >
            <XIcon className="h-3.5 w-3.5" />
          </button>
        </Row>
      )}
      <TopicSelector
        addingToContract={false}
        setSelectedGroup={onSelectTopic}
        className="!w-44 shrink-0 sm:!w-56"
        placeholder={selectedTopic ? 'Change topic' : 'Filter by topic'}
      />
    </Row>
  )
}

const LiveTradeFilters = (props: {
  minAmountOptions: { label: string; value?: number }[]
  minAmountFilterIndex: number
  setMinAmountFilterIndex: (index: number) => void
  selectedUser: DisplayUser | undefined
  setSelectedUser: Dispatch<SetStateAction<DisplayUser | undefined>>
  userSearchTerm: string
  setUserSearchTerm: Dispatch<SetStateAction<string>>
  isEditingUserFilter: boolean
  setIsEditingUserFilter: Dispatch<SetStateAction<boolean>>
  highlightedIndex: number
  setHighlightedIndex: Dispatch<SetStateAction<number>>
  searchedUsers: DisplayUser[]
  userSearchInputRef: { current: HTMLInputElement | null }
  selectUser: (user: DisplayUser) => void
  hideApiTrades: boolean
  setHideApiTrades: (enabled: boolean) => void
}) => {
  const {
    minAmountOptions,
    minAmountFilterIndex,
    setMinAmountFilterIndex,
    selectedUser,
    setSelectedUser,
    userSearchTerm,
    setUserSearchTerm,
    isEditingUserFilter,
    setIsEditingUserFilter,
    highlightedIndex,
    setHighlightedIndex,
    searchedUsers,
    userSearchInputRef,
    selectUser,
    hideApiTrades,
    setHideApiTrades,
  } = props

  return (
    <Row className="bg-canvas-50 mx-2 flex-wrap items-center gap-3 rounded-lg px-3 py-2 sm:mx-0 sm:gap-4 sm:px-4">
      <Row className="items-center gap-1.5">
        <span className="text-ink-500 text-xs font-medium uppercase tracking-wide">
          Amount
        </span>
        <DropdownMenu
          items={generateFilterDropdownItems(
            minAmountOptions.map((option, i) => ({
              label: option.label,
              value: i.toString(),
            })),
            (value: string) => {
              const newIndex = parseInt(value)
              setMinAmountFilterIndex(newIndex)
              track('change-live-bet-amount-filter', {
                minAmount: minAmountOptions[newIndex].value,
              })
            }
          )}
          buttonContent={
            <Row className="text-ink-900 items-center gap-1 text-sm font-medium">
              <span className="whitespace-nowrap">
                {minAmountOptions[minAmountFilterIndex].label}
              </span>
              <ChevronDownIcon className="text-ink-400 h-4 w-4" />
            </Row>
          }
          menuWidth={'w-36'}
          selectedItemName={minAmountOptions[minAmountFilterIndex].label}
          closeOnClick
        />
      </Row>

      <div className="bg-ink-300 hidden h-4 w-px sm:block" />

      <Row className="items-center gap-1.5">
        <span className="text-ink-500 text-xs font-medium uppercase tracking-wide">
          Trader
        </span>
        {selectedUser ? (
          <Row className="bg-primary-100 dark:bg-primary-900/30 border-primary-200 dark:border-primary-700/50 items-center gap-1.5 rounded-full border py-0.5 pl-1 pr-2">
            <Avatar
              username={selectedUser.username}
              avatarUrl={selectedUser.avatarUrl}
              size="2xs"
              noLink
            />
            <span className="text-ink-900 max-w-24 truncate text-sm font-medium sm:max-w-none">
              {selectedUser.name}
            </span>
            <button
              onClick={() => {
                setSelectedUser(undefined)
                track('clear-live-bet-user-filter')
              }}
              className="text-ink-500 hover:text-ink-700 hover:bg-primary-200 dark:hover:bg-primary-800/50 -mr-1 rounded-full p-0.5 transition-colors"
            >
              <XIcon className="h-3.5 w-3.5" />
            </button>
          </Row>
        ) : isEditingUserFilter ? (
          <div className="relative">
            <Row className="items-center gap-1">
              <Input
                ref={userSearchInputRef}
                type="text"
                placeholder="Search traders..."
                className="h-7 w-32 text-sm sm:w-40"
                value={userSearchTerm}
                onChange={(e) => setUserSearchTerm(e.target.value)}
                onBlur={() => {
                  setTimeout(() => {
                    if (!userSearchTerm) {
                      setIsEditingUserFilter(false)
                    }
                  }, 200)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setUserSearchTerm('')
                    setIsEditingUserFilter(false)
                    setHighlightedIndex(-1)
                  } else if (e.key === 'ArrowDown') {
                    e.preventDefault()
                    const maxIndex = (searchedUsers?.length ?? 0) - 1
                    setHighlightedIndex((prev) =>
                      prev < maxIndex ? prev + 1 : 0
                    )
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault()
                    const maxIndex = (searchedUsers?.length ?? 0) - 1
                    setHighlightedIndex((prev) =>
                      prev > 0 ? prev - 1 : maxIndex
                    )
                  } else if (e.key === 'Enter') {
                    e.preventDefault()
                    if (
                      highlightedIndex >= 0 &&
                      searchedUsers &&
                      searchedUsers[highlightedIndex]
                    ) {
                      selectUser(searchedUsers[highlightedIndex])
                    }
                  }
                }}
              />
              <button
                onClick={() => {
                  setUserSearchTerm('')
                  setIsEditingUserFilter(false)
                }}
                className="text-ink-400 hover:text-ink-600 hover:bg-ink-200 rounded-full p-1 transition-colors"
              >
                <XIcon className="h-4 w-4" />
              </button>
            </Row>
            <Menu as="div" className="relative z-20">
              {userSearchTerm.length > 0 && searchedUsers.length > 0 && (
                <Transition
                  show={userSearchTerm.length > 0 && searchedUsers.length > 0}
                  as={Fragment}
                  enter="transition ease-out duration-100"
                  enterFrom="transform opacity-0 scale-95"
                  enterTo="transform opacity-100 scale-100"
                  leave="transition ease-in duration-75"
                  leaveFrom="transform opacity-100 scale-100"
                  leaveTo="transform opacity-0 scale-95"
                >
                  <MenuItems
                    static
                    className="divide-ink-100 bg-canvas-0 ring-ink-200 absolute left-0 mt-1 w-52 origin-top-left cursor-pointer divide-y rounded-lg shadow-lg ring-1 focus:outline-none"
                  >
                    <div className="py-1">
                      {searchedUsers.map((user, index) => (
                        <MenuItem key={user.id}>
                          <button
                            className={clsx(
                              'group flex w-full items-center gap-2.5 px-3 py-2 text-sm transition-colors',
                              highlightedIndex === index
                                ? 'bg-primary-100 dark:bg-primary-900/30'
                                : 'hover:bg-ink-50'
                            )}
                            onClick={() => selectUser(user)}
                            onMouseEnter={() => setHighlightedIndex(index)}
                          >
                            <Avatar
                              username={user.username}
                              avatarUrl={user.avatarUrl}
                              size="xs"
                              noLink
                            />
                            <span className="text-ink-900 truncate font-medium">
                              {user.name}
                            </span>
                          </button>
                        </MenuItem>
                      ))}
                    </div>
                  </MenuItems>
                </Transition>
              )}
            </Menu>
          </div>
        ) : (
          <button
            onClick={() => setIsEditingUserFilter(true)}
            className="text-ink-900 hover:bg-ink-100 flex items-center gap-1 rounded-md px-2 py-0.5 text-sm font-medium transition-colors"
          >
            <span>All</span>
            <PencilIcon className="text-ink-400 h-3 w-3" />
          </button>
        )}
      </Row>

      <div className="bg-ink-300 hidden h-4 w-px sm:block" />

      <Row className="items-center gap-2">
        <span className="text-ink-500 text-xs font-medium uppercase tracking-wide">
          Hide API trades
        </span>
        <ShortToggle
          on={hideApiTrades}
          setOn={(enabled) => {
            setHideApiTrades(enabled)
            track('toggle-live-hide-api-trades-filter', {
              hideApiTrades: enabled,
            })
          }}
          size="sm"
        />
      </Row>
    </Row>
  )
}

const MarketCreatedLog = memo((props: { contract: Contract }) => {
  const {
    creatorId,
    creatorAvatarUrl,
    creatorUsername,
    creatorName,
    createdTime,
  } = props.contract

  const creator = useDisplayUserById(creatorId)

  return (
    <UserHovercard userId={creatorId}>
      <Row className="text-ink-600 items-center gap-2 text-sm">
        <Avatar
          avatarUrl={creator?.avatarUrl ?? creatorAvatarUrl}
          username={creator?.username ?? creatorUsername}
          size="xs"
          entitlements={creator?.entitlements}
          displayContext="feed"
        />
        <UserLink
          user={{
            id: creatorId,
            name: creator?.name ?? creatorName,
            username: creator?.username ?? creatorUsername,
            entitlements: creator?.entitlements,
          }}
          displayContext="feed"
        />
        <Row className="text-ink-400">
          created
          <RelativeTimestamp time={createdTime} />
        </Row>
      </Row>
    </UserHovercard>
  )
})

const CommentLog = memo(function FeedComment(props: {
  comment: ContractComment
}) {
  const { comment } = props
  const {
    userName,
    text,
    content,
    userId,
    userUsername,
    userAvatarUrl,
    createdTime,
  } = comment

  const commenter = useDisplayUserById(userId)

  return (
    <Col>
      <Row
        id={comment.id}
        className="text-ink-500 mb-1 items-center gap-2 text-sm"
      >
        <UserHovercard userId={userId}>
          <Avatar
            size="xs"
            username={commenter?.username ?? userUsername}
            avatarUrl={commenter?.avatarUrl ?? userAvatarUrl}
            entitlements={commenter?.entitlements}
            displayContext="feed"
          />
        </UserHovercard>
        <span>
          <UserHovercard userId={userId}>
            <UserLink
              user={{
                id: userId,
                name: commenter?.name ?? userName,
                username: commenter?.username ?? userUsername,
                entitlements: commenter?.entitlements,
              }}
              displayContext="feed"
            />
          </UserHovercard>{' '}
          commented
        </span>
        <RelativeTimestamp time={createdTime} />
      </Row>
      <Content size="sm" className="grow" content={content || text} />
    </Col>
  )
})
