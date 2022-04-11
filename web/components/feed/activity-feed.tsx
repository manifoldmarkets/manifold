import _ from 'lodash'

import { Contract } from '../../lib/firebase/contracts'
import { Comment } from '../../lib/firebase/comments'
import { Col } from '../layout/col'
import { Bet } from '../../../common/bet'
import { useUser } from '../../hooks/use-user'
import { ContractActivity } from './contract-activity'

export function ActivityFeed(props: {
  contracts: Contract[]
  recentBets: Bet[]
  recentComments: Comment[]
  mode: 'only-recent' | 'abbreviated' | 'all'
  getContractPath?: (contract: Contract) => string
}) {
  const { contracts, recentBets, recentComments, mode, getContractPath } = props

  const user = useUser()

  const groupedBets = _.groupBy(recentBets, (bet) => bet.contractId)
  const groupedComments = _.groupBy(
    recentComments,
    (comment) => comment.contractId
  )

  return (
    <FeedContainer
      contracts={contracts}
      renderContract={(contract) => (
        <ContractActivity
          user={user}
          contract={contract}
          bets={groupedBets[contract.id] ?? []}
          comments={groupedComments[contract.id] ?? []}
          mode={mode}
          contractPath={getContractPath ? getContractPath(contract) : undefined}
        />
      )}
    />
  )
}

function FeedContainer(props: {
  contracts: Contract[]
  renderContract: (contract: Contract) => any
}) {
  const { contracts, renderContract } = props

  return (
    <Col className="items-center">
      <Col className="w-full max-w-3xl">
        <Col className="w-full divide-y divide-gray-300 self-center bg-white">
          {contracts.map((contract) => (
            <div key={contract.id} className="py-6 px-2 sm:px-4">
              {renderContract(contract)}
            </div>
          ))}
        </Col>
      </Col>
    </Col>
  )
}
