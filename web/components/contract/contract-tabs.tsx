import { Bet } from 'common/bet'
import { Contract } from 'common/contract'
import { Comment } from 'web/lib/firebase/comments'
import { User } from 'common/user'
import { useBets } from '../../hooks/use-bets'
import { ContractActivity } from '../feed/contract-activity'
import { ContractBetsTable, MyBetsSummary } from '../bets-list'
import { Spacer } from '../layout/spacer'
import { Tabs } from '../layout/tabs'
import { Col } from '../layout/col'

export function ContractTabs(props: {
  contract: Contract
  user: User | null | undefined
  bets: Bet[]
  comments: Comment[]
}) {
  const { contract, user, comments } = props

  const bets = useBets(contract.id) ?? props.bets
  // Decending creation time.
  bets.sort((bet1, bet2) => bet2.createdTime - bet1.createdTime)
  const userBets = user && bets.filter((bet) => bet.userId === user.id)

  const betActivity = (
    <ContractActivity
      contract={contract}
      bets={bets}
      comments={comments}
      user={user}
      mode="bets"
      betRowClassName="!mt-0 xl:hidden"
    />
  )

  const commentActivity = (
    <>
      <ContractActivity
        contract={contract}
        bets={bets}
        comments={comments}
        user={user}
        mode={
          contract.outcomeType === 'FREE_RESPONSE'
            ? 'free-response-comment-answer-groups'
            : 'comments'
        }
        betRowClassName="!mt-0 xl:hidden"
      />
      {contract.outcomeType === 'FREE_RESPONSE' && (
        <Col className={'mt-8 flex w-full '}>
          <div className={'text-md mt-8 mb-2 text-left'}>General Comments</div>
          <div className={'mb-4 w-full border-b border-gray-200'} />
          <ContractActivity
            contract={contract}
            bets={bets}
            comments={comments}
            user={user}
            mode={'comments'}
            betRowClassName="!mt-0 xl:hidden"
          />
        </Col>
      )}
    </>
  )

  const yourTrades = (
    <div>
      <MyBetsSummary
        className="px-2"
        contract={contract}
        bets={userBets ?? []}
      />
      <Spacer h={6} />
      <ContractBetsTable contract={contract} bets={userBets ?? []} />
      <Spacer h={12} />
    </div>
  )

  return (
    <Tabs
      tabs={[
        { title: 'Comments', content: commentActivity },
        { title: 'Bets', content: betActivity },
        ...(!user || !userBets?.length
          ? []
          : [{ title: 'Your bets', content: yourTrades }]),
      ]}
    />
  )
}
