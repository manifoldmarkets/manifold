import { memo } from 'react'
import { Bet } from 'common/bet'
import { Contract } from 'common/contract'
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
import { useComments } from 'web/hooks/use-comments'
import { useLiquidity } from 'web/hooks/use-liquidity'
import { useTipTxns } from 'web/hooks/use-tip-txns'
import { capitalize } from 'lodash'
import {
  DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
  HOUSE_LIQUIDITY_PROVIDER_ID,
} from 'common/antes'
import { useIsMobile } from 'web/hooks/use-is-mobile'

export function ContractTabs(props: {
  contract: Contract
  user: User | null | undefined
  bets: Bet[]
  comments: ContractComment[]
}) {
  const { contract, user, bets, comments } = props

  const isMobile = useIsMobile()

  const lps = useLiquidity(contract.id)

  const userBets =
    user && bets.filter((bet) => !bet.isAnte && bet.userId === user.id)
  const visibleBets = bets.filter(
    (bet) => !bet.isAnte && !bet.isRedemption && bet.amount !== 0
  )
  const visibleLps = (lps ?? []).filter(
    (l) =>
      !l.isAnte &&
      l.userId !== HOUSE_LIQUIDITY_PROVIDER_ID &&
      l.userId !== DEV_HOUSE_LIQUIDITY_PROVIDER_ID &&
      l.amount > 0
  )

  const betActivity = lps != null && (
    <ContractBetsActivity
      contract={contract}
      bets={visibleBets}
      lps={visibleLps}
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
    <Tabs
      currentPageForAnalytics={'contract'}
      tabs={[
        {
          title: 'Comments',
          content: (
            <CommentsTabContent contract={contract} comments={comments} />
          ),
        },
        { title: capitalize(PAST_BETS), content: betActivity },
        ...(!user || !userBets?.length
          ? []
          : [
              {
                title: isMobile ? `You` : `Your ${PAST_BETS}`,
                content: yourTrades,
              },
            ]),
      ]}
    />
  )
}

const CommentsTabContent = memo(function CommentsTabContent(props: {
  contract: Contract
  comments: ContractComment[]
}) {
  const { contract, comments } = props
  const tips = useTipTxns({ contractId: contract.id })
  const updatedComments = useComments(contract.id) ?? comments
  if (contract.outcomeType === 'FREE_RESPONSE') {
    return (
      <>
        <FreeResponseContractCommentsActivity
          contract={contract}
          comments={updatedComments}
          tips={tips}
        />
        <Col className="mt-8 flex w-full">
          <div className="text-md mt-8 mb-2 text-left">General Comments</div>
          <div className="mb-4 w-full border-b border-gray-200" />
          <ContractCommentsActivity
            contract={contract}
            comments={updatedComments.filter(
              (comment) =>
                comment.answerOutcome === undefined &&
                comment.betId === undefined
            )}
            tips={tips}
          />
        </Col>
      </>
    )
  } else {
    return (
      <ContractCommentsActivity
        contract={contract}
        comments={comments}
        tips={tips}
      />
    )
  }
})
