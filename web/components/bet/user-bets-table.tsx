'use client'
import { debounce, Dictionary, groupBy, max, sortBy, sum, uniqBy } from 'lodash'
import { ReactNode, useEffect, useMemo, useState } from 'react'

import { LimitBet } from 'common/bet'
import { getContractBetNullMetrics } from 'common/calculate'
import { contractPath, CPMMContract } from 'common/contract'
import { ContractMetric } from 'common/contract-metric'
import { buildArray } from 'common/util/array'
import { formatMoney, shortFormatNumber } from 'common/util/format'
import { searchInAny } from 'common/util/parse'
import { Input } from 'web/components/widgets/input'
import { useIsAuthorized, useUser } from 'web/hooks/use-user'
import { Bet } from 'web/lib/firebase/bets'
import { Contract } from 'web/lib/firebase/contracts'
import { User } from 'web/lib/firebase/users'
import { getOpenLimitOrdersWithContracts } from 'web/lib/supabase/bets'
import { db } from 'web/lib/supabase/db'
import { Col } from '../layout/col'
import { LoadingIndicator } from '../widgets/loading-indicator'
import Link from 'next/link'
import { Row } from 'web/components/layout/row'
import { Select } from 'web/components/widgets/select'
import { Pagination } from 'web/components/widgets/pagination'
import { getBets } from 'common/supabase/bets'
import clsx from 'clsx'
import { ContractStatusLabel } from 'web/components/contract/contracts-table'
import { UserLink } from 'web/components/widgets/user-link'
import { ENV_CONFIG } from 'common/envs/constants'
import { OrderTable } from 'web/components/bet/order-book'
import { RelativeTimestamp } from 'web/components/relative-timestamp'
import { BiCaretDown, BiCaretUp } from 'react-icons/bi'
import { BetsSummary } from 'web/components/bet/bet-summary'
import { ContractBetsTable } from 'web/components/bet/contract-bets-table'
import { ProfitBadge } from 'web/components/profit-badge'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { getUserContractsMetricsWithContracts } from 'web/lib/firebase/api'
import { useEvent } from 'web/hooks/use-event'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { usePersistentQueryState } from 'web/hooks/use-persistent-query-state'
import { linkClass } from '../widgets/site-link'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'

type BetSort =
  | 'newest'
  | 'profit'
  | 'closeTime'
  | 'value'
  | 'day'
  | 'week'
  | 'month'
  | 'probChangeDay'
  | 'profitPercent'
  | 'dayPercent'

type BetFilter = 'open' | 'limit_bet' | 'sold' | 'closed' | 'resolved' | 'all'

const JUNE_1_2022 = new Date('2022-06-01T00:00:00.000Z').valueOf()
export function UserBetsTable(props: { user: User }) {
  const { user } = props

  const signedInUser = useUser()
  const isAuth = useIsAuthorized()

  const [metricsByContract, setMetricsByContract] = usePersistentInMemoryState<
    Dictionary<ContractMetric> | undefined
  >(undefined, `user-contract-metrics-${user.id}`)

  const [initialContracts, setInitialContracts] = usePersistentInMemoryState<
    Contract[] | undefined
  >(undefined, `user-contract-metrics-contracts-${user.id}`)

  const [openLimitBetsByContract, setOpenLimitBetsByContract] =
    usePersistentInMemoryState<Dictionary<LimitBet[]> | undefined>(
      undefined,
      `user-open-limit-bets-${user.id}`
    )
  const debounceGetMetrics = useEvent(debounce(() => getMetrics(), 100))
  useEffect(() => {
    debounceGetMetrics()
  }, [user.id, isAuth])
  const getMetrics = () =>
    getUserContractsMetricsWithContracts({
      userId: user.id,
      offset: 0,
      limit: 5000,
    }).then((res) => {
      const { data, error } = res
      if (error) {
        console.error(error)
        return
      }
      const { contracts, metricsByContract } = data
      setMetricsByContract(metricsByContract)
      setInitialContracts((c) =>
        uniqBy(buildArray([...(c ?? []), ...contracts]), 'id')
      )
    })

  useEffect(() => {
    getOpenLimitOrdersWithContracts(user.id, 5000).then((betsWithContracts) => {
      const { contracts, betsByContract } = betsWithContracts
      setOpenLimitBetsByContract(betsByContract)
      setInitialContracts((c) =>
        uniqBy(buildArray([...(c ?? []), ...contracts]), 'id')
      )
    })
  }, [setInitialContracts, setOpenLimitBetsByContract, user.id, isAuth])

  const [filter, setFilter] = usePersistentLocalState<BetFilter>(
    'all',
    'bets-list-filter'
  )
  const [page, setPage] = usePersistentInMemoryState(0, 'portfolio-page')

  const [query, setQuery] = usePersistentQueryState('b', '')

  const onSetFilter = (f: BetFilter) => {
    setFilter(f)
    setPage(0)
  }

  const nullableMetricsByContract = useMemo(() => {
    if (!metricsByContract || !initialContracts) {
      return undefined
    }
    // check if we have any contracts that don't have contractMetrics, if so, add them in as getContractBetNullMetrics
    const missingContracts = initialContracts.filter(
      (c) => !metricsByContract[c.id]
    )
    const missingMetrics = Object.fromEntries(
      missingContracts.map((c) => [c.id, getContractBetNullMetrics()])
    )

    return {
      ...metricsByContract,
      ...missingMetrics,
    }
  }, [JSON.stringify(initialContracts), metricsByContract])

  if (
    !nullableMetricsByContract ||
    !openLimitBetsByContract ||
    !initialContracts
  ) {
    return <LoadingIndicator />
  }
  if (Object.keys(nullableMetricsByContract).length === 0)
    return <NoBets user={user} />

  const contracts = query
    ? initialContracts.filter((c) =>
        searchInAny(query, c.question, c.creatorName, c.creatorUsername)
      )
    : initialContracts

  const FILTERS: Record<BetFilter, (c: Contract) => boolean> = {
    resolved: (c) => !!c.resolutionTime,
    closed: (c) =>
      !FILTERS.resolved(c) && (c.closeTime ?? Infinity) < Date.now(),
    open: (c) => !(FILTERS.closed(c) || FILTERS.resolved(c)),
    all: () => true,
    sold: () => true,
    limit_bet: (c) => FILTERS.open(c),
  }

  const filteredContracts = contracts.filter(FILTERS[filter]).filter((c) => {
    if (filter === 'all') return true
    const { hasShares } = nullableMetricsByContract[c.id]
    if (filter === 'sold') return !hasShares
    if (filter === 'limit_bet') return openLimitBetsByContract[c.id]?.length > 0
    return hasShares
  })

  return (
    <Col>
      <div className="flex flex-wrap justify-between gap-4 max-sm:flex-col">
        <Row className="grow gap-2 ">
          <Input
            placeholder="Search"
            className={'w-full min-w-[30px]'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <Select
            value={filter}
            onChange={(e) => onSetFilter(e.target.value as BetFilter)}
            className="py-1"
          >
            <option value="all">All</option>
            <option value="open">Active</option>
            <option value="limit_bet">Limit orders</option>
            <option value="sold">Sold</option>
            <option value="closed">Closed</option>
            <option value="resolved">Resolved</option>
          </Select>
        </Row>
      </div>

      <Col className="divide-ink-300 mt-6 divide-y">
        {filteredContracts.length === 0 ? (
          <NoMatchingBets />
        ) : (
          nullableMetricsByContract && (
            <BetsTable
              contracts={filteredContracts as CPMMContract[]}
              metricsByContractId={nullableMetricsByContract}
              openLimitBetsByContract={openLimitBetsByContract}
              page={page}
              user={user}
              setPage={setPage}
              filter={filter}
              signedInUser={signedInUser}
            />
          )
        )}
      </Col>
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
const NoMatchingBets = () => (
  <div className="text-ink-700 py-4 text-center">
    No bets match the current filter
  </div>
)

function BetsTable(props: {
  contracts: CPMMContract[]
  metricsByContractId: { [key: string]: ContractMetric }
  openLimitBetsByContract: { [key: string]: LimitBet[] }
  page: number
  setPage: (page: number) => void
  filter: BetFilter
  user: User
  signedInUser: User | null | undefined
}) {
  const {
    metricsByContractId,
    page,
    setPage,
    filter,
    openLimitBetsByContract,
    user,
    signedInUser,
  } = props
  const areYourBets = user.id === signedInUser?.id
  const [sort, setSort] = usePersistentInMemoryState<{
    field: BetSort
    direction: 'asc' | 'desc'
  }>({ field: 'newest', direction: 'desc' }, 'bets-list-sort')
  const onSetSort = (field: BetSort) => {
    if (sort.field === field) {
      setSort((prevSort) => ({
        ...prevSort,
        direction: prevSort.direction === 'asc' ? 'desc' : 'asc',
      }))
    } else {
      setSort({ field, direction: 'desc' })
    }
    setPage(0)
  }

  // Most of these are descending sorts by default.
  const SORTS: Record<BetSort, (c: Contract) => number> = {
    profit: (c) => -metricsByContractId[c.id].profit,
    profitPercent: (c) => -metricsByContractId[c.id].profitPercent,
    value: (c) =>
      -(
        metricsByContractId[c.id].payout +
        (filter === 'limit_bet'
          ? sum(openLimitBetsByContract[c.id].map((b) => b.orderAmount))
          : 0)
      ),
    newest: (c) =>
      -(
        metricsByContractId[c.id].lastBetTime ??
        max(openLimitBetsByContract[c.id]?.map((b) => b.createdTime)) ??
        0
      ),
    probChangeDay: (c) => {
      if (c.mechanism === 'cpmm-1') {
        return -(c as CPMMContract).probChanges.day
      }
      return 0
    },
    day: (c) => -(metricsByContractId[c.id].from?.day.profit ?? 0),
    dayPercent: (c) =>
      -(metricsByContractId[c.id].from?.day.profitPercent ?? 0),
    week: (c) => -(metricsByContractId[c.id].from?.week.profit ?? 0),
    month: (c) => -(metricsByContractId[c.id].from?.month.profit ?? 0),
    closeTime: (c) =>
      // This is in fact the intuitive sort direction.
      (filter === 'open' ? -1 : 1) *
      (c.resolutionTime ?? c.closeTime ?? Infinity),
  }
  const contracts =
    sort.direction === 'desc'
      ? sortBy(props.contracts, SORTS[sort.field])
      : sortBy(props.contracts, SORTS[sort.field]).reverse()
  const rowsPerSection = 50
  const currentSlice = page * rowsPerSection
  const isMobile = useIsMobile(600)

  const dataColumns = buildArray([
    {
      header: { sort: 'probChangeDay', label: 'Prob' },
      span: isMobile ? 3 : 2,
      renderCell: (c: Contract) => {
        let change: string | undefined
        if (c.mechanism === 'cpmm-1') {
          const probChange = Math.round(
            (c as CPMMContract).probChanges.day * 100
          )
          change =
            probChange !== 0
              ? (probChange > 0 ? '+' : '') +
                probChange +
                (c.outcomeType === 'BINARY' ? '' : '%')
              : ''
        }
        return (
          <Row className={'justify-left relative items-center'}>
            <ContractStatusLabel className={'font-bold'} contract={c} />
            {change != undefined && (
              <span className={'text-ink-500 ml-1 text-xs'}>{change}</span>
            )}
          </Row>
        )
      },
    },
    {
      header: { sort: 'newest', label: 'Time' },
      span: isMobile ? 2 : 1,
      renderCell: (c: Contract) => (
        <Row className={'justify-end'}>
          <RelativeTimestamp
            time={metricsByContractId[c.id].lastBetTime}
            shortened
            className="text-ink-500"
          />
        </Row>
      ),
    },
    !isMobile && {
      header: { sort: 'closeTime', label: 'Close' },
      span: 3,
      renderCell: (c: Contract) => {
        const date = new Date(c.resolutionTime ?? c.closeTime ?? Infinity)
        const isThisYear = new Date().getFullYear() === date.getFullYear()
        const dateString = date.toLocaleDateString('en-US', {
          month: '2-digit',
          day: '2-digit',
          year: isThisYear ? undefined : '2-digit',
        })
        return (
          <Row className={'justify-end'}>
            <span className={'text-ink-500'}>{dateString}</span>
          </Row>
        )
      },
    },
    {
      header: { sort: 'value', label: 'Value' },
      span: isMobile ? 3 : 2,
      renderCell: (c: Contract) => (
        <NumberCell num={metricsByContractId[c.id].payout} />
      ),
    },
    {
      header: { sort: 'profit', label: 'Profit' },
      span: isMobile ? 3 : 2,
      renderCell: (c: Contract) => (
        <NumberCell num={metricsByContractId[c.id].profit} change={true} />
      ),
    },
    !isMobile && {
      header: { sort: 'profitPercent', label: '%' },
      span: 1,
      renderCell: (c: Contract) => {
        const cm = metricsByContractId[c.id]
        return (
          <span
            className={'flex-inline -mr-3 flex justify-end md:-mr-2 lg:mr-0'}
          >
            <ProfitBadge
              className={'!px-1'}
              profitPercent={cm.profitPercent}
              round={true}
              grayColor={formatMoney(cm.profit ?? 0) === formatMoney(0)}
            />
          </span>
        )
      },
    },
    {
      header: { sort: 'day', label: '1d Profit' },
      span: isMobile ? 4 : 2,
      renderCell: (c: Contract) => (
        <NumberCell
          num={metricsByContractId[c.id].from?.day.profit ?? 0}
          change={true}
        />
      ),
    },
    !isMobile && {
      header: { sort: 'dayPercent', label: '%' },
      span: 1,
      renderCell: (c: Contract) => {
        const cm = metricsByContractId[c.id]
        const profitPercent = cm.from?.day.profitPercent ?? 0
        // Gives ~infinite returns
        if ((cm.from?.day.invested ?? 0) < 0.01) return <div />
        return (
          <span
            className={'flex-inline -mr-3 flex justify-end md:-mr-2 lg:mr-0'}
          >
            <ProfitBadge
              className={'!px-1'}
              profitPercent={profitPercent}
              round={true}
              grayColor={
                formatMoney(cm.from?.day.profit ?? 0) === formatMoney(0)
              }
            />
          </span>
        )
      },
    },
  ])
  const getColSpan = (i: number) =>
    i === 4
      ? 'col-span-4'
      : i === 3
      ? 'col-span-3'
      : i === 2
      ? 'col-span-2'
      : 'col-span-1'

  const [expandedIds, setExpandedIds] = useState<string[]>([])
  const [userBets, setUserBets] = useState<Dictionary<Bet[]>>({})
  const hideBetsBefore = areYourBets ? 0 : JUNE_1_2022

  const setNewExpandedId = async (id: string) => {
    if (!userBets[id]) {
      getBets(db, {
        contractId: id,
        userId: user.id,
        afterTime: hideBetsBefore,
      }).then((newBets) =>
        setUserBets((oldBets) => ({
          ...oldBets,
          ...groupBy(newBets, 'contractId'),
        }))
      )
    }
    setExpandedIds((oldIds) =>
      oldIds.includes(id)
        ? oldIds.filter((oldId) => oldId !== id)
        : [...oldIds, id]
    )
  }

  return (
    <Col className="mb-4 flex-1 gap-4">
      <Col className={'w-full'}>
        <Row
          className={clsx(
            'grid-cols-15 bg-canvas-50 sticky z-10 grid w-full py-2 pr-1',
            isMobile ? 'top-16' : 'top-0' // Sets it below sticky user profile header on mobile
          )}
        >
          {dataColumns.map((c) => (
            <span
              key={c.header.sort}
              className={clsx(
                getColSpan(c.span),
                'flex justify-end first:justify-start'
              )}
            >
              <Header
                onClick={() => onSetSort(c.header.sort as BetSort)}
                up={
                  sort.field === c.header.sort
                    ? sort.direction === 'asc'
                    : undefined
                }
              >
                {c.header.label}
              </Header>
            </span>
          ))}
        </Row>
        {contracts
          .slice(currentSlice, currentSlice + rowsPerSection)
          .map((contract) => {
            const bets: Bet[] | undefined = userBets[contract.id]
            const limitBets = (bets ?? []).filter(
              (bet) =>
                bet.limitProb !== undefined && !bet.isCancelled && !bet.isFilled
            ) as LimitBet[]
            const includeSellButtonForUser =
              areYourBets &&
              !contract.isResolved &&
              (contract.closeTime ?? 0) > Date.now() &&
              contract.mechanism === 'cpmm-1'
                ? signedInUser
                : undefined
            return (
              <Row
                key={contract.id + 'bets-table-row'}
                className={
                  'border-ink-200 hover:bg-canvas-50 cursor-pointer border-b py-2'
                }
                onClick={() => setNewExpandedId(contract.id)}
              >
                <Col className={'w-full'}>
                  {/* Contract title*/}
                  <Row className={'-mb-2'}>
                    <Col>
                      <Link
                        href={contractPath(contract)}
                        className={clsx(linkClass, 'line-clamp-2 pr-2 sm:pr-1')}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {contract.question}
                      </Link>
                      <UserLink
                        className={'text-ink-600 w-fit text-sm'}
                        user={{
                          id: contract.creatorId,
                          name: contract.creatorName,
                          username: contract.creatorUsername,
                        }}
                      />
                    </Col>
                  </Row>
                  {/* Contract Metrics details*/}
                  <Row className={'grid-cols-15 mt-1 grid w-full pt-2'}>
                    {dataColumns.map((c) => (
                      <div
                        className={clsx(getColSpan(c.span))}
                        key={c.header.sort + contract.id + 'row'}
                      >
                        {c.renderCell(contract)}
                      </div>
                    ))}
                  </Row>
                  <Row>
                    {expandedIds.includes(contract.id) &&
                      (bets === undefined ? (
                        <Col className={'w-full items-center justify-center'}>
                          <LoadingIndicator />
                        </Col>
                      ) : (
                        <Col className={'mt-1 w-full gap-1'}>
                          <BetsSummary
                            className="!mb-6 mt-6 flex"
                            contract={contract}
                            metrics={metricsByContractId[contract.id]}
                            hideTweet
                            includeSellButton={includeSellButtonForUser}
                            hideProfit={true}
                            hideValue={true}
                            areYourBets={areYourBets}
                          />
                          {contract.mechanism === 'cpmm-1' &&
                            limitBets.length > 0 && (
                              <div className="max-w-md">
                                <div className="bg-canvas-50 mt-4 px-4 py-2">
                                  Limit orders
                                </div>
                                <OrderTable
                                  contract={contract}
                                  limitBets={limitBets}
                                  isYou={areYourBets}
                                />
                              </div>
                            )}
                          <ContractBetsTable
                            key={contract.id + 'bets-table'}
                            contract={contract}
                            bets={bets}
                            isYourBets={areYourBets}
                          />
                        </Col>
                      ))}
                  </Row>
                </Col>
              </Row>
            )
          })}
      </Col>

      <Pagination
        page={page}
        itemsPerPage={rowsPerSection}
        totalItems={contracts.length}
        setPage={setPage}
      />
    </Col>
  )
}

const NumberCell = (props: { num: number; change?: boolean }) => {
  const { num, change } = props
  const formattedNum =
    num < 1000 && num > -1000
      ? formatMoney(num)
      : ENV_CONFIG.moneyMoniker + shortFormatNumber(num)
  return (
    <Row className="items-start justify-end ">
      {change && formattedNum !== formatMoney(0) ? (
        num > 0 ? (
          <span className="text-teal-500">{formattedNum}</span>
        ) : (
          <span className="text-scarlet-500">{formattedNum}</span>
        )
      ) : (
        <span>{formatMoney(num)}</span>
      )}
    </Row>
  )
}

const Header = (props: {
  children: ReactNode
  onClick?: () => void
  up?: boolean
  className?: string
}) => {
  const { onClick, up, className, children } = props
  return (
    <Row className={clsx(className, 'cursor-pointer')} onClick={onClick}>
      {up != undefined ? (
        up ? (
          <BiCaretUp className=" h-4" />
        ) : (
          <BiCaretDown className="mt-1.5 h-4" />
        )
      ) : (
        <Col className={'items-center justify-center'}>
          <BiCaretUp className="text-ink-300 -mb-2 h-4" />
          <BiCaretDown className="text-ink-300 h-4" />
        </Col>
      )}
      <span>{children}</span>
    </Row>
  )
}
