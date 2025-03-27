'use client'
import clsx from 'clsx'
import { LimitBet } from 'common/bet'
import { getContractBetNullMetrics } from 'common/calculate'
import {
  Contract,
  contractPath,
  CPMMContract,
  MarketContract,
} from 'common/contract'
import { ContractMetric } from 'common/contract-metric'
import { SWEEPIES_MARKET_TOOLTIP } from 'common/envs/constants'
import { buildArray } from 'common/util/array'
import { formatWithToken } from 'common/util/format'
import { searchInAny } from 'common/util/parse'
import { Dictionary, sortBy, sum, uniqBy, mapValues } from 'lodash'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { BetsSummary } from 'web/components/bet/bet-summary'
import { ContractBetsTable } from 'web/components/bet/contract-bets-table'
import { OrderTable } from 'web/components/bet/order-book'
import { PillButton } from 'web/components/buttons/pill-button'
import { Input } from 'web/components/widgets/input'
import { Pagination } from 'web/components/widgets/pagination'
import { useContractBets } from 'client-common/hooks/use-bets'
import { useEvent } from 'client-common/hooks/use-event'
import { usePersistentInMemoryState } from 'client-common/hooks/use-persistent-in-memory-state'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import { usePersistentQueryState } from 'web/hooks/use-persistent-query-state'
import { useIsAuthorized, useUser } from 'web/hooks/use-user'
import { api } from 'web/lib/api/api'
import { User } from 'web/lib/firebase/users'
import { SweepiesCoin } from 'web/public/custom-components/sweepiesCoin'
import { useSweepstakes } from '../sweepstakes-provider'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { linkClass } from '../widgets/site-link'
import { Tooltip } from '../widgets/tooltip'
import { floatingEqual } from 'common/util/math'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { useIsPageVisible } from 'web/hooks/use-page-visible'
import { LimitOrdersTable } from './limit-orders-table'
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react'
import { ChevronDownIcon } from '@heroicons/react/solid'
import { ContractStatusLabel } from '../contract/contracts-table'
import { BinaryOutcomeLabel, MultiOutcomeLabel } from '../outcome-label'
import { RelativeTimestamp } from '../relative-timestamp'

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

  const [page, setPage] = usePersistentInMemoryState(0, 'portfolio-page')

  const [query, setQuery] = usePersistentQueryState('b', '')

  const onSetFilter = (f: BetFilter | 'limit_orders') => {
    if (f === 'limit_orders') {
      setShowLimitOrders(true)
      return
    }
    // When selecting any other filter, turn off limit orders view
    setShowLimitOrders(false)
    setFilter(f as BetFilter)
    setPage(0)
  }

  const toggleTokenFilter = () => {
    setPrefersPlay(!prefersPlay)
    setPage(0)
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

  // Define sort options for the dropdown
  const [sortOption, setSortOption] = usePersistentInMemoryState<{
    field: BetSort
    direction: 'asc' | 'desc'
  }>({ field: 'newest', direction: 'desc' }, 'bets-list-sort')

  const sortOptions: {
    label: string
    field: BetSort
    direction: 'asc' | 'desc'
  }[] = [
    { label: 'Newest', field: 'newest', direction: 'desc' },
    { label: 'Oldest', field: 'newest', direction: 'asc' },
    { label: 'Highest Value', field: 'value', direction: 'desc' },
    { label: 'Highest Position', field: 'position', direction: 'desc' },
    { label: 'Highest Profit', field: 'profit', direction: 'desc' },
    { label: 'Lowest Profit', field: 'profit', direction: 'asc' },
    { label: 'Highest 1d Change', field: 'day', direction: 'desc' },
    { label: 'Lowest 1d Change', field: 'day', direction: 'asc' },
    { label: 'Highest 1w Change', field: 'week', direction: 'desc' },
    { label: 'Lowest 1w Change', field: 'week', direction: 'asc' },
    { label: 'Closing Soon', field: 'closeTime', direction: 'asc' },
  ]

  const filterOptions = [
    { label: 'All', value: 'all' },
    { label: 'Open', value: 'open' },
    { label: 'Sold', value: 'sold' },
    { label: 'Closed', value: 'closed' },
    { label: 'Resolved', value: 'resolved' },
    { label: 'Limit Orders', value: 'limit_orders' },
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

  const onSelectSortOption = (option: {
    field: BetSort
    direction: 'asc' | 'desc'
  }) => {
    setSortOption(option)
    setPage(0)
  }

  return (
    <Col className="relative">
      <div
        className={clsx(
          'flex flex-wrap justify-between max-sm:flex-col',
          !showLimitOrders && 'bg-canvas-0 sticky top-0 z-10 pt-1'
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
                  <MenuItems className="bg-canvas-0 border-ink-200 absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-md border shadow-lg">
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
                    <MenuItems className="bg-canvas-0 border-ink-200 absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-md border shadow-lg">
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
                    <MenuItems className="bg-canvas-0 border-ink-200 absolute right-0 z-10 mt-1 max-h-80 w-48 overflow-auto rounded-md border shadow-lg sm:max-h-none sm:overflow-hidden">
                      {sortOptions.map((option) => (
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
        <Row className="text-ink-500 w-full justify-between px-2 pt-2 text-sm">
          <Col className="">Question</Col>
          <Col className="pr-6 text-right">Value</Col>
        </Row>
      </div>

      {!loaded ? (
        <Col className="divide-ink-300 mt-6 divide-y">
          <LoadingMetricRow />
          <LoadingMetricRow />
          <LoadingMetricRow />
        </Col>
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
          page={page}
          user={user}
          setPage={setPage}
          filter={filter}
          signedInUser={signedInUser}
          sortOption={sortOption}
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

function BetsTable(props: {
  contracts: MarketContract[]
  metricsByContractId: { [key: string]: ContractMetric }
  page: number
  setPage: (page: number) => void
  filter: BetFilter
  user: User
  signedInUser: User | null | undefined
  sortOption: { field: BetSort; direction: 'asc' | 'desc' }
}) {
  const {
    metricsByContractId,
    page,
    setPage,
    filter,
    user,
    signedInUser,
    sortOption,
  } = props
  const areYourBets = user.id === signedInUser?.id

  // Most of these are descending sorts by default.
  const SORTS: Record<BetSort, (c: Contract) => number> = {
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
      (filter === 'open' ? -1 : 1) *
      (c.resolutionTime ?? c.closeTime ?? Infinity),
  }

  const sortFunction = SORTS[sortOption.field]
  const contracts =
    sortOption.direction === 'desc'
      ? sortBy(props.contracts, sortFunction)
      : sortBy(props.contracts, sortFunction).reverse()

  const rowsPerSection = 50
  const currentSlice = page * rowsPerSection

  const [expandedIds, setExpandedIds] = useState<string[]>([])
  const setNewExpandedId = (id: string) => {
    setExpandedIds((oldIds) =>
      oldIds.includes(id)
        ? oldIds.filter((oldId) => oldId !== id)
        : [...oldIds, id]
    )
  }

  return (
    <Col className="mb-4 flex-1">
      <Col className={'w-full'}>
        {contracts
          .slice(currentSlice, currentSlice + rowsPerSection)
          .map((contract) => {
            const metric = metricsByContractId[contract.id]
            const closeDate = contract.resolutionTime ?? contract.closeTime
            const date = closeDate ? new Date(closeDate) : null
            const isThisYear = date
              ? new Date().getFullYear() === date.getFullYear()
              : false
            const dateString = date
              ? date.toLocaleDateString('en-US', {
                  month: '2-digit',
                  day: '2-digit',
                  year: isThisYear ? undefined : '2-digit',
                })
              : 'N/A'
            const resolvedAnswer =
              contract.mechanism === 'cpmm-multi-1'
                ? contract.answers.find(
                    (a) =>
                      a.id === contract.resolution ||
                      (contract.resolutions?.[a.id] ?? 0) >= 99
                  )
                : undefined

            const maxOutcome = metricsByContractId[contract.id].maxSharesOutcome
            const showOutcome = maxOutcome && contract.outcomeType === 'BINARY'

            return (
              <Row
                key={contract.id + 'bets-table-row'}
                className={
                  'border-ink-200 hover:bg-canvas-50 cursor-pointer border-b py-3'
                }
                onClick={() => setNewExpandedId(contract.id)}
              >
                <Col className="w-full px-2">
                  <Row className="justify-between">
                    {/* Left side - Question, probability and creator */}
                    <Col className="w-3/4">
                      <Link
                        href={contractPath(contract)}
                        className={clsx(
                          linkClass,
                          'line-clamp-2 text-lg font-medium'
                        )}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {contract.token == 'CASH' && (
                          <Tooltip
                            text={SWEEPIES_MARKET_TOOLTIP}
                            className="relative mr-0.5 inline-flex h-[1em] w-[1.1em] items-baseline"
                          >
                            <SweepiesCoin className="absolute inset-0 top-[0.2em]" />
                          </Tooltip>
                        )}
                        {contract.question}
                      </Link>
                      <Row className="mt-1 items-center">
                        {contract.isResolved ? (
                          <span className="text-ink-800 mr-1 text-sm">
                            {contract.outcomeType === 'MULTIPLE_CHOICE' ? (
                              Object.values(contract.resolutions ?? {}).filter(
                                (r) => r > 1
                              ).length > 1 || contract.resolution === 'MKT' ? (
                                <span>MULTI</span>
                              ) : contract.resolution === 'CANCEL' ? (
                                <BinaryOutcomeLabel outcome="CANCEL" />
                              ) : resolvedAnswer ? (
                                <MultiOutcomeLabel
                                  answer={resolvedAnswer}
                                  resolution={contract.resolution ?? ''}
                                  truncate="none"
                                  answerClassName={
                                    'font-bold text-base-400 !break-normal'
                                  }
                                />
                              ) : null
                            ) : (
                              <ContractStatusLabel contract={contract} />
                            )}
                            <span className="text-ink-500 ml-1 text-sm">•</span>
                          </span>
                        ) : contract.outcomeType !== 'MULTIPLE_CHOICE' ? (
                          <span className="text-ink-800 mr-1 text-sm">
                            <ContractStatusLabel contract={contract} />
                            <span className="text-ink-500 ml-1 text-sm">•</span>
                          </span>
                        ) : null}
                        <Row className="items-center gap-1">
                          {/* <Avatar
                            avatarUrl={contract.creatorAvatarUrl}
                            username={contract.creatorUsername}
                            size={'xs'}
                          /> */}
                          {/* <span className="text-ink-500 text-sm">
                            {contract.creatorName}
                            </span> */}
                          <span className="text-ink-500 text-sm">
                            to win{' '}
                            {formatWithToken({
                              amount: sum(Object.values(metric.totalShares)),
                              token: contract.token === 'CASH' ? 'CASH' : 'M$',
                            }).replace('-', '')}{' '}
                            {showOutcome ? `on ${maxOutcome}` : ''}
                          </span>
                          {sortOption.field === 'closeTime' ? (
                            <span className="text-ink-500 text-sm">
                              • {dateString}
                            </span>
                          ) : sortOption.field === 'newest' ? (
                            <span className="text-ink-500 text-sm">
                              •
                              <RelativeTimestamp
                                time={metric.lastBetTime}
                                className="text-ink-500 text-sm"
                                shortened
                              />
                            </span>
                          ) : null}
                        </Row>
                      </Row>
                    </Col>

                    {/* Right side - Value and profit */}
                    <Row className="items-start gap-2">
                      <Col className="text-right">
                        {/* Display different values based on sort selection */}
                        {/* {sortOption.field === 'position' ? (
                          <span className="text-ink-900 text-lg font-medium">
                            {formatWithToken({
                              amount: sum(Object.values(metric.totalShares)),
                              token: contract.token,
                            }).replace('-', '')}
                          </span>
                        ) : ( */}
                        <span className="text-ink-900 text-lg font-medium">
                          {formatWithToken({
                            amount: metric.payout,
                            token: contract.token,
                          }).replace('-', '')}
                        </span>
                        {/* )} */}

                        {sortOption.field === 'day' ? (
                          <span
                            className={clsx(
                              'text-sm font-medium',
                              (metric.from?.day.profit ?? 0) > 0
                                ? 'text-teal-500'
                                : 'text-ink-500'
                            )}
                          >
                            {(metric.from?.day.profit ?? 0) > 0 ? '+' : ''}
                            {formatWithToken({
                              amount: metric.from?.day.profit ?? 0,
                              token: contract.token,
                            }).replace('-', '')}
                            <span
                              className={clsx(
                                'ml-1 rounded-full px-1.5 py-0.5 text-xs',
                                (metric.from?.day.profitPercent ?? 0) > 0
                                  ? 'bg-teal-100 text-teal-800'
                                  : 'bg-canvas-50 text-ink-600'
                              )}
                            >
                              {(metric.from?.day.profitPercent ?? 0) > 0
                                ? '+'
                                : ''}
                              {(metric.from?.day.profitPercent ?? 0).toFixed(0)}
                              %
                            </span>
                          </span>
                        ) : sortOption.field === 'week' ? (
                          <span
                            className={clsx(
                              'text-sm font-medium',
                              (metric.from?.week.profit ?? 0) > 0
                                ? 'text-teal-500'
                                : 'text-ink-500'
                            )}
                          >
                            {(metric.from?.week.profit ?? 0) > 0 ? '+' : ''}
                            {formatWithToken({
                              amount: metric.from?.week.profit ?? 0,
                              token: contract.token,
                            }).replace('-', '')}
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
                              {(metric.from?.week.profitPercent ?? 0).toFixed(
                                0
                              )}
                              %
                            </span>
                          </span>
                        ) : (
                          <span
                            className={clsx(
                              'text-sm font-medium',
                              metric.profit > 0
                                ? 'text-teal-500'
                                : 'text-ink-500'
                            )}
                          >
                            {sortOption.field === 'profit' && (
                              <>
                                {(metric.profit ?? 0) > 0 ? '+' : ''}
                                {formatWithToken({
                                  amount: metric.profit ?? 0,
                                  token: contract.token,
                                }).replace('-', '')}
                              </>
                            )}
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
                          </span>
                        )}
                      </Col>
                      <Col className="flex items-start pt-1">
                        <ChevronDownIcon
                          className={clsx(
                            'text-ink-500 h-4 w-4 transition-transform',
                            expandedIds.includes(contract.id)
                              ? 'rotate-180'
                              : ''
                          )}
                        />
                      </Col>
                    </Row>
                  </Row>

                  {/* Expanded View */}
                  {expandedIds.includes(contract.id) && (
                    <ExpandedBetRow
                      contract={contract}
                      user={user}
                      signedInUser={signedInUser}
                      contractMetric={metricsByContractId[contract.id]}
                      areYourBets={areYourBets}
                    />
                  )}
                </Col>
              </Row>
            )
          })}
      </Col>

      <Pagination
        page={page}
        pageSize={rowsPerSection}
        totalItems={contracts.length}
        setPage={setPage}
      />
    </Col>
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
        className="!mb-6 mt-6 flex"
        contract={contract}
        metrics={contractMetric}
        hideTweet
        includeSellButton={includeSellButtonForUser}
        hideProfit={true}
        hideValue={true}
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
