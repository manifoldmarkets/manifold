import { Menu, MenuItem, MenuItems, Transition } from '@headlessui/react'
import { ChevronDownIcon, PencilIcon, XIcon } from '@heroicons/react/solid'
import { listenToOrderUpdates } from 'client-common/hooks/use-bets'
import { useEvent } from 'client-common/hooks/use-event'
import { usePersistentInMemoryState } from 'client-common/hooks/use-persistent-in-memory-state'
import clsx from 'clsx'
import {
  DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
  HOUSE_LIQUIDITY_PROVIDER_ID,
} from 'common/antes'
import { DisplayUser } from 'common/api/user-types'
import { Bet } from 'common/bet'
import { Contract, CPMMNumericContract, MarketContract } from 'common/contract'
import { groupBy, minBy, sortBy, uniqBy } from 'lodash'
import { Fragment, memo, useEffect, useRef, useState } from 'react'
import { FeedBet, FeedBetWithGraphAction } from 'web/components/feed/feed-bets'
import { FeedLiquidity } from 'web/components/feed/feed-liquidity'
import { MultiNumericBetGroup } from 'web/components/feed/feed-multi-numeric-bet-group'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import generateFilterDropdownItems from 'web/components/search/search-dropdown-helpers'
import { Avatar } from 'web/components/widgets/avatar'
import DropdownMenu from 'web/components/widgets/dropdown-menu'
import { Input } from 'web/components/widgets/input'
import { LoadMoreUntilNotVisible } from 'web/components/widgets/visibility-observer'
import { useLiquidity } from 'web/hooks/use-liquidity'
import { api } from 'web/lib/api/api'
import { track } from 'web/lib/service/analytics'

export const BetsTabContent = memo(function BetsTabContent(props: {
  contract: Contract
  bets: Bet[]
  totalBets: number
  setReplyToBet?: (bet: Bet) => void
  setGraphUser?: (user: DisplayUser | undefined) => void
  setHideGraph?: (hide: boolean) => void
}) {
  const { contract, setReplyToBet, totalBets, setGraphUser, setHideGraph } =
    props
  const { outcomeType } = contract
  const [olderBets, setOlderBets] = useState<Bet[]>([])

  const [minAmountFilterIndex, setMinAmountFilterIndex] =
    usePersistentInMemoryState(0, `bet-amount-filter-${contract.id}`)
  const isNumber = outcomeType === 'NUMBER'

  // User filter state
  const [selectedUser, setSelectedUser] = useState<DisplayUser | undefined>()
  const [userSearchTerm, setUserSearchTerm] = useState('')
  const [isEditingUserFilter, setIsEditingUserFilter] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const [searchedUsers, setSearchedUsers] = useState<DisplayUser[]>([])
  const userSearchInputRef = useRef<HTMLInputElement>(null)
  const searchRequestId = useRef(0)

  useEffect(() => {
    setHighlightedIndex(-1)
    if (!userSearchTerm) {
      setSearchedUsers([])
      return
    }
    const requestId = ++searchRequestId.current
    api('search-contract-positions', {
      contractId: contract.id,
      term: userSearchTerm,
      limit: 5,
    }).then((results) => {
      // Ignore stale responses
      if (requestId === searchRequestId.current) {
        setSearchedUsers(results)
      }
    })
  }, [userSearchTerm, contract.id])
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
    setOlderBets([])
    track('select-bet-user-filter', {
      contractSlug: contract.slug,
      contractName: contract.question,
      userId: user.id,
      userName: user.name,
    })
  }

  // Min amount filter options
  const minAmountOptions = [
    { label: 'Any amount', value: undefined },
    { label: 'M$100+', value: 100 },
    { label: 'M$1,000+', value: 1000 },
    { label: 'M$10,000+', value: 10000 },
  ]
  const selectedMinAmount = minAmountOptions[minAmountFilterIndex].value

  // Filter initial bets on client side, server will filter olderBets
  const filteredInitialBets = props.bets.filter((bet) => {
    if (selectedMinAmount && Math.abs(bet.amount) < selectedMinAmount)
      return false
    if (selectedUser && bet.userId !== selectedUser.id) return false
    return true
  })

  const bets = [...filteredInitialBets, ...olderBets]
  listenToOrderUpdates(contract.id, setOlderBets, true)

  const oldestBet = minBy(bets, (b) => b.createdTime)

  const lps = useLiquidity(contract.id) ?? []
  const visibleLps = lps.filter(
    (l) =>
      !l.isAnte &&
      l.userId !== HOUSE_LIQUIDITY_PROVIDER_ID &&
      l.userId !== DEV_HOUSE_LIQUIDITY_PROVIDER_ID &&
      l.amount > 0 &&
      !minAmountFilterIndex &&
      !selectedUser // Hide liquidity when filtering by user
  )
  const betsByBetGroupId = isNumber
    ? groupBy(bets, (bet) => bet.betGroupId ?? bet.id)
    : {}
  const groupedBets = Object.values(betsByBetGroupId)

  const items = [
    ...(isNumber
      ? groupedBets.map((bets) => ({
          type: 'betGroup' as const,
          id: 'bets-tab-' + bets[0].betGroupId,
          bets,
        }))
      : bets.map((bet) => ({
          type: 'bet' as const,
          id: 'bets-tab-' + bet.id + '-' + 'false',
          bet,
        }))),
    ...visibleLps.map((lp) => ({
      type: 'liquidity' as const,
      id: lp.id,
      lp,
    })),
  ]

  const totalItems = totalBets + visibleLps.length
  const totalLoadedItems = bets.length + visibleLps.length

  const shouldLoadMore = totalLoadedItems < totalItems
  const [now] = useState(Date.now())
  const oldestBetTime = oldestBet?.createdTime ?? now

  const loadMore = useEvent(async () => {
    if (!shouldLoadMore) return false

    try {
      const newBets = await api('bets', {
        contractId: contract.id,
        beforeTime: oldestBetTime,
        limit: 50,
        filterRedemptions: !isNumber,
        includeZeroShareRedemptions: isNumber,
        minAmount: selectedMinAmount,
        userId: selectedUser?.id,
      })

      if (newBets.length > 0) {
        setOlderBets((bets) => uniqBy([...bets, ...newBets], (b) => b.id))
        return true
      }
      return false
    } catch (err) {
      console.error(err)
      return false
    }
  })
  useEffect(() => {
    setOlderBets([])
    loadMore()
  }, [selectedMinAmount, selectedUser?.id])

  const allItems = sortBy(items, (item) =>
    item.type === 'bet'
      ? -item.bet.createdTime
      : item.type === 'liquidity'
      ? -item.lp.createdTime
      : item.type === 'betGroup'
      ? -item.bets[0].createdTime
      : undefined
  )

  const scrollRef = useRef<HTMLDivElement>(null)
  const isCashContract = contract.token === 'CASH'

  // Determine how many loading rows to show
  const numLoadingRows = shouldLoadMore
    ? Math.min(10, Math.max(0, totalBets - allItems.length))
    : 0

  return (
    <>
      <div ref={scrollRef} />

      {/* Filters row */}
      <Row className="mb-2 flex-wrap gap-4">
        {/* Minimum bet amount filter */}
        <Row className="items-center gap-1">
          <span className="text-ink-500 text-sm">Min amount:</span>
          <DropdownMenu
            items={generateFilterDropdownItems(
              minAmountOptions.map((option, i) => ({
                label: option.label,
                value: i.toString(),
              })),
              (value: string) => {
                const newIndex = parseInt(value)
                setMinAmountFilterIndex(newIndex)
                setOlderBets([]) // Clear older bets to refetch with new filter
                track('change-bet-amount-filter', {
                  contractSlug: contract.slug,
                  contractName: contract.question,
                  minAmount: minAmountOptions[newIndex].value,
                })
              }
            )}
            buttonContent={
              <Row className="text-ink-700 w-28 items-center text-sm">
                <span className="whitespace-nowrap">
                  {minAmountOptions[minAmountFilterIndex].label}
                </span>
                <ChevronDownIcon className="h-4 w-4" />
              </Row>
            }
            menuWidth={'w-36'}
            selectedItemName={minAmountOptions[minAmountFilterIndex].label}
            closeOnClick
          />
        </Row>

        {/* User filter */}
        <Row className="h-8 items-center gap-1">
          <span className="text-ink-500 text-sm">Traders:</span>
          {selectedUser ? (
            <Row className="bg-ink-100 items-center gap-1 rounded-full py-0.5 pl-1 pr-2">
              <Avatar
                username={selectedUser.username}
                avatarUrl={selectedUser.avatarUrl}
                size="2xs"
                noLink
              />
              <span className="text-ink-700 text-sm">{selectedUser.name}</span>
              <button
                onClick={() => {
                  setSelectedUser(undefined)
                  setOlderBets([])
                  track('clear-bet-user-filter', {
                    contractSlug: contract.slug,
                    contractName: contract.question,
                  })
                }}
                className="hover:bg-ink-200 ml-1 rounded-full p-0.5"
              >
                <XIcon className="text-ink-500 h-3 w-3" />
              </button>
            </Row>
          ) : isEditingUserFilter ? (
            <div className="relative">
              <Row className="items-center gap-1">
                <Input
                  ref={userSearchInputRef}
                  type="text"
                  placeholder="Search traders"
                  className="h-8 w-36 text-sm"
                  value={userSearchTerm}
                  onChange={(e) => setUserSearchTerm(e.target.value)}
                  onBlur={() => {
                    // Delay to allow click on menu item
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
                  className="hover:bg-ink-200 rounded-full p-1"
                >
                  <XIcon className="text-ink-500 h-4 w-4" />
                </button>
              </Row>
              <Menu as="div" className="relative z-20">
                {userSearchTerm.length > 0 &&
                  searchedUsers &&
                  searchedUsers.length > 0 && (
                    <Transition
                      show={
                        userSearchTerm.length > 0 &&
                        !!searchedUsers &&
                        searchedUsers.length > 0
                      }
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
                        className="divide-ink-100 bg-canvas-0 ring-ink-1000 absolute left-0 mt-1 w-48 origin-top-left cursor-pointer divide-y rounded-md shadow-lg ring-1 ring-opacity-5 focus:outline-none"
                      >
                        <div className="py-1">
                          {searchedUsers.map((user, index) => (
                            <MenuItem key={user.id}>
                              <button
                                className={clsx(
                                  'group flex w-full items-center px-3 py-2 text-sm',
                                  highlightedIndex === index
                                    ? 'bg-primary-100 text-ink-900'
                                    : 'hover:bg-ink-100 hover:text-ink-900'
                                )}
                                onClick={() => selectUser(user)}
                                onMouseEnter={() => setHighlightedIndex(index)}
                              >
                                <Avatar
                                  username={user.username}
                                  avatarUrl={user.avatarUrl}
                                  size="xs"
                                  className="mr-2"
                                  noLink
                                />
                                <span className="truncate">{user.name}</span>
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
              className="text-ink-700 hover:bg-ink-100 flex items-center gap-1 rounded px-1 py-0.5 text-sm"
            >
              <span>All</span>
              <PencilIcon className="text-ink-400 mb-0.5 h-3.5 w-3.5" />
            </button>
          )}
        </Row>
      </Row>

      <Col className="mb-4 items-start gap-7">
        {allItems.map((item) =>
          item.type === 'bet' ? (
            setGraphUser ? (
              <FeedBetWithGraphAction
                onReply={setReplyToBet}
                key={item.id}
                contract={contract as MarketContract}
                bet={item.bet}
                setGraphUser={setGraphUser}
                setHideGraph={setHideGraph}
              />
            ) : (
              <FeedBet
                onReply={setReplyToBet}
                key={item.id}
                contract={contract as MarketContract}
                bet={item.bet}
              />
            )
          ) : item.type === 'betGroup' ? (
            <MultiNumericBetGroup
              key={item.id}
              contract={contract as CPMMNumericContract}
              bets={item.bets}
            />
          ) : (
            <div
              key={item.id}
              className="-ml-2 rounded-full bg-gradient-to-r from-pink-300/50 via-purple-300/50 to-indigo-300/50 p-2"
            >
              <FeedLiquidity
                liquidity={item.lp}
                isCashContract={isCashContract}
              />
            </div>
          )
        )}
        {/* Render skeleton loading rows */}
        {shouldLoadMore &&
          !minAmountFilterIndex &&
          !selectedUser &&
          Array(numLoadingRows)
            .fill(0)
            .map((_, i) => <LoadingBetRow key={`loading-${i}`} />)}
      </Col>

      <LoadMoreUntilNotVisible loadMore={loadMore} />
    </>
  )
})

function LoadingBetRow() {
  return (
    <div className="flex w-full animate-pulse gap-3 rounded-md ">
      {/* Avatar skeleton */}
      <div className="h-10 w-10 rounded-full bg-gray-500" />
      <Col className="flex-1 justify-center gap-1.5">
        <div className="h-4 w-1/2 rounded bg-gray-500" />
      </Col>
    </div>
  )
}
