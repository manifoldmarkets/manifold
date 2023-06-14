//TODO: we can't yet respond to summarized bets yet bc we're just combining bets in the feed and

import { Bet } from 'common/bet'
import { Contract } from 'common/contract'
import { FeedRelatedItemFrame } from './feed-timeline-items'
import { Row } from '../layout/row'
import { SummarizeBets } from './feed-bets'
import { Avatar } from '../widgets/avatar'

// not combining bet amounts on the backend (where the values are filled in on the comment)
export const FeedBetsItem = (props: {
  contract: Contract
  groupedBets: Bet[][]
}) => {
  const { contract, groupedBets } = props
  if (!groupedBets || groupedBets.length === 0) {
    return <></>
  }
  return (
    <FeedRelatedItemFrame>
      {groupedBets.map((bets, index) => (
        <Row
          className={'relative w-full px-4 py-2'}
          key={bets[0].id + 'summary'}
        >
          <SummarizeBets
            betsBySameUser={bets}
            contract={contract}
            avatarSize={'md'}
          />
        </Row>
      ))}
    </FeedRelatedItemFrame>
  )
}
