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
import { calculateWinnings, currentValue } from '../lib/calculation/contract'

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

  const betsValue = _.sumBy(bets, (bet) => currentValue(contract, bet))

  const yesWinnings = _.sumBy(bets, (bet) =>
    calculateWinnings(contract, bet, 'YES')
  )
  const noWinnings = _.sumBy(bets, (bet) =>
    calculateWinnings(contract, bet, 'NO')
  )

  return (
    <div className="px-4">
      <Link href={path(contract)}>
        <a>
          <div className="font-medium text-indigo-700 mb-1">
            {contract.question}
          </div>

          <Row className="gap-2 text-gray-500 text-sm">
            <div>By {contract.creatorName}</div>
            {resolution && <div>•</div>}
            {resolution === 'YES' && (
              <div className="text-primary">Resolved YES</div>
            )}
            {resolution === 'NO' && (
              <div className="text-red-400">Resolved NO</div>
            )}
            {resolution === 'CANCEL' && (
              <div className="text-yellow-400">Resolved CANCEL</div>
            )}
          </Row>
        </a>
      </Link>

      <Spacer h={6} />

      <Row className="gap-8 ">
        <Col>
          <div className="text-sm text-gray-500">Total bets</div>
          <div className="">{formatMoney(betsTotal)}</div>
        </Col>
        {resolution ? (
          <>
            <Col>
              <div className="text-sm text-gray-500">Winnings</div>
              <div className="">{formatMoney(yesWinnings)}</div>
            </Col>
          </>
        ) : (
          <>
            {/* <Col>
              <div className="text-sm text-gray-500">Current value</div>
              <div className="">{formatMoney(betsValue)}</div>
            </Col> */}
            <Col>
              <div className="text-sm text-primary">If YES</div>
              <div className="">{formatMoney(yesWinnings)}</div>
            </Col>
            <Col>
              <div className="text-sm text-red-400">If NO</div>
              <div className="">{formatMoney(noWinnings)}</div>
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

  return (
    <div className="overflow-x-auto">
      <table className="table table-zebra table-compact text-gray-500 w-full">
        <thead>
          <tr className="p-2">
            <th>Date</th>
            <th>Outcome</th>
            <th>Bet</th>
            <th>Probability</th>
            <th>Est. max payout</th>
            <th>Current value</th>
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

  return (
    <tr>
      <td>{dayjs(createdTime).format('MMM D, H:mma')}</td>
      <td>{outcome}</td>
      <td>{formatMoney(amount)}</td>
      <td>
        {formatPercent(probBefore)} → {formatPercent(probAfter)}
      </td>
      <td>{formatMoney(amount + dpmWeight)}</td>
      <td>{formatMoney(currentValue(contract, bet))}</td>
    </tr>
  )
}
