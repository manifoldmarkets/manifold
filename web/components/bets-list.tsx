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

export function BetsList(props: { user: User }) {
  const { user } = props
  const bets = useUserBets(user?.id ?? '')

  if (bets === 'loading') {
    return <></>
  }

  if (bets.length === 0) return <div>You have not made any bets yet!</div>

  const contractBets = _.groupBy(bets, 'contractId')

  return (
    <Col className='mt-6 gap-10'>
      {Object.keys(contractBets).map((contractId) => (
        <ContractBets
          key={contractId}
          contractId={contractId}
          bets={contractBets[contractId]}
        />
      ))}
    </Col>
  )
}

function ContractBets(props: { contractId: string; bets: Bet[] }) {
  const { contractId, bets } = props

  const contract = useContract(contractId)
  if (contract === 'loading' || contract === null) return <></>

  return (
    <div>
      <p className="font-medium text-indigo-700 mb-2">{contract.question}</p>
      <ContractDetails contract={contract} />
      <ul role="list" className="grid grid-cols-2 gap-6 lg:grid-cols-4 mt-6">
        {bets.map((bet) => (
          <BetCard key={bet.id} bet={bet} />
        ))}
      </ul>
    </div>
  )
}

function BetCard(props: { bet: Bet }) {
  const { bet } = props
  const { contractId, amount, outcome, createdTime, probBefore, probAfter } =
    bet

  return (
    <Link href={`/contract/${contractId}`}>
      <a>
        <li className="col-span-1 bg-white hover:bg-gray-100 shadow-xl rounded-lg divide-y divide-gray-200">
          <div className="card">
            <div className="card-body p-6">
              <Col className="gap-2">
                <p className="font-medium text-gray-700">
                  {formatMoney(amount)} on {outcome}
                </p>
                <p className="font-medium text-gray-500">
                  {formatPercent(probBefore)} → {formatPercent(probAfter)}
                </p>
                <p className="font-medium text-gray-500">
                  {dayjs(createdTime).format('MMM D, H:mma')}
                </p>
              </Col>
            </div>
          </div>
        </li>
      </a>
    </Link>
  )
}
