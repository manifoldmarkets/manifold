import { Bet } from 'common/bet'
import { Contract, contractPath } from 'common/contract'
import { Row } from '../layout/row'
import { SummarizeBets } from './feed-bets'
import { ClickFrame } from '../widgets/click-frame'
import { useRouter } from 'next/router'

// not combining bet amounts on the backend (where the values are filled in on the comment)
export const FeedBetsItem = (props: {
  contract: Contract
  groupedBets: Bet[][]
}) => {
  const { contract, groupedBets } = props

  const router = useRouter()

  if (!groupedBets || groupedBets.length === 0) {
    return <></>
  }
  return (
    <ClickFrame
      className="bg-canvas-0 mb-2 flex flex-col"
      onClick={() => router.push(contractPath(contract))}
    >
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
    </ClickFrame>
  )
}
