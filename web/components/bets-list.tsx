import Link from 'next/link'
import _ from 'lodash'
import dayjs from 'dayjs'
import { useEffect, useState } from 'react'
import clsx from 'clsx'

import { useUserBets } from '../hooks/use-user-bets'
import { Bet } from '../lib/firebase/bets'
import { User } from '../lib/firebase/users'
import {
  formatMoney,
  formatPercent,
  formatWithCommas,
} from '../../common/util/format'
import { Col } from './layout/col'
import { Spacer } from './layout/spacer'
import {
  Contract,
  getContractFromId,
  contractPath,
  getBinaryProbPercent,
} from '../lib/firebase/contracts'
import { Row } from './layout/row'
import { UserLink } from './user-page'
import { sellBet } from '../lib/firebase/api-call'
import { ConfirmationButton } from './confirmation-button'
import { OutcomeLabel, YesLabel, NoLabel } from './outcome-label'
import { filterDefined } from '../../common/util/array'
import { LoadingIndicator } from './loading-indicator'
import { SiteLink } from './site-link'
import {
  calculatePayout,
  calculateSaleAmount,
  getOutcomeProbability,
  getProbability,
  getProbabilityAfterSale,
  getContractBetMetrics,
  resolvedPayout,
  getContractBetNullMetrics,
} from '../../common/calculate'

type BetSort = 'newest' | 'profit' | 'resolutionTime' | 'value' | 'closeTime'
type BetFilter = 'open' | 'closed' | 'resolved' | 'all'

export function BetsList(props: { user: User }) {
  const { user } = props
  const bets = useUserBets(user.id)

  const [contracts, setContracts] = useState<Contract[] | undefined>()

  const [sort, setSort] = useState<BetSort>('value')
  const [filter, setFilter] = useState<BetFilter>('open')

  useEffect(() => {
    if (bets) {
      const contractIds = _.uniq(bets.map((bet) => bet.contractId))

      let disposed = false
      Promise.all(contractIds.map((id) => getContractFromId(id))).then(
        (contracts) => {
          if (!disposed) setContracts(filterDefined(contracts))
        }
      )

      return () => {
        disposed = true
      }
    }
  }, [bets])

  if (!bets || !contracts) {
    return <LoadingIndicator />
  }

  if (bets.length === 0) return <NoBets />
  // Decending creation time.
  bets.sort((bet1, bet2) => bet2.createdTime - bet1.createdTime)
  const contractBets = _.groupBy(bets, 'contractId')
  const contractsById = _.fromPairs(contracts.map((c) => [c.id, c]))

  const contractsMetrics = _.mapValues(contractBets, (bets, contractId) => {
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
    // Pepe notes: most users want "settled", to see when their bets or sold; or "realized profit"
  }
  const SORTS: Record<BetSort, (c: Contract) => number> = {
    profit: (c) => contractsMetrics[c.id].profit,
    value: (c) => contractsMetrics[c.id].totalValue,
    newest: (c) =>
      Math.max(...contractBets[c.id].map((bet) => bet.createdTime)),
    resolutionTime: (c) => -(c.resolutionTime ?? c.closeTime ?? Infinity),
    closeTime: (c) => -(c.closeTime ?? Infinity),
  }
  const displayedContracts = _.sortBy(contracts, SORTS[sort])
    .reverse()
    .filter(FILTERS[filter])

  const [settled, unsettled] = _.partition(
    contracts,
    (c) => c.isResolved || contractsMetrics[c.id].invested === 0
  )

  const currentInvested = _.sumBy(
    unsettled,
    (c) => contractsMetrics[c.id].invested
  )
  const currentBetsValue = _.sumBy(
    unsettled,
    (c) => contractsMetrics[c.id].payout
  )
  const currentNetInvestment = _.sumBy(
    unsettled,
    (c) => contractsMetrics[c.id].netInvestment
  )

  const totalPortfolio = currentNetInvestment + user.balance

  const totalPnl = totalPortfolio - user.totalDeposits
  const totalProfitPercent = (totalPnl / user.totalDeposits) * 100
  const investedProfitPercent =
    ((currentBetsValue - currentInvested) / currentInvested) * 100

  return (
    <Col className="mt-6 gap-4 sm:gap-6">
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
            <option value="closed">Closed</option>
            <option value="resolved">Resolved</option>
            <option value="all">All</option>
          </select>

          <select
            className="select select-bordered self-start"
            value={sort}
            onChange={(e) => setSort(e.target.value as BetSort)}
          >
            <option value="value">By value</option>
            <option value="profit">By profit</option>
            <option value="newest">Most recent</option>
            <option value="closeTime">Closing soonest</option>
            <option value="resolutionTime">Resolved soonest</option>
          </select>
        </Row>
      </Col>

      {displayedContracts.length === 0 ? (
        <NoBets />
      ) : (
        displayedContracts.map((contract) => (
          <MyContractBets
            key={contract.id}
            contract={contract}
            bets={contractBets[contract.id] ?? []}
            metric={sort === 'profit' ? 'profit' : 'value'}
          />
        ))
      )}
    </Col>
  )
}

const NoBets = () => {
  return (
    <div className="mx-4 text-gray-500">
      You have not made any bets yet.{' '}
      <SiteLink href="/" className="underline">
        Find a prediction market!
      </SiteLink>
    </div>
  )
}

function MyContractBets(props: {
  contract: Contract
  bets: Bet[]
  metric: 'profit' | 'value'
}) {
  const { bets, contract, metric } = props
  const { resolution, outcomeType } = contract

  const [collapsed, setCollapsed] = useState(true)

  const isBinary = outcomeType === 'BINARY'
  const probPercent = getBinaryProbPercent(contract)

  const { totalValue, profit, profitPercent } = getContractBetMetrics(
    contract,
    bets
  )

  return (
    <div
      tabIndex={0}
      className={clsx(
        'card card-body collapse collapse-arrow relative cursor-pointer bg-white p-6 shadow-xl',
        collapsed ? 'collapse-close' : 'collapse-open pb-2'
      )}
      onClick={() => setCollapsed((collapsed) => !collapsed)}
    >
      <Row className="flex-wrap gap-2">
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
              style={{ top: -10, right: 4 }}
            />
          </Row>

          <Row className="flex-1 items-center gap-2 text-sm text-gray-500">
            {isBinary && (
              <>
                {resolution ? (
                  <div>
                    Resolved <OutcomeLabel outcome={resolution} />
                  </div>
                ) : (
                  <div className="text-primary text-lg">{probPercent}</div>
                )}
                <div>•</div>
              </>
            )}
            <UserLink
              name={contract.creatorName}
              username={contract.creatorUsername}
            />
          </Row>
        </Col>

        <Row className="mr-5 justify-end sm:mr-8">
          <Col>
            <div className="whitespace-nowrap text-right text-lg">
              {formatMoney(metric === 'profit' ? profit : totalValue)}
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

        <MyBetsSummary
          className="mr-5 flex-1 sm:mr-8"
          contract={contract}
          bets={bets}
        />

        <Spacer h={8} />

        <ContractBetsTable contract={contract} bets={bets} />
      </div>
    </div>
  )
}

export function MyBetsSummary(props: {
  contract: Contract
  bets: Bet[]
  className?: string
}) {
  const { bets, contract, className } = props
  const { resolution, outcomeType } = contract
  const isBinary = outcomeType === 'BINARY'

  const excludeSales = bets.filter((b) => !b.isSold && !b.sale)
  const yesWinnings = _.sumBy(excludeSales, (bet) =>
    calculatePayout(contract, bet, 'YES')
  )
  const noWinnings = _.sumBy(excludeSales, (bet) =>
    calculatePayout(contract, bet, 'NO')
  )
  const { invested, profitPercent, payout } = getContractBetMetrics(
    contract,
    bets
  )

  console.log(getContractBetMetrics(contract, bets))

  return (
    <Row className={clsx('flex-wrap gap-4 sm:flex-nowrap sm:gap-6', className)}>
      <Row className="gap-4 sm:gap-6">
        <Col>
          <div className="whitespace-nowrap text-sm text-gray-500">
            Invested
          </div>
          <div className="whitespace-nowrap">{formatMoney(invested)}</div>
        </Col>
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
            {isBinary && (
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
            )}
            <Col>
              <div className="whitespace-nowrap text-sm text-gray-500">
                {isBinary ? (
                  <>
                    Payout at{' '}
                    <span className="text-blue-400">
                      {formatPercent(getProbability(contract))}
                    </span>
                  </>
                ) : (
                  <>Current payout</>
                )}
              </div>
              <div className="whitespace-nowrap">{formatMoney(payout)}</div>
            </Col>
          </>
        )}
      </Row>
    </Row>
  )
}

export function ContractBetsTable(props: {
  contract: Contract
  bets: Bet[]
  className?: string
}) {
  const { contract, bets, className } = props

  const [sales, buys] = _.partition(bets, (bet) => bet.sale)

  const salesDict = _.fromPairs(
    sales.map((sale) => [sale.sale?.betId ?? '', sale])
  )

  const [redemptions, normalBets] = _.partition(buys, (b) => b.isRedemption)
  const amountRedeemed = Math.floor(
    -0.5 * _.sumBy(redemptions, (b) => b.shares)
  )

  const amountLoaned = _.sumBy(
    bets.filter((bet) => !bet.isSold && !bet.sale),
    (bet) => bet.loanAmount ?? 0
  )

  const { isResolved, mechanism } = contract
  const isCPMM = mechanism === 'cpmm-1'

  return (
    <div className={clsx('overflow-x-auto', className)}>
      {amountRedeemed > 0 && (
        <>
          <div className="pl-2 text-sm text-gray-500">
            {amountRedeemed} YES shares and {amountRedeemed} NO shares
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
            {!isCPMM && <th>{isResolved ? <>Payout</> : <>Sale price</>}</th>}
            {!isCPMM && !isResolved && <th>Payout if chosen</th>}
            <th>Shares</th>
            <th>Probability</th>
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
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function BetRow(props: { bet: Bet; contract: Contract; saleBet?: Bet }) {
  const { bet, saleBet, contract } = props
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

  const { isResolved, closeTime, mechanism } = contract

  const isClosed = closeTime && Date.now() > closeTime

  const isCPMM = mechanism === 'cpmm-1'

  const saleAmount = saleBet?.sale?.amount

  const saleDisplay = isAnte ? (
    'ANTE'
  ) : saleAmount !== undefined ? (
    <>{formatMoney(saleAmount)} (sold)</>
  ) : (
    formatMoney(
      isResolved
        ? resolvedPayout(contract, bet)
        : calculateSaleAmount(contract, bet)
    )
  )

  const payoutIfChosenDisplay =
    bet.outcome === '0' && bet.isAnte
      ? 'N/A'
      : formatMoney(calculatePayout(contract, bet, bet.outcome))

  return (
    <tr>
      <td className="text-neutral">
        {!isCPMM && !isResolved && !isClosed && !isSold && !isAnte && (
          <SellButton contract={contract} bet={bet} />
        )}
      </td>
      {isCPMM && <td>{shares >= 0 ? 'BUY' : 'SELL'}</td>}
      <td>
        <OutcomeLabel outcome={outcome} />
      </td>
      <td>{formatMoney(Math.abs(amount))}</td>
      {!isCPMM && <td>{saleDisplay}</td>}
      {!isCPMM && !isResolved && <td>{payoutIfChosenDisplay}</td>}
      <td>{formatWithCommas(Math.abs(shares))}</td>
      <td>
        {formatPercent(probBefore)} → {formatPercent(probAfter)}
      </td>
      <td>{dayjs(createdTime).format('MMM D, h:mma')}</td>
    </tr>
  )
}

function SellButton(props: { contract: Contract; bet: Bet }) {
  useEffect(() => {
    // warm up cloud function
    sellBet({}).catch()
  }, [])

  const { contract, bet } = props
  const { outcome, shares, loanAmount } = bet

  const [isSubmitting, setIsSubmitting] = useState(false)

  const initialProb = getOutcomeProbability(
    contract,
    outcome === 'NO' ? 'YES' : outcome
  )

  const outcomeProb = getProbabilityAfterSale(contract, outcome, shares)

  const saleAmount = calculateSaleAmount(contract, bet)
  const profit = saleAmount - bet.amount

  return (
    <ConfirmationButton
      id={`sell-${bet.id}`}
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
        <OutcomeLabel outcome={outcome} /> for {formatMoney(saleAmount)}?
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
