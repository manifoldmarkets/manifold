import { Bet } from 'common/bet'
import { Contract, CPMMBinaryContract } from 'common/contract'
import { ContractComment } from 'common/comment'
import { PAST_BETS, User } from 'common/user'
import {
  ContractCommentsActivity,
  ContractBetsActivity,
  FreeResponseContractCommentsActivity,
} from '../feed/contract-activity'
import { ContractBetsTable, BetsSummary } from '../bets-list'
import { Spacer } from '../layout/spacer'
import { Tabs } from '../layout/tabs'
import { Col } from '../layout/col'
import { tradingAllowed } from 'web/lib/firebase/contracts'
import { CommentTipMap } from 'web/hooks/use-tip-txns'
import { useComments } from 'web/hooks/use-comments'
import { useLiquidity } from 'web/hooks/use-liquidity'
import { BetSignUpPrompt } from '../sign-up-prompt'
import { PlayMoneyDisclaimer } from '../play-money-disclaimer'
import BetButton from '../bet-button'
import { capitalize } from 'lodash'

export function ContractTabs(props: {
  contract: Contract
  user: User | null | undefined
  bets: Bet[]
  comments: ContractComment[]
  tips: CommentTipMap
}) {
  const { contract, user, bets, tips } = props
  const { outcomeType } = contract

  const lps = useLiquidity(contract.id)

  const userBets =
    user && bets.filter((bet) => !bet.isAnte && bet.userId === user.id)
  const visibleBets = bets.filter(
    (bet) => !bet.isAnte && !bet.isRedemption && bet.amount !== 0
  )
  const visibleLps = lps?.filter((l) => !l.isAnte && l.amount > 0)

  // Load comments here, so the badge count will be correct
  const updatedComments = useComments(contract.id)
  const comments = updatedComments ?? props.comments

  const betActivity = visibleLps && (
    <ContractBetsActivity
      contract={contract}
      bets={visibleBets}
      lps={visibleLps}
    />
  )

  const generalBets = outcomeType === 'FREE_RESPONSE' ? [] : visibleBets
  const generalComments = comments.filter(
    (comment) =>
      comment.answerOutcome === undefined &&
      (outcomeType === 'FREE_RESPONSE' ? comment.betId === undefined : true)
  )

  const commentActivity =
    outcomeType === 'FREE_RESPONSE' ? (
      <>
        <FreeResponseContractCommentsActivity
          contract={contract}
          bets={visibleBets}
          comments={comments}
          tips={tips}
          user={user}
        />
        <Col className={'mt-8 flex w-full '}>
          <div className={'text-md mt-8 mb-2 text-left'}>General Comments</div>
          <div className={'mb-4 w-full border-b border-gray-200'} />
          <ContractCommentsActivity
            contract={contract}
            bets={generalBets}
            comments={generalComments}
            tips={tips}
            user={user}
          />
        </Col>
      </>
    ) : (
      <ContractCommentsActivity
        contract={contract}
        bets={visibleBets}
        comments={comments}
        tips={tips}
        user={user}
      />
    )

  const yourTrades = (
    <div>
      <BetsSummary
        className="px-2"
        contract={contract}
        bets={userBets ?? []}
        isYourBets
      />
      <Spacer h={6} />
      <ContractBetsTable contract={contract} bets={userBets ?? []} isYourBets />
      <Spacer h={12} />
    </div>
  )

  return (
    <>
      <Tabs
        currentPageForAnalytics={'contract'}
        tabs={[
          {
            title: 'Comments',
            content: commentActivity,
            badge: `${comments.length}`,
          },
          {
            title: capitalize(PAST_BETS),
            content: betActivity,
            badge: `${visibleBets.length}`,
          },
          ...(!user || !userBets?.length
            ? []
            : [{ title: `Your ${PAST_BETS}`, content: yourTrades }]),
        ]}
      />
      {!user ? (
        <Col className="mt-4 max-w-sm items-center xl:hidden">
          <BetSignUpPrompt />
          <PlayMoneyDisclaimer />
        </Col>
      ) : (
        outcomeType === 'BINARY' &&
        tradingAllowed(contract) && (
          <BetButton
            contract={contract as CPMMBinaryContract}
            className="mb-2 !mt-0 xl:hidden"
          />
        )
      )}
    </>
  )
}
