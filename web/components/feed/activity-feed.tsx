import _ from 'lodash'
import clsx from 'clsx'

import { Contract, tradingAllowed } from '../../lib/firebase/contracts'
import { Comment } from '../../lib/firebase/comments'
import { Col } from '../layout/col'
import { Bet } from '../../../common/bet'
import { useUser } from '../../hooks/use-user'
import BetRow from '../bet-row'
import { FeedQuestion } from './feed-items'
import { ContractActivity, RecentContractActivity } from './contract-activity'

export function ActivityFeed(props: {
  contracts: Contract[]
  recentBets: Bet[]
  recentComments: Comment[]
  loadBetAndCommentHistory?: boolean
}) {
  const { contracts, recentBets, recentComments, loadBetAndCommentHistory } =
    props

  const user = useUser()

  const groupedBets = _.groupBy(recentBets, (bet) => bet.contractId)
  const groupedComments = _.groupBy(
    recentComments,
    (comment) => comment.contractId
  )

  return (
    <FeedContainer
      contracts={contracts}
      renderContract={(contract) =>
        loadBetAndCommentHistory ? (
          <ContractActivity
            user={user}
            contract={contract}
            bets={groupedBets[contract.id] ?? []}
            comments={groupedComments[contract.id] ?? []}
            abbreviated
          />
        ) : (
          <RecentContractActivity
            user={user}
            contract={contract}
            bets={groupedBets[contract.id] ?? []}
            comments={groupedComments[contract.id] ?? []}
          />
        )
      }
    />
  )
}

export function SummaryActivityFeed(props: { contracts: Contract[] }) {
  const { contracts } = props

  return (
    <FeedContainer
      contracts={contracts}
      renderContract={(contract) => <ContractSummary contract={contract} />}
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

function ContractSummary(props: {
  contract: Contract
  betRowClassName?: string
}) {
  const { contract, betRowClassName } = props
  const { outcomeType } = contract
  const isBinary = outcomeType === 'BINARY'

  return (
    <div className="flow-root pr-2 md:pr-0">
      <div className={clsx(tradingAllowed(contract) ? '' : '-mb-8')}>
        <div className="relative pb-8">
          <div className="relative flex items-start space-x-3">
            <FeedQuestion contract={contract} showDescription />
          </div>
        </div>
      </div>
      {isBinary && tradingAllowed(contract) && (
        <BetRow contract={contract} className={clsx('mb-2', betRowClassName)} />
      )}
    </div>
  )
}
