import Link from 'next/link'
import _ from 'lodash'
import dayjs from 'dayjs'
import { useEffect, useState } from 'react'
import { useUserBets } from '../hooks/use-user-bets'
import { Bet } from '../lib/firebase/bets'
import { User } from '../lib/firebase/users'
import { formatMoney, formatPercent } from '../lib/util/format'
import { Col } from './layout/col'
import { Spacer } from './layout/spacer'
import { Contract, getContractFromId, path } from '../lib/firebase/contracts'
import { Row } from './layout/row'
import { UserLink } from './user-page'
import {
  calculatePayout,
  calculateSaleAmount,
  currentValue,
  resolvedPayout,
} from '../lib/calculate'
import clsx from 'clsx'
import { cloudFunction } from '../lib/firebase/api-call'
import { ConfirmationButton } from './confirmation-button'

export function BetsList(props: { user: User }) {
  const { user } = props
  const bets = useUserBets(user?.id ?? '')

  const [contracts, setContracts] = useState<Contract[]>([])

  useEffect(() => {
    const loadedBets = bets === 'loading' ? [] : bets
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

  if (bets === 'loading') {
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

  const [resolved, unresolved] = _.partition(
    contracts,
    (contract) => contract.isResolved
  )
  const currentBets = _.sumBy(unresolved, (contract) =>
    _.sumBy(contractBets[contract.id], (bet) => bet.amount)
  )

  const currentBetsValue = _.sumBy(unresolved, (contract) =>
    _.sumBy(contractBets[contract.id], (bet) => currentValue(contract, bet))
  )

  return (
    <Col className="mt-6 gap-6">
      <Row className="gap-8">
        <Col>
          <div className="text-sm text-gray-500">Active bets</div>
          <div>{formatMoney(currentBets)}</div>
        </Col>
        <Col>
          <div className="text-sm text-gray-500">Current value</div>
          <div>{formatMoney(currentBetsValue)}</div>
        </Col>
      </Row>

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
  const { resolution } = contract

  const [collapsed, setCollapsed] = useState(true)

  return (
    <div
      tabIndex={0}
      className={clsx(
        'p-6 bg-white card card-body shadow-xl collapse collapse-arrow cursor-pointer relative',
        collapsed ? 'collapse-close' : 'collapse-open pb-2'
      )}
      onClick={() => setCollapsed((collapsed) => !collapsed)}
    >
      <Row className="flex-wrap gap-4">
        <Col className="flex-[2] gap-1">
          <Row className="mr-6">
            <Link href={path(contract)}>
              <a
                className="font-medium text-indigo-700 hover:underline hover:decoration-indigo-400 hover:decoration-2"
                onClick={(e) => e.stopPropagation()}
              >
                {contract.question}
              </a>
            </Link>

            {/* Show carrot for collapsing. Hack the positioning. */}
            <div
              className="collapse-title p-0 absolute w-0 h-0 min-h-0"
              style={{ top: -10, right: 4 }}
            />
          </Row>

          <Row className="gap-2 text-gray-500 text-sm">
            <div>
              <UserLink username={contract.creatorUsername} />
            </div>
            {resolution && (
              <>
                <div>•</div>
                <div className="whitespace-nowrap">
                  Resolved <OutcomeLabel outcome={resolution} />
                </div>
              </>
            )}
          </Row>
        </Col>

        <MyBetsSummary
          className="flex-1 justify-end mr-5 sm:mr-8"
          contract={contract}
          bets={bets}
        />
      </Row>

      <div
        className="collapse-content !px-0"
        style={{ backgroundColor: 'white' }}
      >
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
  const { resolution } = contract

  const excludeSales = bets.filter((b) => !b.isSold && !b.sale)
  const betsTotal = _.sumBy(excludeSales, (bet) => bet.amount)

  const betsPayout = resolution
    ? _.sumBy(bets, (bet) => resolvedPayout(contract, bet))
    : 0

  const yesWinnings = _.sumBy(excludeSales, (bet) =>
    calculatePayout(contract, bet, 'YES')
  )
  const noWinnings = _.sumBy(excludeSales, (bet) =>
    calculatePayout(contract, bet, 'NO')
  )

  return (
    <Row className={clsx('gap-4 sm:gap-6', className)}>
      <Col>
        <div className="text-sm text-gray-500 whitespace-nowrap">
          Amount invested
        </div>
        <div className="whitespace-nowrap">{formatMoney(betsTotal)}</div>
      </Col>
      {resolution ? (
        <>
          <Col>
            <div className="text-sm text-gray-500">Payout</div>
            <div className="whitespace-nowrap">{formatMoney(betsPayout)}</div>
          </Col>
        </>
      ) : (
        <>
          <Col>
            <div className="text-sm text-gray-500 whitespace-nowrap">
              Payout if <YesLabel />
            </div>
            <div className="whitespace-nowrap">{formatMoney(yesWinnings)}</div>
          </Col>
          <Col>
            <div className="text-sm text-gray-500 whitespace-nowrap">
              Payout if <NoLabel />
            </div>
            <div className="whitespace-nowrap">{formatMoney(noWinnings)}</div>
          </Col>
        </>
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
      <table className="table table-zebra table-compact text-gray-500 w-full">
        <thead>
          <tr className="p-2">
            <th>Date</th>
            <th>Outcome</th>
            <th>Amount</th>
            <th>Probability</th>
            {!isResolved && <th>Est. max payout</th>}
            <th>{isResolved ? <>Payout</> : <>Current value</>}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {buys.map((bet) => (
            <BetRow
              key={bet.id}
              bet={bet}
              sale={salesDict[bet.id]}
              contract={contract}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function BetRow(props: { bet: Bet; contract: Contract; sale?: Bet }) {
  const { bet, sale, contract } = props
  const {
    amount,
    outcome,
    createdTime,
    probBefore,
    probAfter,
    shares,
    isSold,
  } = bet
  const { isResolved } = contract

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
      {!isResolved && <td>{formatMoney(shares)}</td>}
      <td>
        {bet.isSold
          ? 'N/A'
          : formatMoney(
              isResolved
                ? resolvedPayout(contract, bet)
                : bet.sale
                ? bet.sale.amount ?? 0
                : currentValue(contract, bet)
            )}
      </td>

      {sale ? (
        <td>SOLD for {formatMoney(Math.abs(sale.amount))}</td>
      ) : (
        !isResolved &&
        !isSold && (
          <td className="text-neutral">
            <ConfirmationButton
              id={`sell-${bet.id}`}
              openModelBtn={{ className: 'btn-sm', label: 'Sell' }}
              submitBtn={{ className: 'btn-primary' }}
              onSubmit={async () => {
                await sellBet({ contractId: contract.id, betId: bet.id })
              }}
            >
              <div className="text-2xl mb-4">Sell</div>
              <div>
                Do you want to sell your {formatMoney(bet.amount)} bet for{' '}
                {formatMoney(calculateSaleAmount(contract, bet))}?
              </div>
            </ConfirmationButton>
          </td>
        )
      )}
    </tr>
  )
}

const sellBet = cloudFunction('sellBet')

function OutcomeLabel(props: { outcome: 'YES' | 'NO' | 'CANCEL' }) {
  const { outcome } = props

  if (outcome === 'YES') return <YesLabel />
  if (outcome === 'NO') return <NoLabel />
  return <CancelLabel />
}

function YesLabel() {
  return <span className="text-primary">YES</span>
}

function NoLabel() {
  return <span className="text-red-400">NO</span>
}

function CancelLabel() {
  return <span className="text-yellow-400">N/A</span>
}
