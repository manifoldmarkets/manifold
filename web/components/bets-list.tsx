import Link from 'next/link'
import _ from 'lodash'
import dayjs from 'dayjs'
import { useContract } from '../hooks/use-contract'
import { useUserBets } from '../hooks/use-user-bets'
import { Bet } from '../lib/firebase/bets'
import { User } from '../lib/firebase/users'
import { formatMoney, formatPercent } from '../lib/util/format'
import { Col } from './layout/col'
import { Spacer } from './layout/spacer'
import { Contract, path } from '../lib/firebase/contracts'
import { Row } from './layout/row'
import { UserLink } from './user-page'
import {
  calculatePayout,
  currentValue,
  resolvedPayout,
} from '../lib/calculation/contract'

export function BetsList(props: { user: User }) {
  const { user } = props
  const bets = useUserBets(user?.id ?? '')

  if (bets === 'loading') {
    return <></>
  }

  if (bets.length === 0) return <div>You have not made any bets yet!</div>

  const contractBets = _.groupBy(bets, 'contractId')

  return (
    <Col className="mt-6 gap-10">
      {Object.keys(contractBets).map((contractId) => (
        <MyContractBets
          key={contractId}
          contractId={contractId}
          bets={contractBets[contractId]}
        />
      ))}
    </Col>
  )
}

function MyContractBets(props: { contractId: string; bets: Bet[] }) {
  const { contractId, bets } = props

  const contract = useContract(contractId)
  if (contract === 'loading' || contract === null) return <></>

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
    <div className="px-4">
      <Link href={path(contract)}>
        <a>
          <div className="font-medium text-indigo-700 mb-1">
            {contract.question}
          </div>

          <Row className="gap-2 text-gray-500 text-sm">
            <div>
              <UserLink displayName={contract.creatorName} />
            </div>
            {resolution && <div>•</div>}
            <div>
              Resolved {resolution === 'YES' && <YesLabel />}
              {resolution === 'NO' && <NoLabel />}
              {resolution === 'CANCEL' && <CancelLabel />}
            </div>
          </Row>
        </a>
      </Link>

      <Spacer h={6} />

      <Row className="gap-8">
        <Col>
          <div className="text-sm text-gray-500">Total bets</div>
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

      <Spacer h={6} />

      <ContractBetsTable contract={contract} bets={bets} />
    </div>
  )
}

function ContractBetsTable(props: { contract: Contract; bets: Bet[] }) {
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
