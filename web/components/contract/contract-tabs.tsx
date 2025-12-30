import { useState } from 'react'

import { Answer } from 'common/answer'
import { DisplayUser } from 'common/api/user-types'
import { Bet } from 'common/bet'
import { ContractComment } from 'common/comment'
import { BinaryContract, Contract } from 'common/contract'
import { buildArray } from 'common/util/array'
import { maybePluralize, shortFormatNumber } from 'common/util/format'
import { BetsTabContent } from 'web/components/contract/bets-tab-content'
import { CommentsTabContent } from 'web/components/contract/comments-tab-content'
import { UserPositionsTable } from 'web/components/contract/user-positions-table'
import { useHashInUrlPageRouter } from 'web/hooks/use-hash-in-url-page-router'
import { track } from 'web/lib/service/analytics'
import { Col } from '../layout/col'
import { ControlledTabs } from '../layout/tabs'

export function ContractTabs(props: {
  staticContract: Contract
  liveContract: Contract
  bets: Bet[]
  comments: ContractComment[]
  replyTo?: Answer | Bet
  setReplyTo?: (replyTo?: Answer | Bet) => void
  cancelReplyToAnswer?: () => void
  blockedUserIds: string[]
  activeIndex: number
  setActiveIndex: (i: number) => void
  totalBets: number
  totalPositions: number
  pinnedComments: ContractComment[]
  totalComments: number
  setGraphUser?: (user: DisplayUser | undefined) => void
  setHideGraph?: (hide: boolean) => void
}) {
  const {
    staticContract,
    liveContract,
    comments,
    bets,
    replyTo,
    setReplyTo,
    blockedUserIds,
    activeIndex,
    setActiveIndex,
    totalBets,
    pinnedComments,
    setGraphUser,
    setHideGraph,
  } = props

  const highlightedCommentId = useHashInUrlPageRouter('')

  const [totalPositions, setTotalPositions] = useState(props.totalPositions)
  const [totalComments, setTotalComments] = useState(props.totalComments)

  const commentsTitle =
    (totalComments > 0 ? `${shortFormatNumber(totalComments)} ` : '') +
    maybePluralize('Comment', totalComments)

  const tradesTitle =
    (totalBets > 0 ? `${shortFormatNumber(totalBets)} ` : '') +
    maybePluralize('Trade', totalBets)

  const positionsTitle =
    (totalPositions > 0 ? `${shortFormatNumber(totalPositions)} ` : '') +
    maybePluralize('Holder', totalPositions)

  return (
    <ControlledTabs
      labelClassName="!text-base"
      className="mb-4"
      activeIndex={activeIndex}
      onClick={(title, i) => {
        setActiveIndex(i)
        track(
          `click ${
            title === commentsTitle
              ? 'comments'
              : title === tradesTitle
              ? 'trades'
              : title === positionsTitle
              ? 'positions'
              : 'contract'
          } tab`
        )
      }}
      tabs={buildArray(
        {
          title: commentsTitle,
          content: (
            <CommentsTabContent
              staticContract={staticContract}
              liveContract={liveContract}
              comments={comments}
              pinnedComments={pinnedComments}
              setTotalComments={setTotalComments}
              totalComments={totalComments}
              blockedUserIds={blockedUserIds}
              replyTo={replyTo}
              clearReply={() => setReplyTo?.(undefined)}
              className="-ml-2 -mr-1"
              highlightCommentId={highlightedCommentId}
            />
          ),
        },
        totalBets > 0 &&
          (liveContract.mechanism === 'cpmm-1' ||
            liveContract.mechanism === 'cpmm-multi-1') && {
            title: positionsTitle,
            content: (
              <UserPositionsTable
                key={liveContract.id}
                contract={liveContract as BinaryContract}
                setTotalPositions={setTotalPositions}
                setGraphUser={setGraphUser}
                setHideGraph={setHideGraph}
              />
            ),
          },
        totalBets > 0 && {
          title: tradesTitle,
          content: (
            <Col className={'gap-4'}>
              <BetsTabContent
                key={liveContract.id}
                contract={liveContract}
                bets={bets}
                totalBets={totalBets}
                setReplyToBet={setReplyTo}
                setGraphUser={setGraphUser}
                setHideGraph={setHideGraph}
              />
            </Col>
          ),
        }
      )}
    />
  )
}
