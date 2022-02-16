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
import {
  calculateCancelPayout,
  calculatePayout,
  calculateSaleAmount,
  getProbability,
  resolvedPayout,
} from '../../common/calculate'
import { sellBet } from '../lib/firebase/api-call'
import { ConfirmationButton } from './confirmation-button'
import { OutcomeLabel, YesLabel, NoLabel } from './outcome-label'

type BetSort = 'newest' | 'profit'

export function BetsList(props: { user: User }) {
  const { user } = props
  const bets = useUserBets(user.id)

  const [contracts, setContracts] = useState<Contract[]>([])

  const [sort, setSort] = useState<BetSort>('profit')

  useEffect(() => {
    const loadedBets = bets ? bets : []
    const contractIds = _.uniq(loadedBets.map((bet) => bet.contractId))

    let disposed = false
    Promise.all(contractIds.map((id) => getContractFromId(id))).then(
      (contracts) => {
        if (!disposed) setContracts(contracts.filter(Boolean) as Contract[])
      }
    )

    return () => {
      disposed = true
    }
  }, [bets])

  if (!bets) {
    return <></>
  }

  if (bets.length === 0)
    return (
      <div>
        You have not made any bets yet.{' '}
        <Link href="/">
          <a className="text-green-500 hover:underline hover:decoration-2">
            Find a prediction market!
          </a>
        </Link>
      </div>
    )

  // Decending creation time.
  bets.sort((bet1, bet2) => bet2.createdTime - bet1.createdTime)

  const contractBets = _.groupBy(bets, 'contractId')

  const contractsCurrentValue = _.mapValues(
    contractBets,
    (bets, contractId) => {
      return _.sumBy(bets, (bet) => {
        if (bet.isSold || bet.sale) return 0

        const contract = contracts.find((c) => c.id === contractId)
        return contract ? calculatePayout(contract, bet, 'MKT') : 0
      })
    }
  )
  const contractsInvestment = _.mapValues(contractBets, (bets) => {
    return _.sumBy(bets, (bet) => {
      if (bet.isSold || bet.sale) return 0
      return bet.amount
    })
  })

  let sortedContracts = contracts
  if (sort === 'profit') {
    sortedContracts = _.sortBy(
      contracts,
      (c) => -1 * (contractsCurrentValue[c.id] - contractsInvestment[c.id])
    )
  }

  const [resolved, unresolved] = _.partition(
    sortedContracts,
    (c) => c.isResolved
  )

  const currentInvestment = _.sumBy(
    unresolved,
    (c) => contractsInvestment[c.id]
  )

  const currentBetsValue = _.sumBy(
    unresolved,
    (c) => contractsCurrentValue[c.id]
  )

  const totalPortfolio = currentBetsValue + user.balance

  const totalPnl = totalPortfolio - user.totalDeposits
  const totalProfit = (totalPnl / user.totalDeposits) * 100
  const investedProfit =
    ((currentBetsValue - currentInvestment) / currentInvestment) * 100

  return (
    <Col className="mt-6 gap-4 sm:gap-6">
      <Col className="mx-4 gap-4 sm:flex-row sm:justify-between md:mx-0">
        <Row className="gap-8">
          <Col>
            <div className="text-sm text-gray-500">Invested</div>
            <div className="text-lg">
              {formatMoney(currentBetsValue)}{' '}
              <ProfitBadge profitPercent={investedProfit} />
            </div>
          </Col>
          <Col>
            <div className="text-sm text-gray-500">Balance</div>
            <div className="whitespace-nowrap text-lg">
              {formatMoney(user.balance)}{' '}
            </div>
          </Col>
          <Col>
            <div className="text-sm text-gray-500">Total portfolio</div>
            <div className="text-lg">
              {formatMoney(totalPortfolio)}{' '}
              <ProfitBadge profitPercent={totalProfit} />
            </div>
          </Col>
        </Row>

        <select
          className="select select-bordered self-start"
          value={sort}
          onChange={(e) => setSort(e.target.value as BetSort)}
        >
          <option value="profit">By profit</option>
          <option value="newest">Newest</option>
        </select>
      </Col>

      {[...unresolved, ...resolved].map((contract) => (
        <MyContractBets
          key={contract.id}
          contract={contract}
          bets={contractBets[contract.id] ?? []}
        />
      ))}
    </Col>
  )
}

function MyContractBets(props: { contract: Contract; bets: Bet[] }) {
  const { bets, contract } = props
  const { resolution, outcomeType } = contract

  const [collapsed, setCollapsed] = useState(true)

  const isBinary = outcomeType === 'BINARY'
  const probPercent = getBinaryProbPercent(contract)

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

          <Row className="items-center gap-2 text-sm text-gray-500">
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

        <MyBetsSummary
          className="mr-5 justify-end sm:mr-8"
          contract={contract}
          bets={bets}
          onlyMKT
        />
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
  onlyMKT?: boolean
  className?: string
}) {
  const { bets, contract, onlyMKT, className } = props
  const { resolution, outcomeType } = contract
  const isBinary = outcomeType === 'BINARY'

  const excludeSales = bets.filter((b) => !b.isSold && !b.sale)
  const betsTotal = _.sumBy(excludeSales, (bet) => bet.amount)

  const betsPayout = resolution
    ? _.sumBy(excludeSales, (bet) => resolvedPayout(contract, bet))
    : 0

  const yesWinnings = _.sumBy(excludeSales, (bet) =>
    calculatePayout(contract, bet, 'YES')
  )
  const noWinnings = _.sumBy(excludeSales, (bet) =>
    calculatePayout(contract, bet, 'NO')
  )

  const marketWinnings = _.sumBy(excludeSales, (bet) =>
    calculatePayout(contract, bet, 'MKT')
  )

  const currentValue = resolution ? betsPayout : marketWinnings
  const pnl = currentValue - betsTotal
  const profit = (pnl / betsTotal) * 100

  const valueCol = (
    <Col>
      <div className="whitespace-nowrap text-right text-lg">
        {formatMoney(currentValue)}
      </div>
      <div className="text-right">
        <ProfitBadge profitPercent={profit} />
      </div>
    </Col>
  )

  const payoutCol = (
    <Col>
      <div className="text-sm text-gray-500">Payout</div>
      <div className="whitespace-nowrap">
        {formatMoney(betsPayout)} <ProfitBadge profitPercent={profit} />
      </div>
    </Col>
  )

  return (
    <Row
      className={clsx(
        'gap-4 sm:gap-6',
        !onlyMKT && 'flex-wrap sm:flex-nowrap',
        className
      )}
    >
      {onlyMKT ? (
        <Row className="gap-4 sm:gap-6">{valueCol}</Row>
      ) : (
        <Row className="gap-4 sm:gap-6">
          <Col>
            <div className="whitespace-nowrap text-sm text-gray-500">
              Invested
            </div>
            <div className="whitespace-nowrap">{formatMoney(betsTotal)}</div>
          </Col>
          {resolution ? (
            payoutCol
          ) : (
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
              <Col>
                <div className="whitespace-nowrap text-sm text-gray-500">
                  {isBinary ? (
                    <>
                      Payout at{' '}
                      <span className="text-blue-400">
                        {formatPercent(getProbability(contract.totalShares))}
                      </span>
                    </>
                  ) : (
                    <>Current payout</>
                  )}
                </div>
                <div className="whitespace-nowrap">
                  {formatMoney(marketWinnings)}
                </div>
              </Col>
            </>
          )}
        </Row>
      )}
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

  const { isResolved } = contract

  return (
    <div className={clsx('overflow-x-auto', className)}>
      <table className="table-zebra table-compact table w-full text-gray-500">
        <thead>
          <tr className="p-2">
            <th>Date</th>
            <th>Outcome</th>
            <th>Amount</th>
            <th>Probability</th>
            <th>Shares</th>
            <th>{isResolved ? <>Payout</> : <>Sale price</>}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {buys.map((bet) => (
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

  const { isResolved, closeTime } = contract
  const isClosed = closeTime && Date.now() > closeTime

  const saleAmount = saleBet?.sale?.amount

  const saleDisplay = bet.isAnte ? (
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

  return (
    <tr>
      <td>{dayjs(createdTime).format('MMM D, h:mma')}</td>
      <td>
        <OutcomeLabel outcome={outcome} />
      </td>
      <td>{formatMoney(amount)}</td>
      <td>
        {formatPercent(probBefore)} → {formatPercent(probAfter)}
      </td>
      <td>{formatWithCommas(shares)}</td>
      <td>{saleDisplay}</td>

      {!isResolved && !isClosed && !isSold && !isAnte && (
        <td className="text-neutral">
          <SellButton contract={contract} bet={bet} />
        </td>
      )}
    </tr>
  )
}

function SellButton(props: { contract: Contract; bet: Bet }) {
  useEffect(() => {
    // warm up cloud function
    sellBet({}).catch()
  }, [])

  const { contract, bet } = props
  const [isSubmitting, setIsSubmitting] = useState(false)

  return (
    <ConfirmationButton
      id={`sell-${bet.id}`}
      openModelBtn={{
        className: clsx('btn-sm', isSubmitting && 'btn-disabled loading'),
        label: 'Sell',
      }}
      submitBtn={{ className: 'btn-primary' }}
      onSubmit={async () => {
        setIsSubmitting(true)
        await sellBet({ contractId: contract.id, betId: bet.id })
        setIsSubmitting(false)
      }}
    >
      <div className="mb-4 text-2xl">
        Sell <OutcomeLabel outcome={bet.outcome} />
      </div>
      <div>
        Do you want to sell {formatWithCommas(bet.shares)} shares of{' '}
        <OutcomeLabel outcome={bet.outcome} /> for{' '}
        {formatMoney(calculateSaleAmount(contract, bet))}?
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
