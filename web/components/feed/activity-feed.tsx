import { Contract } from 'web/lib/firebase/contracts'
import { Comment } from 'web/lib/firebase/comments'
import { Col } from '../layout/col'
import { Bet } from 'common/bet'
import { useUser } from 'web/hooks/use-user'
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
    <Col className="gap-2">
      {feed.map((item) => (
        <ContractActivity
          key={item.contract.id}
          className="rounded-md bg-white dark:bg-black py-6 px-2 sm:px-4"
          user={user}
          contract={item.contract}
          bets={item.recentBets}
          comments={item.recentComments}
          mode={mode}
          contractPath={
            getContractPath ? getContractPath(item.contract) : undefined
          }
        />
      ))}
    </Col>
  )
}
