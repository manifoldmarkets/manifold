'use client'
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react'
import { CogIcon } from '@heroicons/react/outline'
import {
  ArrowSmDownIcon,
  ArrowSmUpIcon,
  ChevronDownIcon,
} from '@heroicons/react/solid'
import { useContractBets } from 'client-common/hooks/use-bets'
import { useEvent } from 'client-common/hooks/use-event'
import { usePersistentInMemoryState } from 'client-common/hooks/use-persistent-in-memory-state'
import clsx from 'clsx'
import { LimitBet } from 'common/bet'
import { getContractBetNullMetrics } from 'common/calculate'
import {
  Contract,
  contractPath,
  CPMMContract,
  MarketContract,
} from 'common/contract'
import { ContractMetric, getMaxSharesOutcome } from 'common/contract-metric'
import { SWEEPIES_MARKET_TOOLTIP } from 'common/envs/constants'
import { buildArray } from 'common/util/array'
import { formatWithToken } from 'common/util/format'
import { floatingEqual } from 'common/util/math'
import { searchInAny } from 'common/util/parse'
import { Dictionary, mapValues, sortBy, sum, uniqBy } from 'lodash'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { ContractBetsTable } from 'web/components/bet/contract-bets-table'
import { OrderTable } from 'web/components/bet/order-book'
import { BetsSummary } from 'web/components/bet/user-bet-summary'
import { PillButton } from 'web/components/buttons/pill-button'
import { Input } from 'web/components/widgets/input'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { useIsPageVisible } from 'web/hooks/use-page-visible'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import { usePersistentQueryState } from 'web/hooks/use-persistent-query-state'
import { useIsAuthorized, useUser } from 'web/hooks/use-user'
import { api } from 'web/lib/api/api'
import { User } from 'web/lib/firebase/users'
import { SweepiesCoin } from 'web/public/custom-components/sweepiesCoin'
import { ContractStatusLabel } from '../contract/contracts-table'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { BinaryOutcomeLabel, MultiOutcomeLabel } from '../outcome-label'
import { RelativeTimestamp } from '../relative-timestamp'
import { useSweepstakes } from '../sweepstakes-provider'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { Tooltip } from '../widgets/tooltip'
import { LoadMoreUntilNotVisible } from '../widgets/visibility-observer'
import { LimitOrdersTable } from './limit-orders-table'

type BetSort =
  | 'newest'
  | 'profit'
  | 'closeTime'
  | 'value'
  | 'day'
  | 'week'
  | 'probChangeDay'
  | 'profitPercent'
  | 'position'
  | 'dayPctChange'
  | 'costBasis'
  | 'dayPriceChange'
  | 'volume24h'
  | 'liquidity'
  | 'priceDiff'
  | 'loan'
export type BetFilter =
  | 'open'
  | 'sold'
  | 'closed'
  | 'resolved'
  | 'all'
  | 'limit_bet'

const JUNE_1_2022 = new Date('2022-06-01T00:00:00.000Z').valueOf()
export function UserBetsTable(props: { user: User }) {
  const { user } = props

  const signedInUser = useUser()
  const isAuth = useIsAuthorized()

  const isYou = user.id === signedInUser?.id

  const [metricsByContract, setMetricsByContract] = usePersistentInMemoryState<
    Dictionary<ContractMetric> | undefined
  >(undefined, `user-contract-metrics-${user.id}`)

  const [contracts, setContracts] = usePersistentInMemoryState<
    MarketContract[] | undefined
  >(undefined, `user-contract-metrics-contracts-${user.id}`)

  // Track visible columns with local storage persistence
  const [visibleColumns, setVisibleColumns] = usePersistentLocalState<
    BetSort[]
  >(['value', 'position', 'priceDiff'], 'bets-visible-columns-1')

  const [showLimitOrders, setShowLimitOrders] = usePersistentLocalState(
    false,
    'show-limit-orders-view'
  )
  type LimitOrderFilter = 'active' | 'filled' | 'expired' | 'cancelled'
  // Add state for showing different order types
  const [orderFilter, setOrderFilter] =
    usePersistentInMemoryState<LimitOrderFilter>(
      'active',
      'limit-orders-filter'
    )
  const updateOrderFilter = (newFilter: LimitOrderFilter) => {
    setOrderFilter(orderFilter === newFilter ? 'active' : newFilter)
  }

  const getMetrics = useEvent(() =>
    // NOTE: this only returns the currently used contract props to save on bandwidth
    api('get-user-contract-metrics-with-contracts', {
      userId: user.id,
      offset: 0,
      // Hack for Ziddletwix
      limit: user.id === 'Iua2KQvL6KYcfGLGNI6PVeGkseo1' ? 10000 : 5000,
    }).then((res) => {
      const { contracts, metricsByContract } = res
      setMetricsByContract(
        mapValues(metricsByContract, (metrics) => metrics[0])
      )
      setContracts((c) =>
        uniqBy(buildArray([...(c ?? []), ...contracts]), 'id')
      )
    })
  )

  useEffect(() => {
    if (isAuth !== undefined) {
      getMetrics()
    }
  }, [getMetrics, user.id, isAuth])

  const [filter, setFilter] = usePersistentLocalState<BetFilter>(
    'open',
    'bets-list-filter'
  )

  // Remove limit_bet filter
  useEffect(() => {
    if (filter === 'limit_bet') {
      setShowLimitOrders(true)
    }
  }, [filter])

  const { prefersPlay, setPrefersPlay } = useSweepstakes()

  const [query, setQuery] = usePersistentQueryState('b', '')

  const onSetFilter = (f: BetFilter | 'limit_orders') => {
    if (f === 'limit_orders') {
      setShowLimitOrders(true)
      return
    }
    // When selecting any other filter, turn off limit orders view
    setShowLimitOrders(false)
    setFilter(f as BetFilter)
  }

  const toggleTokenFilter = () => {
    setPrefersPlay(!prefersPlay)
  }

  const nullableMetricsByContract = useMemo(() => {
    if (!metricsByContract || !contracts) {
      return undefined
    }
    // check if we have any contracts that don't have contractMetrics, if so, add them in as getContractBetNullMetrics
    const missingContracts = contracts.filter((c) => !metricsByContract[c.id])
    const missingMetrics = Object.fromEntries(
      missingContracts.map((c) => [c.id, getContractBetNullMetrics()])
    )

    return {
      ...metricsByContract,
      ...missingMetrics,
    }
  }, [JSON.stringify(contracts), metricsByContract])

  const queriedContracts = query
    ? contracts?.filter((c) =>
        searchInAny(query, c.question, c.creatorName, c.creatorUsername)
      )
    : contracts

  const FILTERS: Record<BetFilter, (c: Contract) => boolean> = {
    resolved: (c) => !!c.resolutionTime,
    closed: (c) =>
      !FILTERS.resolved(c) && (c.closeTime ?? Infinity) < Date.now(),
    open: (c) => !(FILTERS.closed(c) || FILTERS.resolved(c)),
    all: () => true,
    sold: () => true,
    limit_bet: () => true,
  }
  const loaded = nullableMetricsByContract && contracts
  const filteredContracts = loaded
    ? queriedContracts
        ?.filter(FILTERS[filter])
        .filter((c) => {
          if (filter === 'all') return true
          const { totalShares } = nullableMetricsByContract[c.id]
          // The hasShares wasn't properly set for null metrics for a while, so using totalShares instead
          const hasShares = Object.values(totalShares).some(
            (s) => !floatingEqual(s, 0)
          )
          if (filter === 'sold') return !hasShares
          return hasShares
        })
        .filter((c) => {
          if (!prefersPlay) return c.token === 'CASH'
          else return c.token === 'MANA' || !c.token
        })
    : []

  const hasSweeps = contracts?.some((c) => c.token === 'CASH')

  // Define filter options
  const filterOptions: {
    label: string
    value: BetFilter | 'limit_orders'
  }[] = [
    { label: 'All', value: 'all' },
    { label: 'Open', value: 'open' },
    { label: 'Sold', value: 'sold' },
    { label: 'Closed', value: 'closed' },
    { label: 'Resolved', value: 'resolved' },
    {
      label: 'Limit Orders',
      value: 'limit_orders',
    },
  ]

  const limitOrderFilterOptions: {
    label: string
    value: LimitOrderFilter
  }[] = [
    { label: 'Open', value: 'active' },
    { label: 'Expired', value: 'expired' },
    { label: 'Filled', value: 'filled' },
    { label: 'Cancelled', value: 'cancelled' },
  ]

  // Define sort options for the dropdown in the main component
  const sortOptions: {
    label: string
    field: BetSort
    direction: 'asc' | 'desc'
    hiddenUntilSorted?: boolean
  }[] = [
    { label: 'Newest', field: 'newest', direction: 'desc' },
    { label: 'Oldest', field: 'newest', direction: 'asc' },
    { label: 'Highest Value', field: 'value', direction: 'desc' },
    { label: 'Lowest Value', field: 'value', direction: 'asc' },
    { label: 'Highest Position', field: 'position', direction: 'desc' },
    { label: 'Lowest Position', field: 'position', direction: 'asc' },
    { label: 'Highest Profit', field: 'profit', direction: 'desc' },
    { label: 'Lowest Profit', field: 'profit', direction: 'asc' },
    { label: 'Highest 1d Change', field: 'day', direction: 'desc' },
    { label: 'Lowest 1d Change', field: 'day', direction: 'asc' },
    { label: 'Highest 1w Change', field: 'week', direction: 'desc' },
    { label: 'Lowest 1w Change', field: 'week', direction: 'asc' },
    { label: 'Closing Soon', field: 'closeTime', direction: 'asc' },
    {
      label: 'Highest Loan',
      field: 'loan',
      direction: 'desc',
    },
    {
      label: 'Lowest Loan',
      field: 'loan',
      direction: 'asc',
    },
    {
      label: '↓ ∆ Last Trade',
      field: 'priceDiff',
      direction: 'desc',
      hiddenUntilSorted: true,
    },
    {
      label: '↑ ∆ Last Trade',
      field: 'priceDiff',
      direction: 'asc',
      hiddenUntilSorted: true,
    },
  ]

  // Restore sort state here, replacing sortDropdownOption
  const [sortOption, setSortOption] = usePersistentInMemoryState<{
    field: BetSort
    direction: 'asc' | 'desc'
  }>({ field: 'newest', direction: 'desc' }, 'bets-list-sort') // Use original key

  // Handler for the dropdown selection - now updates the main sort state
  const onSelectSortOption = (option: {
    field: BetSort
    direction: 'asc' | 'desc'
  }) => {
    setSortOption(option)
  }

  return (
    <Col className="relative">
      <div
        className={clsx(
          'flex flex-wrap justify-between max-sm:flex-col',
          !showLimitOrders && 'bg-canvas-0 sticky top-0 z-20 pt-1'
        )}
      >
        <Col className="w-full gap-2">
          <Col
            className={
              'items-end gap-2 sm:flex-row sm:items-center sm:justify-between'
            }
          >
            <Input
              placeholder={isYou ? 'Search your bets' : 'Search bets'}
              className={'w-full min-w-[30px]'}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <Row className="h-full gap-2">
              {/* Filter Dropdown */}
              <Col className="relative">
                <Menu>
                  <MenuButton className="bg-canvas-0 border-ink-200 hover:bg-canvas-50 inline-flex h-full w-32 items-center justify-between rounded-md border px-3 py-1.5 text-sm shadow-sm">
                    <span>
                      {showLimitOrders
                        ? 'Limit Orders'
                        : filterOptions.find((opt) => opt.value === filter)
                            ?.label || 'Filter'}
                    </span>
                    <ChevronDownIcon className="ml-2 h-4 w-4" />
                  </MenuButton>
                  <MenuItems className="bg-canvas-0 border-ink-200 absolute right-0 z-20 mt-1 w-48  rounded-md border shadow-lg">
                    {filterOptions.map((option) => (
                      <MenuItem key={option.value}>
                        {({ focus }) => (
                          <button
                            className={clsx(
                              'w-full px-4 py-2 text-left text-sm',
                              focus ? 'bg-primary-50' : '',
                              option.value === 'limit_orders' && showLimitOrders
                                ? 'bg-primary-100'
                                : ''
                            )}
                            onClick={() =>
                              onSetFilter(
                                option.value as BetFilter | 'limit_orders'
                              )
                            }
                          >
                            {option.label}
                          </button>
                        )}
                      </MenuItem>
                    ))}
                  </MenuItems>
                </Menu>
              </Col>

              {/* Limit Order Status Dropdown - Only visible when showLimitOrders is true */}
              {showLimitOrders && isYou && (
                <Col className="relative">
                  <Menu>
                    <MenuButton className="bg-canvas-0 border-ink-200 hover:bg-canvas-50 inline-flex h-full w-28 items-center justify-between rounded-md border px-3 py-1.5 text-sm shadow-sm">
                      <span>
                        {limitOrderFilterOptions.find(
                          (opt) => opt.value === orderFilter
                        )?.label || 'Open'}
                      </span>
                      <ChevronDownIcon className="ml-2 h-4 w-4" />
                    </MenuButton>
                    <MenuItems className="bg-canvas-0 border-ink-200 absolute right-0 z-20 mt-1 w-48  rounded-md border shadow-lg">
                      {limitOrderFilterOptions.map((option) => (
                        <MenuItem key={option.value}>
                          {({ focus }) => (
                            <button
                              className={clsx(
                                'w-full px-4 py-2 text-left text-sm',
                                focus ? 'bg-primary-50' : '',
                                orderFilter === option.value
                                  ? 'bg-primary-100'
                                  : ''
                              )}
                              onClick={() => updateOrderFilter(option.value)}
                            >
                              {option.label}
                            </button>
                          )}
                        </MenuItem>
                      ))}
                    </MenuItems>
                  </Menu>
                </Col>
              )}

              {!showLimitOrders && (
                <Col className="relative">
                  <Menu>
                    <MenuButton className="bg-canvas-0 border-ink-200 hover:bg-canvas-50 inline-flex h-full w-44 items-center justify-between rounded-md border px-3 py-1.5 text-sm shadow-sm">
                      <span>
                        {sortOptions.find(
                          (opt) =>
                            opt.field === sortOption.field &&
                            opt.direction === sortOption.direction
                        )?.label || 'Sort'}
                      </span>
                      <ChevronDownIcon className="ml-2 h-4 w-4" />
                    </MenuButton>
                    <MenuItems className="bg-canvas-0 border-ink-200 absolute right-0 z-10 mt-1 max-h-80 w-48 overflow-y-auto rounded-md border shadow-lg sm:max-h-none ">
                      {sortOptions
                        .filter(
                          (option) =>
                            !option.hiddenUntilSorted ||
                            sortOption.field === option.field
                        )
                        .map((option) => (
                          <MenuItem key={`${option.field}-${option.direction}`}>
                            {({ focus }) => (
                              <button
                                className={clsx(
                                  'w-full px-4 py-2 text-left text-sm',
                                  focus ? 'bg-primary-50' : '',
                                  sortOption.field === option.field &&
                                    sortOption.direction === option.direction
                                    ? 'bg-primary-100'
                                    : ''
                                )}
                                onClick={() => onSelectSortOption(option)}
                              >
                                {option.label}
                              </button>
                            )}
                          </MenuItem>
                        ))}
                    </MenuItems>
                  </Menu>
                </Col>
              )}
            </Row>
          </Col>
          {hasSweeps && filter === 'resolved' && (
            <Row>
              <PillButton
                selected={!(prefersPlay ?? false)}
                onSelect={toggleTokenFilter}
              >
                Sweepcash
              </PillButton>
            </Row>
          )}
        </Col>
      </div>

      {!loaded ? (
        <div className="overflow-hidden">
          <Col className="divide-ink-300 mt-6 divide-y">
            <LoadingMetricRow />
            <LoadingMetricRow />
            <LoadingMetricRow />
          </Col>
        </div>
      ) : Object.keys(nullableMetricsByContract).length === 0 ? (
        <NoBets user={user} />
      ) : showLimitOrders && isYou ? (
        <LimitOrdersTable
          query={query}
          user={user}
          isYourBets={isYou}
          includeExpired={orderFilter === 'expired'}
          includeFilled={orderFilter === 'filled'}
          includeCancelled={orderFilter === 'cancelled'}
          filter={'open'}
          className="mt-2"
        />
      ) : (
        <BetsTable
          contracts={filteredContracts as MarketContract[]}
          metricsByContractId={nullableMetricsByContract}
          user={user}
          filter={filter}
          signedInUser={signedInUser}
          sortOption={sortOption}
          setSortOption={setSortOption}
          visibleColumns={visibleColumns}
          setVisibleColumns={setVisibleColumns}
        />
      )}
    </Col>
  )
}

const NoBets = ({ user }: { user: User }) => {
  const me = useUser()
  return (
    <>
      {user.id === me?.id && (
        <Link href="/home" className="text-primary-500 mt-2 hover:underline">
          Find a question to trade on!
        </Link>
      )}
    </>
  )
}
const availableColumns: { value: BetSort; label: string; tooltip?: string }[] =
  [
    { value: 'value', label: 'Value' },
    { value: 'position', label: 'Position' },
    { value: 'profit', label: 'Profit' },
    { value: 'profitPercent', label: 'Profit %' },
    { value: 'day', label: '1d Profit' },
    { value: 'dayPctChange', label: '1d Profit %' },
    { value: 'week', label: '1w Profit' },
    { value: 'closeTime', label: 'Close Time' },
    { value: 'costBasis', label: 'Cost Basis' },
    {
      value: 'loan',
      label: 'Loan',
      tooltip: 'Outstanding loan amount on this position',
    },
    { value: 'dayPriceChange', label: '1d Price' },
    { value: 'volume24h', label: '1d Volume' },
    { value: 'liquidity', label: 'Liquidity' },
    {
      value: 'priceDiff',
      label: 'Last Trade ∆',
      tooltip: 'Percent change in market probability since your last trade',
    },
  ]

function BetsTable(props: {
  contracts: MarketContract[]
  metricsByContractId: { [key: string]: ContractMetric }
  filter: BetFilter
  user: User
  signedInUser: User | null | undefined
  sortOption: { field: BetSort; direction: 'asc' | 'desc' }
  setSortOption: (sort: { field: BetSort; direction: 'asc' | 'desc' }) => void
  visibleColumns: BetSort[]
  setVisibleColumns: (columns: BetSort[]) => void
}) {
  const {
    metricsByContractId,
    filter,
    user,
    signedInUser,
    sortOption,
    setSortOption,
    visibleColumns,
    setVisibleColumns,
    contracts: allContracts,
  } = props
  const areYourBets = user.id === signedInUser?.id
  const isDesktop = !useIsMobile()
  const [expandedIds, setExpandedIds] = useState<string[]>([])
  const [displayCount, setDisplayCount] = useState(20) // Start with fewer items

  const handleHeaderClick = (field: BetSort) => {
    let direction: 'asc' | 'desc' = 'desc'
    if (sortOption.field === field) {
      direction = sortOption.direction === 'desc' ? 'asc' : 'desc'
    } else {
      if (field === 'closeTime') direction = 'asc'
    }
    setSortOption({ field, direction })
    setDisplayCount(20) // Reset display count when sorting changes
  }

  // Most of these are descending sorts by default.
  const SORTS: Record<BetSort, (c: MarketContract) => number> = {
    position: (c) => -sum(Object.values(metricsByContractId[c.id].totalShares)),
    profit: (c) => -metricsByContractId[c.id].profit,
    profitPercent: (c) => -metricsByContractId[c.id].profitPercent,
    value: (c) => -metricsByContractId[c.id].payout,
    newest: (c) => -(metricsByContractId[c.id].lastBetTime ?? 0),
    probChangeDay: (c) => {
      if (c.mechanism === 'cpmm-1') {
        return -(c as CPMMContract).probChanges.day
      }
      return 0
    },
    day: (c) => -(metricsByContractId[c.id].from?.day.profit ?? 0),
    week: (c) => -(metricsByContractId[c.id].from?.week.profit ?? 0),
    closeTime: (c) =>
      // This is in fact the intuitive sort direction.
      -1 * (c.resolutionTime ?? c.closeTime ?? Infinity),
    dayPctChange: (c) =>
      -(metricsByContractId[c.id].from?.day.profitPercent ?? 0),
    costBasis: (c) => -(metricsByContractId[c.id].invested ?? 0),
    loan: (c) => -(metricsByContractId[c.id].loan ?? 0),
    dayPriceChange: (c) => -(c.mechanism === 'cpmm-1' ? c.probChanges.day : 0),
    volume24h: (c) => -c.volume24Hours,
    liquidity: (c) => -c.totalLiquidity,
    priceDiff: (c) => {
      const metric = metricsByContractId[c.id]
      const lastProb = metric.lastProb
      const currentProb = c.mechanism === 'cpmm-1' ? c.prob : null
      const maxOutcome = getMaxSharesOutcome(metric)

      if (!lastProb || currentProb === null || !maxOutcome) {
        return 0
      }

      let userPrice: number
      let currentPrice: number

      if (maxOutcome === 'YES') {
        userPrice = lastProb
        currentPrice = currentProb
      } else if (maxOutcome === 'NO') {
        userPrice = 1 - lastProb
        currentPrice = 1 - currentProb
      } else {
        return 0
      }

      return ((userPrice - currentPrice) / userPrice) * 100
    },
  }

  const sortFunction = SORTS[sortOption.field]
  const contracts =
    sortOption.direction === 'desc'
      ? sortBy(allContracts, sortFunction)
      : sortBy(allContracts, sortFunction).reverse()

  const visibleContracts = contracts.slice(0, displayCount)

  const loadMore = useEvent(() => {
    if (displayCount >= contracts.length) return false
    setDisplayCount((prev) => Math.min(prev + 20, contracts.length))
    return displayCount + 20 < contracts.length
  })

  const setNewExpandedId = (id: string) => {
    setExpandedIds((oldIds) =>
      oldIds.includes(id)
        ? oldIds.filter((oldId) => oldId !== id)
        : [...oldIds, id]
    )
  }

  return (
    <div className="mb-4 flex-1 ">
      {/* Column customization button outside the scrollable area */}
      <Row className="justify-end pb-1 pr-6 pt-1">
        <Menu as="div" className="relative">
          <MenuButton
            className="text-ink-500 hover:text-ink-700 flex items-center"
            aria-label="Customize columns"
          >
            <CogIcon className="h-4 w-4" />
            <span className="ml-1 text-sm">Columns</span>
          </MenuButton>
          <MenuItems className="bg-canvas-0 border-ink-200 absolute right-0 z-20 mt-1 h-80 w-48 overflow-y-auto rounded-md border shadow-lg">
            <div className="border-ink-200 border-b px-4 py-2 text-xs font-semibold">
              Customize Columns
            </div>
            {availableColumns.map((column) => (
              <MenuItem key={column.value}>
                {({ focus }) => {
                  const isSelected = visibleColumns.includes(column.value)

                  return (
                    <button
                      className={clsx(
                        'w-full px-4 py-2 text-left text-sm',
                        focus && 'bg-primary-50',
                        isSelected && 'bg-primary-100',
                        'cursor-pointer'
                      )}
                      onClick={() => {
                        if (isSelected) {
                          if (visibleColumns.length > 1) {
                            // Always keep at least one column
                            setVisibleColumns(
                              visibleColumns.filter((c) => c !== column.value)
                            )
                          }
                        } else {
                          setVisibleColumns([...visibleColumns, column.value])
                        }
                      }}
                    >
                      {column.label}
                      {isSelected && (
                        <span className="text-primary-600 ml-2">✓</span>
                      )}
                    </button>
                  )
                }}
              </MenuItem>
            ))}
          </MenuItems>
        </Menu>
      </Row>

      {/* Scrollable table content with headers */}
      <div
        className={clsx(
          'scrollbar-thin scrollbar-track-transparent scrollbar-thumb-ink-200 w-full max-w-full overflow-x-auto',
          visibleColumns.length > 2 ? 'show-scrollbar' : 'hide-scrollbar'
        )}
      >
        <div className="min-w-full">
          <BetsTableHeaders
            visibleColumns={visibleColumns}
            isDesktop={isDesktop}
            sortOption={sortOption}
            handleHeaderClick={handleHeaderClick}
          />
          {/* Table data rows */}
          <div className="min-w-full">
            {visibleContracts.map((contract) => {
              const metric = metricsByContractId[contract.id]
              const closeDate = contract.resolutionTime ?? contract.closeTime
              const resolvedAnswer =
                contract.mechanism === 'cpmm-multi-1'
                  ? contract.answers.find(
                      (a) =>
                        a.id === contract.resolution ||
                        (contract.resolutions?.[a.id] ?? 0) >= 99
                    )
                  : undefined

              const maxOutcome =
                metricsByContractId[contract.id].maxSharesOutcome

              return (
                <div
                  key={contract.id + 'bets-table-row'}
                  className="group w-full cursor-pointer"
                >
                  <div
                    className="flex w-full"
                    onClick={() => setNewExpandedId(contract.id)}
                  >
                    {/* Question cell */}
                    <div
                      className={clsx(
                        'border-ink-200 border-b py-3',
                        'w-full min-w-[160px]',
                        'bg-canvas-0 group-hover:bg-canvas-50 sticky left-0 z-10'
                      )}
                    >
                      <Link
                        href={contractPath(contract)}
                        onClick={(e) => e.stopPropagation()}
                        title={contract.question}
                      >
                        {contract.token == 'CASH' && (
                          <Tooltip
                            text={SWEEPIES_MARKET_TOOLTIP}
                            className="relative mr-0.5 inline-flex h-[1em] w-[1.1em] items-baseline"
                          >
                            <SweepiesCoin className="absolute inset-0 top-[0.2em]" />
                          </Tooltip>
                        )}
                        <span
                          className={clsx(
                            'line-clamp-2 overflow-hidden text-sm',
                            visibleColumns.length > 2
                              ? 'line-clamp-2'
                              : 'sm:line-clamp-1 sm:text-base'
                          )}
                        >
                          {contract.question}
                        </span>
                        <div className="text-ink-500 mt-1 truncate text-sm">
                          {contract.isResolved ? (
                            <span className="text-ink-800 mr-1 inline-flex">
                              {contract.outcomeType === 'MULTIPLE_CHOICE' ? (
                                Object.values(
                                  contract.resolutions ?? {}
                                ).filter((r) => r > 1).length > 1 ||
                                contract.resolution === 'MKT' ? (
                                  <span>MULTI</span>
                                ) : contract.resolution === 'CANCEL' ? (
                                  <BinaryOutcomeLabel outcome="CANCEL" />
                                ) : resolvedAnswer ? (
                                  <MultiOutcomeLabel
                                    answerText={resolvedAnswer.text}
                                    resolution={contract.resolution ?? ''}
                                    truncate="long"
                                    answerClassName={
                                      'font-semibold text-base-400 !break-normal'
                                    }
                                  />
                                ) : null
                              ) : (
                                <ContractStatusLabel contract={contract} />
                              )}
                              <span className="text-ink-500 ml-1 text-sm">
                                •
                              </span>
                            </span>
                          ) : contract.outcomeType !== 'MULTIPLE_CHOICE' ? (
                            <span className="text-ink-800 mr-1 inline-flex">
                              <ContractStatusLabel contract={contract} />
                              <span className="text-ink-500 ml-1 text-sm">
                                •
                              </span>
                            </span>
                          ) : null}
                          <span className="text-ink-500 text-sm">
                            <RelativeTimestamp
                              time={metric.lastBetTime}
                              className="text-ink-500 -ml-1 text-sm"
                              shortened
                            />
                          </span>
                          {sortOption.field === 'closeTime' && closeDate ? (
                            <span className="text-ink-500 ml-1 whitespace-nowrap">
                              •{' '}
                              {closeDate < Date.now() ? 'closed' : 'closes in'}{' '}
                              <RelativeTimestamp
                                time={closeDate}
                                className="text-ink-500"
                                shortened
                              />
                            </span>
                          ) : null}
                        </div>
                      </Link>
                    </div>

                    {/* Data cells container */}
                    <div
                      className={clsx(
                        'flex justify-end',
                        !isDesktop && 'flex-grow'
                      )}
                    >
                      {availableColumns
                        .filter((column) =>
                          visibleColumns.includes(column.value)
                        )
                        .map(({ value }) => (
                          <div
                            key={value}
                            className={clsx(
                              'w-[90px] flex-shrink-0 py-3 text-right',
                              'border-ink-200 group-hover:bg-canvas-50 border-b'
                            )}
                          >
                            {value === 'value' && (
                              <>
                                <div className="text-ink-900 font-semibold">
                                  {formatWithToken({
                                    amount: metric.payout,
                                    token: contract.token,
                                  }).replace('-', '')}
                                </div>
                                {!visibleColumns.includes('profit') &&
                                  !visibleColumns.includes('profitPercent') && (
                                    <div
                                      className={clsx(
                                        'text-sm font-semibold',
                                        metric.profit > 0
                                          ? 'text-teal-500'
                                          : 'text-ink-500'
                                      )}
                                    >
                                      <Tooltip
                                        text={`${formatWithToken({
                                          amount: metric.profit,
                                          token: contract.token,
                                        })} total profit`}
                                      >
                                        <span
                                          className={clsx(
                                            'ml-1 rounded-full px-1.5 py-0.5 text-xs',
                                            metric.profitPercent > 0
                                              ? 'bg-teal-100 text-teal-800'
                                              : 'bg-canvas-50 text-ink-600'
                                          )}
                                        >
                                          {metric.profitPercent > 0 ? '+' : ''}
                                          {metric.profitPercent.toFixed(0)}%
                                        </span>
                                      </Tooltip>
                                    </div>
                                  )}
                              </>
                            )}
                            {value === 'profit' && (
                              <>
                                <div
                                  className={clsx(
                                    'font-semibold',
                                    metric.profitPercent > 0
                                      ? 'text-teal-500'
                                      : 'text-ink-600'
                                  )}
                                >
                                  {formatWithToken({
                                    amount: metric.profit,
                                    token: contract.token,
                                  })}
                                </div>
                                {!visibleColumns.includes('profitPercent') && (
                                  <div
                                    className={clsx(
                                      'text-sm font-semibold',
                                      metric.profitPercent > 0
                                        ? 'text-teal-500'
                                        : 'text-ink-500'
                                    )}
                                  >
                                    <span
                                      className={clsx(
                                        'ml-1 rounded-full px-1.5 py-0.5 text-xs',
                                        metric.profitPercent > 0
                                          ? 'bg-teal-100 text-teal-800'
                                          : 'bg-canvas-50 text-ink-600'
                                      )}
                                    >
                                      {metric.profitPercent > 0 ? '+' : ''}
                                      {metric.profitPercent.toFixed(0)}%
                                    </span>
                                  </div>
                                )}
                              </>
                            )}
                            {value === 'profitPercent' && (
                              <div
                                className={clsx(
                                  ' font-semibold',
                                  metric.profitPercent > 0
                                    ? 'text-teal-500'
                                    : 'text-ink-600'
                                )}
                              >
                                {metric.profitPercent > 0 ? '+' : ''}
                                {metric.profitPercent.toFixed(1)}%
                              </div>
                            )}
                            {value === 'day' && (
                              <>
                                <div className="text-ink-900 font-semibold">
                                  {formatWithToken({
                                    amount: metric.from?.day.profit ?? 0,
                                    token: contract.token,
                                  })}
                                </div>
                                {!visibleColumns.includes('dayPctChange') && (
                                  <div
                                    className={clsx(
                                      'text-sm font-semibold',
                                      (metric.from?.day.profitPercent ?? 0) > 0
                                        ? 'text-teal-500'
                                        : 'text-ink-500'
                                    )}
                                  >
                                    <span
                                      className={clsx(
                                        'ml-1 rounded-full px-1.5 py-0.5 text-xs',
                                        (metric.from?.day.profitPercent ?? 0) >
                                          0
                                          ? 'bg-teal-100 text-teal-800'
                                          : 'bg-canvas-50 text-ink-600'
                                      )}
                                    >
                                      {(metric.from?.day.profitPercent ?? 0) > 0
                                        ? '+'
                                        : ''}
                                      {(
                                        metric.from?.day.profitPercent ?? 0
                                      ).toFixed(0)}
                                      %
                                    </span>
                                  </div>
                                )}
                              </>
                            )}
                            {value === 'week' && (
                              <>
                                <div className="text-ink-900 font-semibold">
                                  {formatWithToken({
                                    amount: metric.from?.week.profit ?? 0,
                                    token: contract.token,
                                  })}
                                </div>
                                <div
                                  className={clsx(
                                    'text-sm font-semibold',
                                    (metric.from?.week.profitPercent ?? 0) > 0
                                      ? 'text-teal-500'
                                      : 'text-ink-500'
                                  )}
                                >
                                  <span
                                    className={clsx(
                                      'ml-1 rounded-full px-1.5 py-0.5 text-xs',
                                      (metric.from?.week.profitPercent ?? 0) > 0
                                        ? 'bg-teal-100 text-teal-800'
                                        : 'bg-canvas-50 text-ink-600'
                                    )}
                                  >
                                    {(metric.from?.week.profitPercent ?? 0) > 0
                                      ? '+'
                                      : ''}
                                    {(
                                      metric.from?.week.profitPercent ?? 0
                                    ).toFixed(0)}
                                    %
                                  </span>
                                </div>
                              </>
                            )}
                            {value === 'position' && (
                              <>
                                <div className="text-ink-900 font-semibold">
                                  {formatWithToken({
                                    amount: sum(
                                      Object.values(metric.totalShares)
                                    ),
                                    token: contract.token,
                                  }).replace('-', '')}
                                </div>
                                <div className="text-ink-500 text-sm">
                                  {maxOutcome && `${maxOutcome}`}
                                </div>
                              </>
                            )}
                            {value === 'liquidity' && (
                              <div className="text-ink-900 whitespace-nowrap font-semibold">
                                {formatWithToken({
                                  amount: contract.totalLiquidity,
                                  token: contract.token,
                                })}
                              </div>
                            )}
                            {value === 'closeTime' && (
                              <>
                                <div className="text-ink-900 whitespace-nowrap font-semibold">
                                  {closeDate ? (
                                    <RelativeTimestamp
                                      time={closeDate}
                                      className="text-ink-900 font-semibold"
                                      shortened
                                    />
                                  ) : (
                                    'No close'
                                  )}
                                </div>
                                <div className="text-ink-500 text-sm">
                                  {contract.isResolved
                                    ? 'Resolved'
                                    : closeDate && closeDate < Date.now()
                                    ? 'Closed'
                                    : ''}
                                </div>
                              </>
                            )}
                            {value === 'dayPctChange' && (
                              <div
                                className={clsx(
                                  'font-semibold',
                                  (metric.from?.day.profitPercent ?? 0) > 0
                                    ? 'text-teal-500'
                                    : 'text-ink-600'
                                )}
                              >
                                {(metric.from?.day.profitPercent ?? 0).toFixed(
                                  1
                                )}
                                %
                              </div>
                            )}
                            {value === 'costBasis' && (
                              <div className="text-ink-900 font-semibold">
                                {formatWithToken({
                                  amount: metric.invested,
                                  token: contract.token,
                                })}
                              </div>
                            )}
                            {value === 'loan' && (
                              <div className="text-ink-900 font-semibold">
                                {formatWithToken({
                                  amount: (metric.loan ?? 0) + (metric.marginLoan ?? 0),
                                  token: contract.token,
                                })}
                              </div>
                            )}
                            {value === 'dayPriceChange' && (
                              <div className="text-ink-900 font-semibold">
                                {contract.mechanism === 'cpmm-1' ? (
                                  <span>
                                    {contract.probChanges.day > 0 ? '+' : ''}
                                    {(contract.probChanges.day * 100).toFixed(
                                      1
                                    )}
                                  </span>
                                ) : (
                                  <span className="text-ink-600">-</span>
                                )}
                              </div>
                            )}
                            {value === 'volume24h' && (
                              <div className="text-ink-900 font-semibold">
                                {formatWithToken({
                                  amount: contract.volume24Hours,
                                  token: contract.token,
                                })}
                              </div>
                            )}
                            {value === 'priceDiff' &&
                              (() => {
                                const lastProb = metric.lastProb
                                const currentProb =
                                  contract.mechanism === 'cpmm-1'
                                    ? contract.prob
                                    : null
                                const maxOutcome = getMaxSharesOutcome(metric)
                                if (
                                  !lastProb ||
                                  currentProb === null ||
                                  !maxOutcome
                                ) {
                                  return (
                                    <span className="text-ink-400 text-xs">
                                      --
                                    </span>
                                  )
                                }

                                let userPrice: number
                                let currentPrice: number

                                if (maxOutcome === 'YES') {
                                  userPrice = lastProb
                                  currentPrice = currentProb
                                } else if (maxOutcome === 'NO') {
                                  userPrice = 1 - lastProb
                                  currentPrice = 1 - currentProb
                                } else {
                                  return (
                                    <span className="text-ink-400 text-xs">
                                      --
                                    </span>
                                  )
                                }

                                const changeSinceLastTrade =
                                  ((userPrice - currentPrice) / userPrice) * 100

                                return (
                                  <div
                                    className={clsx(
                                      'font-semibold',
                                      changeSinceLastTrade < 0
                                        ? 'text-teal-500'
                                        : changeSinceLastTrade > 0
                                        ? 'text-scarlet-500'
                                        : 'text-ink-600'
                                    )}
                                  >
                                    {changeSinceLastTrade < 0 ? '' : '-'}
                                    {changeSinceLastTrade
                                      .toFixed(0)
                                      .replace('-', '+')}
                                    %
                                  </div>
                                )
                              })()}
                          </div>
                        ))}

                      {/* Chevron cell */}
                      <div className=" group-hover:bg-canvas-50 border-ink-200 border-b py-3">
                        <div className="pt-1">
                          <ChevronDownIcon
                            className={clsx(
                              'text-ink-500 h-4 w-4 transition-transform',
                              expandedIds.includes(contract.id)
                                ? 'rotate-180'
                                : ''
                            )}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Expanded content below the main row content */}
                  {expandedIds.includes(contract.id) && (
                    <div className="border-ink-200 border-t px-2 py-2">
                      <ExpandedBetRow
                        contract={contract}
                        user={user}
                        signedInUser={signedInUser}
                        contractMetric={metric}
                        areYourBets={areYourBets}
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <LoadMoreUntilNotVisible
            loadMore={() => Promise.resolve(loadMore())}
          />
        </div>
      </div>
    </div>
  )
}

const ExpandedBetRow = (props: {
  contract: Contract
  user: User
  signedInUser: User | null | undefined
  contractMetric: ContractMetric
  areYourBets: boolean
}) => {
  const { contract, user, signedInUser, contractMetric, areYourBets } = props
  const hideBetsBefore = areYourBets ? 0 : JUNE_1_2022
  const bets = useContractBets(
    contract.id,
    {
      userId: user.id,
      afterTime: hideBetsBefore,
    },
    useIsPageVisible,
    (params) => api('bets', params)
  )
  const limitBets = bets?.filter(
    (bet) => bet.limitProb !== undefined && !bet.isCancelled && !bet.isFilled
  ) as LimitBet[]

  const includeSellButtonForUser =
    areYourBets &&
    !contract.isResolved &&
    (contract.closeTime ?? 0) > Date.now() &&
    contract.mechanism === 'cpmm-1'
      ? signedInUser
      : undefined
  if (bets === undefined) {
    return (
      <Col className={'w-full items-center justify-center'}>
        <LoadingIndicator />
      </Col>
    )
  }
  return (
    <Col className={'mt-1 w-full gap-1'}>
      <BetsSummary
        className="mb-6 mt-6 flex"
        contract={contract}
        metric={contractMetric}
        includeSellButton={includeSellButtonForUser}
        areYourBets={areYourBets}
      />
      {contract.mechanism === 'cpmm-1' && limitBets.length > 0 && (
        <div className="max-w-md">
          <div className=" font-semibold">Limit orders</div>
          <OrderTable
            contract={contract}
            limitBets={limitBets}
            isYou={areYourBets}
          />
          <div className="font-semibold">Bets</div>
        </div>
      )}

      <ContractBetsTable
        key={contract.id + 'bets-table'}
        contract={contract}
        bets={bets}
        isYourBets={areYourBets}
        contractMetric={contractMetric}
        paginate
        defaultExpanded
      />
    </Col>
  )
}

export function LoadingMetricRow() {
  return (
    <div className="animate-pulse py-4">
      <Row className="mb-2 items-center gap-2">
        <div className="h-6 w-6 rounded-full bg-gray-200" />
        <div className="h-4 w-48 rounded bg-gray-200 sm:w-96" />
      </Row>

      <Row className="mt-2 justify-between gap-4">
        <div className="h-4 w-16 rounded bg-gray-200" />
        <div className="h-4 w-20 rounded bg-gray-200" />
        <div className="h-4 w-20 rounded bg-gray-200" />
        <div className="h-4 w-16 rounded bg-gray-200" />
        <div className="h-4 w-16 rounded bg-gray-200" />
        <div className="h-4 w-16 rounded bg-gray-200" />
      </Row>
    </div>
  )
}

// Extracted header component
function BetsTableHeaders(props: {
  visibleColumns: BetSort[]
  isDesktop: boolean
  sortOption: { field: BetSort; direction: 'asc' | 'desc' }
  handleHeaderClick: (field: BetSort) => void
}) {
  const { visibleColumns, isDesktop, sortOption, handleHeaderClick } = props

  return (
    <div className="bg-canvas-0 sticky top-0 flex w-full text-sm">
      {/* Question header */}
      <div
        className={clsx(
          'text-ink-500 border-ink-200 border-b px-2 py-2',
          'w-full min-w-[160px]',
          'bg-canvas-0 sticky left-0 z-10'
        )}
      >
        Question
      </div>

      {/* Data columns headers container */}
      <div
        className={clsx(
          'flex items-center justify-end',
          !isDesktop && 'flex-grow'
        )}
      >
        {availableColumns
          .filter((column) => visibleColumns.includes(column.value))
          .map((column) => {
            const sortField = column.value as BetSort
            const isSortingByThis = sortOption.field === sortField

            return (
              <div
                key={column.value}
                className={clsx(
                  'text-ink-500 w-[90px] flex-shrink-0 cursor-pointer py-2 text-right text-sm',
                  'border-ink-200 border-b'
                )}
                onClick={() => handleHeaderClick(sortField)}
              >
                <Row className="relative items-center justify-end gap-1">
                  <span>
                    {column.tooltip ? (
                      <Tooltip text={column.tooltip} placement="top">
                        {column.label}
                      </Tooltip>
                    ) : (
                      column.label
                    )}
                  </span>
                  {isSortingByThis ? (
                    sortOption.direction === 'desc' ? (
                      <ArrowSmDownIcon className="absolute -right-4 h-4 w-4" />
                    ) : (
                      <ArrowSmUpIcon className="absolute -right-4 h-4 w-4" />
                    )
                  ) : null}
                </Row>
              </div>
            )
          })}

        {/* Empty space for chevron */}
        <div className="w-[28px] flex-shrink-0 py-2"></div>
      </div>
    </div>
  )
}
