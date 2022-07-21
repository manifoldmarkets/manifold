import Link from 'next/link'
import { groupBy, mapValues, sortBy, partition, sumBy } from 'lodash'
import dayjs from 'dayjs'
import { useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'

import { Bet } from 'web/lib/firebase/bets'
import { User } from 'web/lib/firebase/users'
import {
  formatLargeNumber,
  formatMoney,
  formatPercent,
  formatWithCommas,
} from 'common/util/format'
import { Col } from './layout/col'
import { Spacer } from './layout/spacer'
import {
  Contract,
  contractPath,
  getBinaryProbPercent,
} from 'web/lib/firebase/contracts'
import { Row } from './layout/row'
import { UserLink } from './user-page'
import { sellBet } from 'web/lib/firebase/api'
import { ConfirmationButton } from './confirmation-button'
import { OutcomeLabel, YesLabel, NoLabel } from './outcome-label'
import { LoadingIndicator } from './loading-indicator'
import { SiteLink } from './site-link'
import {
  calculatePayout,
  calculateSaleAmount,
  getOutcomeProbability,
  getProbabilityAfterSale,
  getContractBetMetrics,
  resolvedPayout,
  getContractBetNullMetrics,
} from 'common/calculate'
import { useTimeSinceFirstRender } from 'web/hooks/use-time-since-first-render'
import { trackLatency } from 'web/lib/firebase/tracking'
import { NumericContract } from 'common/contract'
import { formatNumericProbability } from 'common/pseudo-numeric'
import { useUser } from 'web/hooks/use-user'
import { SellSharesModal } from './sell-modal'
import { useUnfilledBets } from 'web/hooks/use-bets'
import { LimitBet } from 'common/bet'
import { floatingEqual } from 'common/util/math'
import { Pagination } from './pagination'
import { LimitOrderTable } from './limit-bets'

type BetSort = 'newest' | 'profit' | 'closeTime' | 'value'
type BetFilter = 'open' | 'limit_bet' | 'sold' | 'closed' | 'resolved' | 'all'

const CONTRACTS_PER_PAGE = 50

export function BetsList(props: {
  user: User
  bets: Bet[] | undefined
  contractsById: { [id: string]: Contract } | undefined
  hideBetsBefore?: number
}) {
  const { user, bets: allBets, contractsById, hideBetsBefore } = props

  const signedInUser = useUser()
  const isYourBets = user.id === signedInUser?.id

  // Hide bets before 06-01-2022 if this isn't your own profile
  // NOTE: This means public profits also begin on 06-01-2022 as well.
  const bets = useMemo(
    () => allBets?.filter((bet) => bet.createdTime >= (hideBetsBefore ?? 0)),
    [allBets, hideBetsBefore]
  )

  const [sort, setSort] = useState<BetSort>('newest')
  const [filter, setFilter] = useState<BetFilter>('open')
  const [page, setPage] = useState(0)
  const start = page * CONTRACTS_PER_PAGE
  const end = start + CONTRACTS_PER_PAGE

  const getTime = useTimeSinceFirstRender()
  useEffect(() => {
    if (bets && contractsById && signedInUser) {
      trackLatency(signedInUser.id, 'portfolio', getTime())
    }
  }, [signedInUser, bets, contractsById, getTime])

  if (!bets || !contractsById) {
    return <LoadingIndicator />
  }
  if (bets.length === 0) return <NoBets user={user} />

  // Decending creation time.
  bets.sort((bet1, bet2) => bet2.createdTime - bet1.createdTime)
  const contractBets = groupBy(bets, 'contractId')

  // Keep only contracts that have bets.
  const contracts = Object.values(contractsById).filter(
    (c) => contractBets[c.id]
  )

  const contractsMetrics = mapValues(contractBets, (bets, contractId) => {
    const contract = contractsById[contractId]
    if (!contract) return getContractBetNullMetrics()
    return getContractBetMetrics(contract, bets)
  })

  const FILTERS: Record<BetFilter, (c: Contract) => boolean> = {
    resolved: (c) => !!c.resolutionTime,
    closed: (c) =>
      !FILTERS.resolved(c) && (c.closeTime ?? Infinity) < Date.now(),
    open: (c) => !(FILTERS.closed(c) || FILTERS.resolved(c)),
    all: () => true,
    sold: () => true,
    limit_bet: (c) => FILTERS.open(c),
  }
  const SORTS: Record<BetSort, (c: Contract) => number> = {
    profit: (c) => contractsMetrics[c.id].profit,
    value: (c) => contractsMetrics[c.id].payout,
    newest: (c) =>
      Math.max(...contractBets[c.id].map((bet) => bet.createdTime)),
    closeTime: (c) =>
      // This is in fact the intuitive sort direction.
      (filter === 'open' ? -1 : 1) *
      (c.resolutionTime ?? c.closeTime ?? Infinity),
  }
  const filteredContracts = sortBy(contracts, SORTS[sort])
    .reverse()
    .filter(FILTERS[filter])
    .filter((c) => {
      if (filter === 'all') return true

      const { hasShares } = contractsMetrics[c.id]

      if (filter === 'sold') return !hasShares
      if (filter === 'limit_bet')
        return (contractBets[c.id] ?? []).some(
          (b) => b.limitProb !== undefined && !b.isCancelled && !b.isFilled
        )
      return hasShares
    })
  const displayedContracts = filteredContracts.slice(start, end)

  const unsettled = contracts.filter(
    (c) => !c.isResolved && contractsMetrics[c.id].invested !== 0
  )

  const currentInvested = sumBy(
    unsettled,
    (c) => contractsMetrics[c.id].invested
  )
  const currentBetsValue = sumBy(
    unsettled,
    (c) => contractsMetrics[c.id].payout
  )
  const currentNetInvestment = sumBy(
    unsettled,
    (c) => contractsMetrics[c.id].netPayout
  )

  const totalPortfolio = currentNetInvestment + user.balance

  const totalPnl = totalPortfolio - user.totalDeposits
  const totalProfitPercent = (totalPnl / user.totalDeposits) * 100
  const investedProfitPercent =
    ((currentBetsValue - currentInvested) / (currentInvested + 0.1)) * 100

  return (
    <Col className="mt-6">
      <Col className="mx-4 gap-4 sm:flex-row sm:justify-between md:mx-0">
        <Row className="gap-8">
          <Col>
            <div className="text-sm text-gray-500">Investment value</div>
            <div className="text-lg">
              {formatMoney(currentNetInvestment)}{' '}
              <ProfitBadge profitPercent={investedProfitPercent} />
            </div>
          </Col>
          <Col>
            <div className="text-sm text-gray-500">Total profit</div>
            <div className="text-lg">
              {formatMoney(totalPnl)}{' '}
              <ProfitBadge profitPercent={totalProfitPercent} />
            </div>
          </Col>
        </Row>

        <Row className="gap-8">
          <select
            className="select select-bordered self-start"
            value={filter}
            onChange={(e) => setFilter(e.target.value as BetFilter)}
          >
            <option value="open">Open</option>
            <option value="limit_bet">Limit orders</option>
            <option value="sold">Sold</option>
            <option value="closed">Closed</option>
            <option value="resolved">Resolved</option>
            <option value="all">All</option>
          </select>

          <select
            className="select select-bordered self-start"
            value={sort}
            onChange={(e) => setSort(e.target.value as BetSort)}
          >
            <option value="newest">Recent</option>
            <option value="value">Value</option>
            <option value="profit">Profit</option>
            <option value="closeTime">Close date</option>
          </select>
        </Row>
      </Col>

      <Col className="mt-6 divide-y">
        {displayedContracts.length === 0 ? (
          <NoBets user={user} />
        ) : (
          displayedContracts.map((contract) => (
            <ContractBets
              key={contract.id}
              contract={contract}
              bets={contractBets[contract.id] ?? []}
              metric={sort === 'profit' ? 'profit' : 'value'}
              isYourBets={isYourBets}
            />
          ))
        )}
      </Col>

      <Pagination
        page={page}
        itemsPerPage={CONTRACTS_PER_PAGE}
        totalItems={filteredContracts.length}
        setPage={setPage}
      />
    </Col>
  )
}

const NoBets = ({ user }: { user: User }) => {
  const me = useUser()
  return (
    <div className="mx-4 text-gray-500">
      {user.id === me?.id ? (
        <>
          You have not made any bets yet.{' '}
          <SiteLink href="/home" className="underline">
            Find a prediction market!
          </SiteLink>
        </>
      ) : (
        <>{user.name} has not made any public bets yet.</>
      )}
    </div>
  )
}

function ContractBets(props: {
  contract: Contract
  bets: Bet[]
  metric: 'profit' | 'value'
  isYourBets: boolean
}) {
  const { bets, contract, metric, isYourBets } = props
  const { resolution, outcomeType } = contract

  const limitBets = bets.filter(
    (bet) => bet.limitProb !== undefined && !bet.isCancelled && !bet.isFilled
  ) as LimitBet[]
  const resolutionValue = (contract as NumericContract).resolutionValue

  const [collapsed, setCollapsed] = useState(true)

  const isBinary = outcomeType === 'BINARY'

  const { payout, profit, profitPercent } = getContractBetMetrics(
    contract,
    bets
  )
  return (
    <div
      tabIndex={0}
      className={clsx(
        'collapse collapse-arrow relative bg-white p-4 pr-6',
        collapsed ? 'collapse-close' : 'collapse-open pb-2'
      )}
    >
      <Row
        className="cursor-pointer flex-wrap gap-2"
        onClick={() => setCollapsed((collapsed) => !collapsed)}
      >
        <Col className="flex-[2] gap-1">
          <Row className="mr-2 max-w-lg">
            <Link href={contractPath(contract)}>
              <a
                className="font-medium text-indigo-700 hover:underline hover:decoration-indigo-400 hover:decoration-2"
                onClick={(e) => e.stopPropagation()}
              >
                {contract.question}
              </a>
            </Link>

            {/* Show carrot for collapsing. Hack the positioning. */}
            <div
              className="collapse-title absolute h-0 min-h-0 w-0 p-0"
              style={{ top: -10, right: 0 }}
            />
          </Row>

          <Row className="flex-1 items-center gap-2 text-sm text-gray-500">
            {resolution ? (
              <>
                <div>
                  Resolved{' '}
                  <OutcomeLabel
                    outcome={resolution}
                    value={resolutionValue}
                    contract={contract}
                    truncate="short"
                  />
                </div>
                <div>•</div>
              </>
            ) : isBinary ? (
              <>
                <div className="text-primary text-lg">
                  {getBinaryProbPercent(contract)}
                </div>
                <div>•</div>
              </>
            ) : null}
            <UserLink
              name={contract.creatorName}
              username={contract.creatorUsername}
            />
          </Row>
        </Col>

        <Row className="mr-5 justify-end sm:mr-8">
          <Col>
            <div className="whitespace-nowrap text-right text-lg">
              {formatMoney(metric === 'profit' ? profit : payout)}
            </div>
            <div className="text-right">
              <ProfitBadge profitPercent={profitPercent} />
            </div>
          </Col>
        </Row>
      </Row>

      <div
        className="collapse-content !px-0"
        style={{ backgroundColor: 'white' }}
      >
        <Spacer h={8} />

        <BetsSummary
          className="mr-5 flex-1 sm:mr-8"
          contract={contract}
          bets={bets}
          isYourBets={isYourBets}
        />

        <Spacer h={4} />

        {contract.mechanism === 'cpmm-1' && limitBets.length > 0 && (
          <>
            <div className="max-w-md">
              <div className="bg-gray-50 px-4 py-2">Limit orders</div>
              <LimitOrderTable
                contract={contract}
                limitBets={limitBets}
                isYou={true}
              />
            </div>
          </>
        )}

        <Spacer h={4} />

        <div className="bg-gray-50 px-4 py-2">Bets</div>
        <ContractBetsTable
          contract={contract}
          bets={bets}
          isYourBets={isYourBets}
        />
      </div>
    </div>
  )
}

export function BetsSummary(props: {
  contract: Contract
  bets: Bet[]
  isYourBets: boolean
  className?: string
}) {
  const { contract, isYourBets, className } = props
  const { resolution, closeTime, outcomeType, mechanism } = contract
  const isBinary = outcomeType === 'BINARY'
  const isPseudoNumeric = outcomeType === 'PSEUDO_NUMERIC'
  const isCpmm = mechanism === 'cpmm-1'
  const isClosed = closeTime && Date.now() > closeTime

  const bets = props.bets.filter((b) => !b.isAnte)
  const { hasShares } = getContractBetMetrics(contract, bets)

  const excludeSalesAndAntes = bets.filter(
    (b) => !b.isAnte && !b.isSold && !b.sale
  )
  const yesWinnings = sumBy(excludeSalesAndAntes, (bet) =>
    calculatePayout(contract, bet, 'YES')
  )
  const noWinnings = sumBy(excludeSalesAndAntes, (bet) =>
    calculatePayout(contract, bet, 'NO')
  )
  const { invested, profitPercent, payout, profit, totalShares } =
    getContractBetMetrics(contract, bets)

  const [showSellModal, setShowSellModal] = useState(false)
  const user = useUser()

  const sharesOutcome = floatingEqual(totalShares.YES ?? 0, 0)
    ? floatingEqual(totalShares.NO ?? 0, 0)
      ? undefined
      : 'NO'
    : 'YES'

  return (
    <Row className={clsx('flex-wrap gap-4 sm:flex-nowrap sm:gap-6', className)}>
      <Row className="flex-wrap gap-4 sm:gap-6">
        {!isCpmm && (
          <Col>
            <div className="whitespace-nowrap text-sm text-gray-500">
              Invested
            </div>
            <div className="whitespace-nowrap">{formatMoney(invested)}</div>
          </Col>
        )}
        {resolution ? (
          <Col>
            <div className="text-sm text-gray-500">Payout</div>
            <div className="whitespace-nowrap">
              {formatMoney(payout)}{' '}
              <ProfitBadge profitPercent={profitPercent} />
            </div>
          </Col>
        ) : (
          <>
            {isBinary ? (
              <>
                <Col>
                  <div className="whitespace-nowrap text-sm text-gray-500">
                    Payout if <YesLabel />
                  </div>
                  <div className="whitespace-nowrap">
                    {formatMoney(yesWinnings)}
                  </div>
                </Col>
                <Col>
                  <div className="whitespace-nowrap text-sm text-gray-500">
                    Payout if <NoLabel />
                  </div>
                  <div className="whitespace-nowrap">
                    {formatMoney(noWinnings)}
                  </div>
                </Col>
              </>
            ) : isPseudoNumeric ? (
              <>
                <Col>
                  <div className="whitespace-nowrap text-sm text-gray-500">
                    Payout if {'>='} {formatLargeNumber(contract.max)}
                  </div>
                  <div className="whitespace-nowrap">
                    {formatMoney(yesWinnings)}
                  </div>
                </Col>
                <Col>
                  <div className="whitespace-nowrap text-sm text-gray-500">
                    Payout if {'<='} {formatLargeNumber(contract.min)}
                  </div>
                  <div className="whitespace-nowrap">
                    {formatMoney(noWinnings)}
                  </div>
                </Col>
              </>
            ) : (
              <Col>
                <div className="whitespace-nowrap text-sm text-gray-500">
                  Current value
                </div>
                <div className="whitespace-nowrap">{formatMoney(payout)}</div>
              </Col>
            )}
          </>
        )}
        <Col>
          <div className="whitespace-nowrap text-sm text-gray-500">Profit</div>
          <div className="whitespace-nowrap">
            {formatMoney(profit)} <ProfitBadge profitPercent={profitPercent} />
            {isYourBets &&
              isCpmm &&
              (isBinary || isPseudoNumeric) &&
              !isClosed &&
              !resolution &&
              hasShares &&
              sharesOutcome &&
              user && (
                <>
                  <button
                    className="btn btn-sm ml-2"
                    onClick={() => setShowSellModal(true)}
                  >
                    Sell
                  </button>
                  {showSellModal && (
                    <SellSharesModal
                      contract={contract}
                      user={user}
                      userBets={bets}
                      shares={totalShares[sharesOutcome]}
                      sharesOutcome={sharesOutcome}
                      setOpen={setShowSellModal}
                    />
                  )}
                </>
              )}
          </div>
        </Col>
      </Row>
    </Row>
  )
}

export function ContractBetsTable(props: {
  contract: Contract
  bets: Bet[]
  isYourBets: boolean
  className?: string
}) {
  const { contract, className, isYourBets } = props

  const bets = sortBy(
    props.bets.filter((b) => !b.isAnte && b.amount !== 0),
    (bet) => bet.createdTime
  ).reverse()

  const [sales, buys] = partition(bets, (bet) => bet.sale)

  const salesDict = Object.fromEntries(
    sales.map((sale) => [sale.sale?.betId ?? '', sale])
  )

  const [redemptions, normalBets] = partition(
    contract.mechanism === 'cpmm-1' ? bets : buys,
    (b) => b.isRedemption
  )
  const amountRedeemed = Math.floor(-0.5 * sumBy(redemptions, (b) => b.shares))

  const amountLoaned = sumBy(
    bets.filter((bet) => !bet.isSold && !bet.sale),
    (bet) => bet.loanAmount ?? 0
  )

  const { isResolved, mechanism, outcomeType } = contract
  const isCPMM = mechanism === 'cpmm-1'
  const isNumeric = outcomeType === 'NUMERIC'
  const isPseudoNumeric = outcomeType === 'PSEUDO_NUMERIC'

  const unfilledBets = useUnfilledBets(contract.id) ?? []

  return (
    <div className={clsx('overflow-x-auto', className)}>
      {amountRedeemed > 0 && (
        <>
          <div className="pl-2 text-sm text-gray-500">
            {amountRedeemed} {isPseudoNumeric ? 'HIGHER' : 'YES'} shares and{' '}
            {amountRedeemed} {isPseudoNumeric ? 'LOWER' : 'NO'} shares
            automatically redeemed for {formatMoney(amountRedeemed)}.
          </div>
          <Spacer h={4} />
        </>
      )}

      {!isResolved && amountLoaned > 0 && (
        <>
          <div className="pl-2 text-sm text-gray-500">
            You currently have a loan of {formatMoney(amountLoaned)}.
          </div>
          <Spacer h={4} />
        </>
      )}

      <table className="table-zebra table-compact table w-full text-gray-500">
        <thead>
          <tr className="p-2">
            <th></th>
            {isCPMM && <th>Type</th>}
            <th>Outcome</th>
            <th>Amount</th>
            {!isCPMM && !isNumeric && (
              <th>{isResolved ? <>Payout</> : <>Sale price</>}</th>
            )}
            {!isCPMM && !isResolved && <th>Payout if chosen</th>}
            <th>Shares</th>
            {!isPseudoNumeric && <th>Probability</th>}
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
              unfilledBets={unfilledBets}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function BetRow(props: {
  bet: Bet
  contract: Contract
  saleBet?: Bet
  isYourBet: boolean
  unfilledBets: LimitBet[]
}) {
  const { bet, saleBet, contract, isYourBet, unfilledBets } = props
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
  const isNumeric = outcomeType === 'NUMERIC'
  const isPseudoNumeric = outcomeType === 'PSEUDO_NUMERIC'

  const saleAmount = saleBet?.sale?.amount

  const saleDisplay = isAnte ? (
    'ANTE'
  ) : saleAmount !== undefined ? (
    <>{formatMoney(saleAmount)} (sold)</>
  ) : (
    formatMoney(
      isResolved
        ? resolvedPayout(contract, bet)
        : calculateSaleAmount(contract, bet, unfilledBets)
    )
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

  return (
    <tr>
      <td className="text-neutral">
        {isYourBet &&
          !isCPMM &&
          !isResolved &&
          !isClosed &&
          !isSold &&
          !isAnte &&
          !isNumeric && <SellButton contract={contract} bet={bet} />}
      </td>
      {isCPMM && <td>{shares >= 0 ? 'BUY' : 'SELL'}</td>}
      <td>
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
        {isPseudoNumeric &&
          ' than ' + formatNumericProbability(bet.probAfter, contract)}
      </td>
      <td>
        {formatMoney(Math.abs(amount))}
        {ofTotalAmount}
      </td>
      {!isCPMM && !isNumeric && <td>{saleDisplay}</td>}
      {!isCPMM && !isResolved && <td>{payoutIfChosenDisplay}</td>}
      <td>{formatWithCommas(Math.abs(shares))}</td>
      {!isPseudoNumeric && (
        <td>
          {outcomeType === 'FREE_RESPONSE' || hadPoolMatch ? (
            <>
              {formatPercent(probBefore)} → {formatPercent(probAfter)}
            </>
          ) : (
            formatPercent(bet.limitProb ?? 0)
          )}
        </td>
      )}
      <td>{dayjs(createdTime).format('MMM D, h:mma')}</td>
    </tr>
  )
}

function SellButton(props: { contract: Contract; bet: Bet }) {
  const { contract, bet } = props
  const { outcome, shares, loanAmount } = bet

  const [isSubmitting, setIsSubmitting] = useState(false)

  const initialProb = getOutcomeProbability(
    contract,
    outcome === 'NO' ? 'YES' : outcome
  )

  const unfilledBets = useUnfilledBets(contract.id) ?? []

  const outcomeProb = getProbabilityAfterSale(
    contract,
    outcome,
    shares,
    unfilledBets
  )

  const saleAmount = calculateSaleAmount(contract, bet, unfilledBets)
  const profit = saleAmount - bet.amount

  return (
    <ConfirmationButton
      openModalBtn={{
        className: clsx('btn-sm', isSubmitting && 'btn-disabled loading'),
        label: 'Sell',
      }}
      submitBtn={{ className: 'btn-primary', label: 'Sell' }}
      onSubmit={async () => {
        setIsSubmitting(true)
        await sellBet({ contractId: contract.id, betId: bet.id })
        setIsSubmitting(false)
      }}
    >
      <div className="mb-4 text-2xl">
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

function ProfitBadge(props: { profitPercent: number }) {
  const { profitPercent } = props
  if (!profitPercent) return null
  const colors =
    profitPercent > 0
      ? 'bg-green-100 text-green-800'
      : 'bg-red-100 text-red-800'

  return (
    <span
      className={clsx(
        'ml-1 inline-flex items-center rounded-full px-3 py-0.5 text-sm font-medium',
        colors
      )}
    >
      {(profitPercent > 0 ? '+' : '') + profitPercent.toFixed(1) + '%'}
    </span>
  )
}
