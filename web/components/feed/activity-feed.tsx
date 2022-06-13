import { Contract } from 'web/lib/firebase/contracts'
import { Comment } from 'web/lib/firebase/comments'
import { Col } from '../layout/col'
import { Bet } from 'common/bet'

export function ActivityFeed(props: {
  feed: {
    contract: Contract
    recentBets: Bet[]
    recentComments: Comment[]
  }[]
  mode: 'only-recent' | 'abbreviated' | 'all'
  getContractPath?: (contract: Contract) => string
}) {
  const {} = props

  return <Col className="gap-2"></Col>
}
