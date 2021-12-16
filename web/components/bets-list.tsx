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
import { Contract, getContract, path } from '../lib/firebase/contracts'
import { Row } from './layout/row'
import { UserLink } from './user-page'
import {
  calculatePayout,
  currentValue,
  resolvedPayout,
} from '../lib/calculation/contract'
import clsx from 'clsx'

export function BetsList(props: { user: User }) {
  const { user } = props
  const bets = useUserBets(user?.id ?? '')

  const [contracts, setContracts] = useState<Contract[]>([])

  useEffect(() => {
    const loadedBets = bets === 'loading' ? [] : bets
    const contractIds = _.uniq(loadedBets.map((bet) => bet.contractId))

    let disposed = false
    Promise.all(contractIds.map((id) => getContract(id))).then((contracts) => {
      if (!disposed) setContracts(contracts.filter(Boolean) as Contract[])
    })

    return () => {
      disposed = true
    }
  }, [bets])

  if (bets === 'loading') {
    return <></>
  }

  if (bets.length === 0) return <div>You have not made any bets yet!</div>

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
    <Col className="mt-6 gap-10">
      <Row className="px-4 gap-8">
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
          bets={contractBets[contract.id]}
        />
      ))}
    </Col>
  )
}

function MyContractBets(props: { contract: Contract; bets: Bet[] }) {
  const { bets, contract } = props
  const { resolution } = contract

  return (
    <div className="p-6 bg-white card card-body shadow-xl">
      <Row>
        <Col className="w-2/3">
          <Link href={path(contract)}>
            <a>
              <div className="font-medium text-indigo-700 mb-1 hover:underline hover:decoration-indigo-400 hover:decoration-2">
                {contract.question}
              </div>
            </a>
          </Link>

          <Row className="gap-2 text-gray-500 text-sm">
            <div>
              <UserLink displayName={contract.creatorName} />
            </div>
            {resolution && (
              <>
                <div>•</div>
                <div>
                  Resolved {resolution === 'YES' && <YesLabel />}
                  {resolution === 'NO' && <NoLabel />}
                  {resolution === 'CANCEL' && <CancelLabel />}
                </div>
              </>
            )}
          </Row>
        </Col>

        {/* Show this at the end of the flex */}
        <MyBetsSummary contract={contract} bets={bets} className="ml-auto" />
      </Row>

      <Spacer h={8} />

      <ContractBetsTable contract={contract} bets={bets} />
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

  const betsTotal = _.sumBy(bets, (bet) => bet.amount)

  const betsPayout = resolution
    ? _.sumBy(bets, (bet) => resolvedPayout(contract, bet))
    : 0

  const yesWinnings = _.sumBy(bets, (bet) =>
    calculatePayout(contract, bet, 'YES')
  )
  const noWinnings = _.sumBy(bets, (bet) =>
    calculatePayout(contract, bet, 'NO')
  )

  return (
    <Row className={clsx('gap-8', className)}>
      <Col>
        <div className="text-sm text-gray-500">Total bet</div>
        <div>{formatMoney(betsTotal)}</div>
      </Col>
      {resolution ? (
        <>
          <Col>
            <div className="text-sm text-gray-500">Winnings</div>
            <div>{formatMoney(betsPayout)}</div>
          </Col>
        </>
      ) : (
        <>
          <Col>
            <div className="text-sm text-gray-500">
              If <YesLabel />
            </div>
            <div>{formatMoney(yesWinnings)}</div>
          </Col>
          <Col>
            <div className="text-sm text-gray-500">
              If <NoLabel />
            </div>
            <div>{formatMoney(noWinnings)}</div>
          </Col>
        </>
      )}
    </Row>
  )
}

export function ContractBetsTable(props: { contract: Contract; bets: Bet[] }) {
  const { contract, bets } = props

  const { isResolved } = contract

  return (
    <div className="overflow-x-auto">
      <table className="table table-zebra table-compact text-gray-500 w-full">
        <thead>
          <tr className="p-2">
            <th>Date</th>
            <th>Outcome</th>
            <th>Bet</th>
            <th>Probability</th>
            {!isResolved && <th>Est. max payout</th>}
            <th>{isResolved ? <>Payout</> : <>Current value</>}</th>
          </tr>
        </thead>
        <tbody>
          {bets.map((bet) => (
            <BetRow key={bet.id} bet={bet} contract={contract} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function BetRow(props: { bet: Bet; contract: Contract }) {
  const { bet, contract } = props
  const { amount, outcome, createdTime, probBefore, probAfter, dpmWeight } = bet
  const { isResolved } = contract

  return (
    <tr>
      <td>{dayjs(createdTime).format('MMM D, H:mma')}</td>
      <td>{outcome}</td>
      <td>{formatMoney(amount)}</td>
      <td>
        {formatPercent(probBefore)} → {formatPercent(probAfter)}
      </td>
      {!isResolved && <td>{formatMoney(amount + dpmWeight)}</td>}
      <td>
        {formatMoney(
          isResolved
            ? resolvedPayout(contract, bet)
            : currentValue(contract, bet)
        )}
      </td>
    </tr>
  )
}

function YesLabel() {
  return <span className="text-primary">YES</span>
}

function NoLabel() {
  return <span className="text-red-400">NO</span>
}

function CancelLabel() {
  return <span className="text-yellow-400">CANCEL</span>
}
