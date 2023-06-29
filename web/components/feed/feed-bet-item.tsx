//TODO: we can't yet respond to summarized bets yet bc we're just combining bets in the feed and

import { Bet } from 'common/bet'
import { Contract, contractPath } from 'common/contract'
import { Row } from '../layout/row'
import { SummarizeBets } from './feed-bets'
import { FeedRelatedItemFrame } from './feed-timeline-items'

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
    // TODO: make more specific link
    <FeedRelatedItemFrame className="bg-canvas-0" href={contractPath(contract)}>
      {groupedBets.map((bets) => (
        <Row className={'relative w-full py-2'} key={bets[0].id + 'summary'}>
          <SummarizeBets
            betsBySameUser={bets}
            contract={contract}
            avatarSize={'md'}
            inTimeline={true}
          />
        </Row>
      ))}
    </FeedRelatedItemFrame>
  )
}
