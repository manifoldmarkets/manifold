import { memo, useEffect, useRef, useState } from 'react'
import { Contract, CPMMNumericContract, MarketContract } from 'common/contract'
import { Bet } from 'common/bet'
import { usePersistentInMemoryState } from 'client-common/hooks/use-persistent-in-memory-state'
import { listenToOrderUpdates } from 'client-common/hooks/use-bets'
import { groupBy, minBy, sortBy, uniqBy } from 'lodash'
import { useLiquidity } from 'web/hooks/use-liquidity'
import {
  DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
  HOUSE_LIQUIDITY_PROVIDER_ID,
} from 'common/antes'
import { useEvent } from 'client-common/hooks/use-event'
import { api } from 'web/lib/api/api'
import { Row } from 'web/components/layout/row'
import DropdownMenu from 'web/components/widgets/dropdown-menu'
import generateFilterDropdownItems from 'web/components/search/search-dropdown-helpers'
import { track } from 'web/lib/service/analytics'
import { ChevronDownIcon } from '@heroicons/react/solid'
import { Col } from 'web/components/layout/col'
import { FeedBet } from 'web/components/feed/feed-bets'
import { MultiNumericBetGroup } from 'web/components/feed/feed-multi-numeric-bet-group'
import { FeedLiquidity } from 'web/components/feed/feed-liquidity'
import { LoadMoreUntilNotVisible } from 'web/components/widgets/visibility-observer'

export const BetsTabContent = memo(function BetsTabContent(props: {
  contract: Contract
  bets: Bet[]
  totalBets: number
  setReplyToBet?: (bet: Bet) => void
}) {
  const { contract, setReplyToBet, totalBets } = props
  const { outcomeType } = contract
  const [olderBets, setOlderBets] = useState<Bet[]>([])

  const [minAmountFilterIndex, setMinAmountFilterIndex] =
    usePersistentInMemoryState(0, `bet-amount-filter-${contract.id}`)
  const isNumber = outcomeType === 'NUMBER'

  // Min amount filter options
  const minAmountOptions = [
    { label: 'Any amount', value: undefined },
    { label: 'M$100+', value: 100 },
    { label: 'M$1,000+', value: 1000 },
    { label: 'M$10,000+', value: 10000 },
  ]
  const selectedMinAmount = minAmountOptions[minAmountFilterIndex].value

  // Filter initial bets on client side, server will filter olderBets
  const filteredInitialBets = selectedMinAmount
    ? props.bets.filter((bet) => Math.abs(bet.amount) >= selectedMinAmount)
    : props.bets

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
      !minAmountFilterIndex
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
  }, [selectedMinAmount])

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

      {/* Minimum bet amount filter */}
      <Row className="mb-2">
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
      </Row>

      <Col className="mb-4 items-start gap-7">
        {allItems.map((item) =>
          item.type === 'bet' ? (
            <FeedBet
              onReply={setReplyToBet}
              key={item.id}
              contract={contract as MarketContract}
              bet={item.bet}
            />
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
