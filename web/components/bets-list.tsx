import Link from 'next/link'
import _ from 'lodash'
import dayjs from 'dayjs'
import { useContract } from '../hooks/use-contract'
import { useUserBets } from '../hooks/use-user-bets'
import { Bet } from '../lib/firebase/bets'
import { User } from '../lib/firebase/users'
import { formatMoney, formatPercent } from '../lib/util/format'
import { Col } from './layout/col'
import { ContractDetails } from './contracts-list'
import { Spacer } from './layout/spacer'

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
        <ContractBetsTable
          key={contractId}
          contractId={contractId}
          bets={contractBets[contractId]}
        />
      ))}
    </Col>
  )
}

function ContractBetsTable(props: { contractId: string; bets: Bet[] }) {
  const { contractId, bets } = props

  const contract = useContract(contractId)
  if (contract === 'loading' || contract === null) return <></>

  return (
    <div className="px-4">
      <Link href={`/contract/${contractId}`}>
        <a>
          <p className="font-medium text-indigo-700 mb-2">
            {contract.question}
          </p>
          <ContractDetails contract={contract} />
        </a>
      </Link>
      <Spacer h={4} />
      <div className="overflow-x-auto">
        <table className="table table-zebra table-compact text-gray-500 w-full">
          <thead>
            <tr className="p-2">
              <th>Outcome</th>
              <th>Amount</th>
              <th>Probability</th>
              <th>Estimated payoff</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {bets.map((bet) => (
              <BetRow key={bet.id} bet={bet} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function BetRow(props: { bet: Bet }) {
  const { bet } = props
  const { amount, outcome, createdTime, probBefore, probAfter, dpmWeight } = bet

  return (
    <tr>
      <td>{outcome}</td>
      <td>{formatMoney(amount)}</td>
      <td>
        {formatPercent(probBefore)} → {formatPercent(probAfter)}
      </td>
      <td>{formatMoney(amount + dpmWeight)}</td>
      <td>{dayjs(createdTime).format('MMM D, H:mma')}</td>
    </tr>
  )
}
