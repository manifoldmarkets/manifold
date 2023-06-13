import {
  Dictionary,
  groupBy,
  max,
  partition,
  sortBy,
  sum,
  sumBy,
  uniqBy,
} from 'lodash'
import React, { ReactNode, useEffect, useMemo, useState } from 'react'

import { LimitBet } from 'common/bet'
import {
  calculatePayout,
  getContractBetNullMetrics,
  getOutcomeProbability,
  resolvedPayout,
} from 'common/calculate'
import {
  calculateDpmSaleAmount,
  getDpmProbabilityAfterSale,
} from 'common/calculate-dpm'
import {
  DPMContract,
  CPMMContract,
  contractPath,
  CPMMBinaryContract,
} from 'common/contract'
import { ContractMetric } from 'common/contract-metric'
import { getFormattedMappedValue } from 'common/pseudo-numeric'
import { getStonkShares } from 'common/stonk'
import { getUserContractMetricsWithContracts } from 'common/supabase/contract-metrics'
import { buildArray } from 'common/util/array'
import {
  formatMoney,
  formatPercent,
  formatWithCommas,
  shortFormatNumber,
} from 'common/util/format'
import { searchInAny } from 'common/util/parse'
import { Input } from 'web/components/widgets/input'
import {
  inMemoryStore,
  usePersistentState,
} from 'web/hooks/use-persistent-state'
import { useIsAuthorized, useUser } from 'web/hooks/use-user'
import { sellBet } from 'web/lib/firebase/api'
import { Bet } from 'web/lib/firebase/bets'
import { Contract } from 'web/lib/firebase/contracts'
import { User } from 'web/lib/firebase/users'
import { getOpenLimitOrdersWithContracts } from 'web/lib/supabase/bets'
import { db } from 'web/lib/supabase/db'
import { formatTimeShort } from 'web/lib/util/time'
import { ConfirmationButton } from '../buttons/confirmation-button'
import { Col } from '../layout/col'
import { Spacer } from '../layout/spacer'
import { OutcomeLabel } from '../outcome-label'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { SiteLink } from '../widgets/site-link'
import { Table } from '../widgets/table'
import { Row } from 'web/components/layout/row'
import { Select } from 'web/components/widgets/select'
import { Pagination } from 'web/components/widgets/pagination'
import { getBets } from 'common/supabase/bets'
import clsx from 'clsx'
import { ContractStatusLabel } from 'web/components/contract/contracts-table'
import { UserLink } from 'web/components/widgets/user-link'
import { SellRow } from 'web/components/bet/sell-row'
import { ENV_CONFIG } from 'common/envs/constants'
import { OrderTable } from 'web/components/bet/limit-bets'
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
export function BetsList(props: { user: User }) {
  const { user } = props

  const signedInUser = useUser()
  const isAuth = useIsAuthorized()
  const isYourBets = user.id === signedInUser?.id

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
            <UserBetsTable
              contracts={filteredContracts as CPMMContract[]}
              metricsByContractId={nullableMetricsByContract}
              openLimitBetsByContract={openLimitBetsByContract}
              page={page}
              user={user}
              areYourBets={isYourBets}
              setPage={setPage}
              filter={filter}
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

function UserBetsTable(props: {
  contracts: CPMMContract[]
  metricsByContractId: { [key: string]: ContractMetric }
  openLimitBetsByContract: { [key: string]: LimitBet[] }
  page: number
  setPage: (page: number) => void
  filter: BetFilter
  user: User
  areYourBets: boolean
}) {
  const {
    metricsByContractId,
    page,
    setPage,
    filter,
    openLimitBetsByContract,
    areYourBets,
    user,
  } = props

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
      setSort({ field, direction: 'asc' })
    }
    setPage(0)
  }

  // Most of these are descending sorts by default.
  const SORTS: Record<BetSort, (c: Contract) => number> = {
    profit: (c) => -metricsByContractId[c.id].profit,
    value: (c) =>
      -(metricsByContractId[c.id].payout + filter === 'limit_bet'
        ? sum(openLimitBetsByContract[c.id].map((b) => b.amount))
        : 0),
    newest: (c) =>
      metricsByContractId[c.id].lastBetTime ??
      max(openLimitBetsByContract[c.id]?.map((b) => b.createdTime)) ??
      0,
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
    sort.direction === 'asc'
      ? sortBy(props.contracts, SORTS[sort.field])
      : sortBy(props.contracts, SORTS[sort.field]).reverse()
  const rowsPerSection = 50
  const currentSlice = page * rowsPerSection
  const Cell = (props: { num: number; change?: boolean }) => {
    const { num, change } = props
    return (
      <Row className="items-start justify-end ">
        {change ? (
          num > 0 ? (
            <span className="text-teal-500">{formatMoney(num)}</span>
          ) : (
            <span className="text-scarlet-500">{formatMoney(num)}</span>
          )
        ) : (
          <span>
            {num < 1000
              ? formatMoney(num)
              : ENV_CONFIG.moneyMoniker + shortFormatNumber(num)}
          </span>
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
          'cursor-pointer',
          sort.field === id && id !== 'newest'
            ? sort.direction === 'asc'
              ? 'text-teal-500'
              : 'text-scarlet-500'
            : ''
        )}
        onClick={() => onSetSort(id)}
      >
        <span>{props.children}</span>
      </Row>
    )
  }
  const columns = [
    {
      header: (
        <Header id="newest" className={'justify-start'}>
          <Row className={'items-center gap-1'}>
            Trades
            {sort.field === 'newest'
              ? sort.direction === 'desc'
                ? ' (new) '
                : ' (old)'
              : null}
          </Row>
        </Header>
      ),
      id: 'question',
      renderCell: (q: Contract) => (
        <Col>
          <SiteLink
            href={contractPath(q)}
            className={'line-clamp-2'}
            onClick={(e) => e.stopPropagation()}
            followsLinkClass
          >
            {q.question}
          </SiteLink>
          <Row className={'gap-2'}>
            <ContractStatusLabel
              className={clsx(
                q.isResolved ? '' : 'text-indigo-500',
                'font-bold'
              )}
              contract={q}
            />
            <UserLink
              className={'text-ink-500 text-sm'}
              name={q.creatorName}
              username={q.creatorUsername}
            />
          </Row>
        </Col>
      ),
    },
    {
      header: <Header id="probChangeDay">1d %</Header>,
      id: 'probChangeDay',
      renderCell: (c: Contract) => {
        let change: string | undefined
        if (c.mechanism === 'cpmm-1') {
          const probChange = Math.round(
            (c as CPMMContract).probChanges.day * 100
          )
          change = (probChange > 0 ? '+' : '') + probChange + '%'
        }
        return (
          <Row className={'text-ink-500 items-start justify-end'}>
            {change !== undefined ? change : 'n/a'}
          </Row>
        )
      },
    },
    {
      header: <Header id="value">Value</Header>,
      id: 'value',
      renderCell: (n: number) => <Cell num={n} />,
    },
    {
      header: <Header id="profit">All</Header>,
      id: 'profit',
      renderCell: (n: number) => <Cell num={n} change={true} />,
    },
    {
      header: <Header id="day">1d</Header>,
      id: 'day',
      renderCell: (n: number) => <Cell num={n} change={true} />,
    },
  ]
  const data = [
    ...contracts.map((contract) => {
      const cm = metricsByContractId[contract.id]
      return [
        contract,
        contract,
        cm.payout,
        cm.profit,
        cm.from?.day.profit ?? 0,
        cm.from?.month.profit ?? 0,
      ] as [Contract, Contract, number, number, number, number]
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

  return (
    <Col className="mb-4 flex-1 gap-4">
      <Col className={'w-full'}>
        <Row
          className={
            'grid-cols-16 bg-canvas-100 sticky top-0 z-10 grid w-full px-1 py-2'
          }
        >
          {columns.map((c, i) => (
            <span
              key={c.id}
              className={clsx(i == 0 ? 'col-span-8' : 'col-span-2')}
            >
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
          return (
            <Row
              className={
                'border-ink-300 hover:bg-canvas-100 cursor-pointer border-b py-2'
              }
              onClick={() => setNewExpandedId(contract.id)}
            >
              <Col className={'w-full'}>
                <Row className={'grid-cols-16 grid w-full'}>
                  {columns.map((c, i) => (
                    <span
                      className={clsx(i === 0 ? 'col-span-8' : 'col-span-2')}
                      key={c.id + contract.id + 'row'}
                    >
                      {c.renderCell(d[i] as any)}
                    </span>
                  ))}
                </Row>
                <Row key={contract.id + 'bets-table'}>
                  {expandedIds.includes(contract.id) ? (
                    bets === undefined ? (
                      <Col className={'w-full items-center justify-center'}>
                        <LoadingIndicator />
                      </Col>
                    ) : (
                      <Col className={'mt-1 w-full gap-1'}>
                        {areYourBets &&
                          !contract.isResolved &&
                          (contract.closeTime ?? 0) > Date.now() &&
                          contract.outcomeType === 'BINARY' && (
                            <SellRow
                              className="mt-1 items-start"
                              contract={contract as CPMMBinaryContract}
                              user={user}
                              showTweet={false}
                            />
                          )}
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
                    )
                  ) : null}
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

export function ContractBetsTable(props: {
  contract: Contract
  bets: Bet[]
  isYourBets: boolean
  hideRedemptionAndLoanMessages?: boolean
}) {
  const { contract, isYourBets, hideRedemptionAndLoanMessages } = props
  const { isResolved, mechanism, outcomeType, closeTime } = contract

  const bets = sortBy(
    props.bets.filter((b) => !b.isAnte && b.amount !== 0),
    (bet) => bet.createdTime
  ).reverse()

  const [sales, buys] = partition(bets, (bet) => bet.sale)

  const salesDict = Object.fromEntries(
    sales.map((sale) => [sale.sale?.betId ?? '', sale])
  )

  const [redemptions, normalBets] = partition(
    mechanism === 'cpmm-1' ? bets : buys,
    (b) => b.isRedemption
  )
  const firstOutcome = redemptions[0]?.outcome
  const amountRedeemed = Math.floor(
    sumBy(
      redemptions.filter((r) => r.outcome === firstOutcome),
      (b) => -1 * b.shares
    )
  )

  const amountLoaned = sumBy(
    bets.filter((bet) => !bet.isSold && !bet.sale),
    (bet) => bet.loanAmount ?? 0
  )

  const isCPMM = mechanism === 'cpmm-1'
  const isCPMM2 = mechanism === 'cpmm-2'
  const isDPM = mechanism === 'dpm-2'
  const isNumeric = outcomeType === 'NUMERIC'
  const isPseudoNumeric = outcomeType === 'PSEUDO_NUMERIC'
  const isStonk = outcomeType === 'STONK'
  const isClosed = closeTime && Date.now() > closeTime

  return (
    <div className="overflow-x-auto">
      {!hideRedemptionAndLoanMessages && amountRedeemed > 0 && (
        <>
          <div className="text-ink-500 pl-2 text-sm">
            {isCPMM2 ? (
              <>
                {amountRedeemed} shares of each outcome redeemed for{' '}
                {formatMoney(amountRedeemed)}.
              </>
            ) : (
              <>
                {amountRedeemed} {isPseudoNumeric ? 'HIGHER' : 'YES'} shares and{' '}
                {amountRedeemed} {isPseudoNumeric ? 'LOWER' : 'NO'} shares
                automatically redeemed for {formatMoney(amountRedeemed)}.
              </>
            )}
          </div>
          <Spacer h={4} />
        </>
      )}

      {!hideRedemptionAndLoanMessages && !isResolved && amountLoaned > 0 && (
        <>
          <div className="text-ink-500 pl-0 text-sm">
            {isYourBets ? (
              <>You currently have a loan of {formatMoney(amountLoaned)}.</>
            ) : (
              <>
                This user currently has a loan of {formatMoney(amountLoaned)}.
              </>
            )}
          </div>
          <Spacer h={4} />
        </>
      )}

      <Table>
        <thead>
          <tr className="p-2">
            {isYourBets && isDPM && !isNumeric && !isResolved && !isClosed && (
              <th></th>
            )}
            {isCPMM && <th>Type</th>}
            <th>Outcome</th>
            <th>Amount</th>
            {isDPM && !isNumeric && (
              <th>{isResolved ? <>Payout</> : <>Sale price</>}</th>
            )}
            {isDPM && !isResolved && <th>Payout if chosen</th>}
            <th>Shares</th>
            {isPseudoNumeric ? (
              <th>Value</th>
            ) : isStonk ? (
              <th>Stock price</th>
            ) : (
              <th>Probability</th>
            )}
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          {normalBets.map((bet) => (
            <BetRow
              key={bet.id}
              bet={bet}
              saleBet={salesDict[bet.id]}
              contract={contract}
              isYourBet={isYourBets}
            />
          ))}
        </tbody>
      </Table>
    </div>
  )
}

function BetRow(props: {
  bet: Bet
  contract: Contract
  saleBet?: Bet
  isYourBet: boolean
}) {
  const { bet, saleBet, contract, isYourBet } = props
  const {
    amount,
    outcome,
    createdTime,
    probBefore,
    probAfter,
    shares,
    isSold,
    isAnte,
  } = bet

  const { isResolved, closeTime, mechanism, outcomeType } = contract

  const isClosed = closeTime && Date.now() > closeTime

  const isCPMM = mechanism === 'cpmm-1'
  const isCPMM2 = mechanism === 'cpmm-2'
  const isShortSell = isCPMM2 && bet.amount > 0 && bet.shares === 0
  const isNumeric = outcomeType === 'NUMERIC'
  const isPseudoNumeric = outcomeType === 'PSEUDO_NUMERIC'
  const isDPM = mechanism === 'dpm-2'
  const isStonk = outcomeType === 'STONK'

  const dpmPayout = (() => {
    if (!isDPM) return 0

    const saleBetAmount = saleBet?.sale?.amount
    if (saleBetAmount) {
      return saleBetAmount
    } else if (contract.isResolved) {
      return resolvedPayout(contract, bet)
    } else {
      return calculateDpmSaleAmount(contract, bet)
    }
  })()

  const saleDisplay = !isDPM ? (
    ''
  ) : isAnte ? (
    'ANTE'
  ) : saleBet ? (
    <>{formatMoney(dpmPayout)} (sold)</>
  ) : (
    formatMoney(dpmPayout)
  )

  const payoutIfChosenDisplay =
    bet.isAnte && outcomeType === 'FREE_RESPONSE' && bet.outcome === '0'
      ? 'N/A'
      : formatMoney(calculatePayout(contract, bet, bet.outcome))

  const hadPoolMatch =
    (bet.limitProb === undefined ||
      bet.fills?.some((fill) => fill.matchedBetId === null)) ??
    false

  const ofTotalAmount =
    bet.limitProb === undefined || bet.orderAmount === undefined
      ? ''
      : ` / ${formatMoney(bet.orderAmount)}`

  const sharesOrShortSellShares =
    isShortSell && bet.sharesByOutcome
      ? -Math.max(...Object.values(bet.sharesByOutcome))
      : Math.abs(shares)

  return (
    <tr>
      {isYourBet && isDPM && !isNumeric && !isResolved && !isClosed && (
        <td className="text-ink-700">
          {!isSold && !isAnte && (
            <DpmSellButton contract={contract} bet={bet} />
          )}
        </td>
      )}
      {isCPMM && <td>{shares >= 0 ? 'BUY' : 'SELL'}</td>}
      <td>
        {isCPMM2 && (isShortSell ? 'NO ' : 'YES ')}
        {bet.isAnte ? (
          'ANTE'
        ) : (
          <OutcomeLabel
            outcome={outcome}
            value={(bet as any).value}
            contract={contract}
            truncate="short"
          />
        )}
      </td>
      <td>
        {formatMoney(Math.abs(amount))}
        {ofTotalAmount}
      </td>
      {isDPM && !isNumeric && <td>{saleDisplay}</td>}
      {isDPM && !isResolved && <td>{payoutIfChosenDisplay}</td>}
      <td>
        {isStonk
          ? getStonkShares(contract, sharesOrShortSellShares, 2)
          : formatWithCommas(sharesOrShortSellShares)}
      </td>

      <td>
        {outcomeType === 'FREE_RESPONSE' || hadPoolMatch ? (
          isStonk || isPseudoNumeric ? (
            <>
              {getFormattedMappedValue(contract, probBefore)} →{' '}
              {getFormattedMappedValue(contract, probAfter)}
            </>
          ) : (
            <>
              {formatPercent(probBefore)} → {formatPercent(probAfter)}
            </>
          )
        ) : (
          formatPercent(bet.limitProb ?? 0)
        )}
      </td>
      <td>{formatTimeShort(createdTime)}</td>
    </tr>
  )
}

function DpmSellButton(props: { contract: DPMContract; bet: Bet }) {
  const { contract, bet } = props
  const { outcome, shares, loanAmount } = bet

  const [isSubmitting, setIsSubmitting] = useState(false)

  const initialProb = getOutcomeProbability(
    contract,
    outcome === 'NO' ? 'YES' : outcome
  )

  const outcomeProb = getDpmProbabilityAfterSale(
    contract.totalShares,
    outcome,
    shares
  )

  const saleAmount = calculateDpmSaleAmount(contract, bet)
  const profit = saleAmount - bet.amount

  return (
    <ConfirmationButton
      openModalBtn={{
        label: 'Sell',
        disabled: isSubmitting,
      }}
      submitBtn={{ label: 'Sell', color: 'green' }}
      onSubmit={async () => {
        setIsSubmitting(true)
        await sellBet({ contractId: contract.id, betId: bet.id })
        setIsSubmitting(false)
      }}
    >
      <div className="mb-4 text-xl">
        Sell {formatWithCommas(shares)} shares of{' '}
        <OutcomeLabel outcome={outcome} contract={contract} truncate="long" />{' '}
        for {formatMoney(saleAmount)}?
      </div>
      {!!loanAmount && (
        <div className="mt-2">
          You will also pay back {formatMoney(loanAmount)} of your loan, for a
          net of {formatMoney(saleAmount - loanAmount)}.
        </div>
      )}

      <div className="mt-2 mb-1 text-sm">
        {profit > 0 ? 'Profit' : 'Loss'}: {formatMoney(profit).replace('-', '')}
        <br />
        Market probability: {formatPercent(initialProb)} →{' '}
        {formatPercent(outcomeProb)}
      </div>
    </ConfirmationButton>
  )
}
