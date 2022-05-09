import _ from 'lodash'

import { Contract } from 'web/lib/firebase/contracts'
import { Comment } from 'web/lib/firebase/comments'
import { Col } from '../layout/col'
import { Bet } from 'common/bet'
import { useUser } from '../../hooks/use-user'
import { ContractActivity } from './contract-activity'

export function ActivityFeed(props: {
  feed: {
    contract: Contract
    recentBets: Bet[]
    recentComments: Comment[]
  }[]
  mode: 'only-recent' | 'abbreviated' | 'all'
  getContractPath?: (contract: Contract) => string
}) {
  const { feed, mode, getContractPath } = props

  const user = useUser()

  return (
    <FeedContainer
      feed={feed}
      renderItem={({ contract, recentBets, recentComments }) => (
        <ContractActivity
          user={user}
          contract={contract}
          bets={recentBets}
          comments={recentComments}
          mode={mode}
          contractPath={getContractPath ? getContractPath(contract) : undefined}
        />
      )}
    />
  )
}

function FeedContainer(props: {
  feed: {
    contract: Contract
    recentBets: Bet[]
    recentComments: Comment[]
  }[]
  renderItem: (item: {
    contract: Contract
    recentBets: Bet[]
    recentComments: Comment[]
  }) => any
}) {
  const { feed, renderItem } = props

  return (
    <Col className="items-center">
      <Col className="w-full max-w-3xl">
        <Col className="w-full divide-y divide-gray-300 self-center bg-white">
          {feed.map((item) => (
            <div key={item.contract.id} className="py-6 px-2 sm:px-4">
              {renderItem(item)}
            </div>
          ))}
        </Col>
      </Col>
    </Col>
  )
}
