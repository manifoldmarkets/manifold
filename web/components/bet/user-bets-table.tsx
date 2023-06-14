import { Dictionary, groupBy, max, sortBy, sum, uniqBy } from 'lodash'
import React, { ReactNode, useEffect, useMemo, useState } from 'react'

import { LimitBet } from 'common/bet'
import { getContractBetNullMetrics } from 'common/calculate'
import { contractPath, CPMMContract } from 'common/contract'
import { ContractMetric } from 'common/contract-metric'
import { getUserContractMetricsWithContracts } from 'common/supabase/contract-metrics'
import { buildArray } from 'common/util/array'
import { formatMoney, shortFormatNumber } from 'common/util/format'
import { searchInAny } from 'common/util/parse'
import { Input } from 'web/components/widgets/input'
import {
  inMemoryStore,
  usePersistentState,
} from 'web/hooks/use-persistent-state'
import { useIsAuthorized, useUser } from 'web/hooks/use-user'
import { Bet } from 'web/lib/firebase/bets'
import { Contract } from 'web/lib/firebase/contracts'
import { User } from 'web/lib/firebase/users'
import { getOpenLimitOrdersWithContracts } from 'web/lib/supabase/bets'
import { db } from 'web/lib/supabase/db'
import { Col } from '../layout/col'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { SiteLink } from '../widgets/site-link'
import { Row } from 'web/components/layout/row'
import { Select } from 'web/components/widgets/select'
import { Pagination } from 'web/components/widgets/pagination'
import { getBets } from 'common/supabase/bets'
import clsx from 'clsx'
import { ContractStatusLabel } from 'web/components/contract/contracts-table'
import { UserLink } from 'web/components/widgets/user-link'
import { ENV_CONFIG } from 'common/envs/constants'
import { OrderTable } from 'web/components/bet/limit-bets'
import { TinyRelativeTimestamp } from 'web/components/relative-timestamp'
import { BiCaretDown, BiCaretUp } from 'react-icons/bi'
import { BetsSummary } from 'web/components/bet/bet-summary'
import { ContractBetsTable } from 'web/components/bet/contract-bets-table'

type BetSort =
  | 'newest'
  | 'profit'
  | 'closeTime'
  | 'value'
  | 'day'
  | 'week'
  | 'month'
  | 'probChangeDay'

type BetFilter = 'open' | 'limit_bet' | 'sold' | 'closed' | 'resolved' | 'all'

const JUNE_1_2022 = new Date('2022-06-01T00:00:00.000Z').valueOf()
export function UserBetsTable(props: { user: User }) {
  const { user } = props

  const signedInUser = useUser()
  const isAuth = useIsAuthorized()

  const [metricsByContract, setMetricsByContract] = usePersistentState<
    Dictionary<ContractMetric> | undefined
  >(undefined, {
    key: `user-contract-metrics-${user.id}`,
    store: inMemoryStore(),
  })

  const [initialContracts, setInitialContracts] = usePersistentState<
    Contract[] | undefined
  >(undefined, {
    key: `user-contract-metrics-contracts-${user.id}`,
    store: inMemoryStore(),
  })

  const [openLimitBetsByContract, setOpenLimitBetsByContract] =
    usePersistentState<Dictionary<LimitBet[]> | undefined>(undefined, {
      key: `user-open-limit-bets-${user.id}`,
      store: inMemoryStore(),
    })

  useEffect(() => {
    getUserContractMetricsWithContracts(user.id, db, 5000).then(
      (metricsWithContracts) => {
        const { contracts, metricsByContract } = metricsWithContracts
        setMetricsByContract(metricsByContract)
        setInitialContracts((c) =>
          uniqBy(buildArray([...(c ?? []), ...contracts]), 'id')
        )
      }
    )
  }, [user.id, setMetricsByContract, setInitialContracts, isAuth])

  useEffect(() => {
    getOpenLimitOrdersWithContracts(user.id, 5000).then((betsWithContracts) => {
      const { contracts, betsByContract } = betsWithContracts
      setOpenLimitBetsByContract(betsByContract)
      setInitialContracts((c) =>
        uniqBy(buildArray([...(c ?? []), ...contracts]), 'id')
      )
    })
  }, [setInitialContracts, setOpenLimitBetsByContract, user.id, isAuth])

  const [filter, setFilter] = usePersistentState<BetFilter>('open', {
    key: 'bets-list-filter',
    store: inMemoryStore(),
  })
  const [page, setPage] = usePersistentState(0, {
    key: 'portfolio-page',
    store: inMemoryStore(),
  })
  const [query, setQuery] = useState('')

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

  const contracts =
    query !== ''
      ? initialContracts.filter((c) =>
          searchInAny(query, ...[c.question, c.creatorName, c.creatorUsername])
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
            <option value="open">Active</option>
            <option value="limit_bet">Limit orders</option>
            <option value="sold">Sold</option>
            <option value="closed">Closed</option>
            <option value="resolved">Resolved</option>
            <option value="all">All</option>
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
    <div className="text-ink-500 py-4 text-center">
      {user.id === me?.id ? (
        <>
          You have not made any bets yet.{' '}
          <SiteLink href="/home" className="text-primary-500 hover:underline">
            Find a prediction market!
          </SiteLink>
        </>
      ) : (
        <>{user.name} has not made any bets yet</>
      )}
    </div>
  )
}
const NoMatchingBets = () => (
  <div className="text-ink-500 py-4 text-center">
    No bets matching the current filter
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
  const [sort, setSort] = usePersistentState<{
    field: BetSort
    direction: 'asc' | 'desc'
  }>(
    { field: 'newest', direction: 'desc' },
    {
      key: 'bets-list-sort',
      store: inMemoryStore(),
    }
  )
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
  const Cell = (props: { num: number; change?: boolean }) => {
    const { num, change } = props
    const formattedNum =
      num < 1000 && num > -1000
        ? formatMoney(num)
        : ENV_CONFIG.moneyMoniker + shortFormatNumber(num)
    return (
      <Row className="items-start justify-end ">
        {change ? (
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
    id: BetSort
    className?: string
  }) => {
    const { id, className } = props
    return (
      <Row
        className={clsx(
          className ? className : 'justify-end',
          'cursor-pointer'
        )}
        onClick={() => onSetSort(id)}
      >
        {sort.field === id ? (
          sort.direction === 'asc' ? (
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
        <span>{props.children}</span>
      </Row>
    )
  }
  const columns = [
    {
      header: (
        <Header id="newest" className={'justify-start'}>
          <div />
        </Header>
      ),
      renderCell: (c: Contract) => (
        <Col>
          <SiteLink
            href={contractPath(c)}
            className={'line-clamp-2 pr-2 sm:pr-1'}
            onClick={(e) => e.stopPropagation()}
            followsLinkClass
          >
            {c.question}
          </SiteLink>
          <UserLink
            className={'text-ink-500 w-fit text-sm'}
            name={c.creatorName}
            username={c.creatorUsername}
          />
        </Col>
      ),
    },
    {
      header: (
        <Header id="probChangeDay" className={'justify-left'}>
          Prob
        </Header>
      ),
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
            <ContractStatusLabel
              className={clsx(
                c.isResolved ? '' : 'text-indigo-500',
                'font-bold'
              )}
              contract={c}
            />
            <span className={'text-ink-500 text-xs'}>
              {change !== undefined ? change : 'n/a'}
            </span>
          </Row>
        )
      },
    },
    {
      header: (
        <Header id="newest" className={'justify-center'}>
          Time
        </Header>
      ),
      renderCell: (t: number) => (
        <Row className={'justify-center'}>
          <TinyRelativeTimestamp className={'ml-5'} time={t} />
        </Row>
      ),
    },
    {
      header: <Header id="value">Value</Header>,
      renderCell: (n: number) => <Cell num={n} />,
    },
    {
      header: <Header id="profit">Profit</Header>,
      renderCell: (n: number) => <Cell num={n} change={true} />,
    },
    {
      header: <Header id="day">1d Profit</Header>,
      renderCell: (n: number) => <Cell num={n} change={true} />,
    },
  ]
  const data = [
    ...contracts.map((contract) => {
      const cm = metricsByContractId[contract.id]
      return [
        contract,
        contract,
        cm.lastBetTime,
        cm.payout,
        cm.profit,
        cm.from?.day.profit ?? 0,
        cm.from?.month.profit ?? 0,
      ] as [Contract, Contract, number, number, number, number, number]
    }),
  ]
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
  const getColSpan = (i: number) => (i === 5 ? 'col-span-4' : 'col-span-3')
  return (
    <Col className="mb-4 flex-1 gap-4">
      <Col className={'w-full'}>
        <Row
          className={
            'grid-cols-16 bg-canvas-100 sticky top-0 z-10 grid w-full py-2 pr-1'
          }
        >
          {columns.slice(1).map((c, i) => (
            <span key={c.header.props.id} className={clsx(getColSpan(i + 1))}>
              {c.header}
            </span>
          ))}
        </Row>
        {data.slice(currentSlice, currentSlice + rowsPerSection).map((d) => {
          const contract = d[0]
          const bets: Bet[] | undefined = userBets[contract.id]
          const limitBets = (bets ?? []).filter(
            (bet) =>
              bet.limitProb !== undefined && !bet.isCancelled && !bet.isFilled
          ) as LimitBet[]
          const includeSellButtonForUser =
            areYourBets &&
            !contract.isResolved &&
            (contract.closeTime ?? 0) > Date.now() &&
            contract.outcomeType === 'BINARY'
              ? signedInUser
              : undefined
          return (
            <Row
              key={contract.id + 'bets-table-row'}
              className={
                'border-ink-300 hover:bg-canvas-100 cursor-pointer border-b py-2'
              }
              onClick={() => setNewExpandedId(contract.id)}
            >
              <Col className={'w-full'}>
                {/* Contract title*/}
                <Row className={'-mb-2'}>
                  {columns[0].renderCell(d[0] as any)}
                </Row>
                {/* Contract Metrics details*/}
                <Row className={'grid-cols-16 mt-1 grid w-full pt-2'}>
                  {columns.slice(1).map((c, i) => (
                    <span
                      className={clsx(getColSpan(i + 1))}
                      key={c.header.props.id + contract.id + 'row'}
                    >
                      {c.renderCell(d[i + 1] as any)}
                    </span>
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
                          className="mt-6 !mb-6 flex"
                          contract={contract}
                          metrics={metricsByContractId[contract.id]}
                          hideTweet
                          includeSellButton={includeSellButtonForUser}
                          hideProfit={true}
                          hideValue={true}
                        />
                        {contract.mechanism === 'cpmm-1' &&
                          limitBets.length > 0 && (
                            <div className="max-w-md">
                              <div className="bg-canvas-100 mt-4 px-4 py-2">
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
        UNSAFE_scrollToTop={true}
      />
    </Col>
  )
}
