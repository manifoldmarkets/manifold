import clsx from 'clsx'
import Link from 'next/link'
import { memo } from 'react'

import { Bet } from 'common/bet'
import { ContractComment } from 'common/comment'
import { Contract, contractPath, MarketContract } from 'common/contract'
import { formatMoney } from 'common/util/format'
import { richTextToString } from 'common/util/parse'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Avatar } from 'web/components/widgets/avatar'
import { RelativeTimestamp } from 'web/components/relative-timestamp'
import { UserHovercard } from 'web/components/user/user-hovercard'
import { useDisplayUserById } from 'web/hooks/use-user-supabase'

export const CardActivitySection = memo(function CardActivitySection(props: {
  contract: Contract
  bets?: Bet[]
  comments?: ContractComment[]
  className?: string
}) {
  const { contract, bets, comments, className } = props

  const hasBets = bets && bets.length > 0
  const hasComments = comments && comments.length > 0

  if (!hasBets && !hasComments) return null

  return (
    <Col
      className={clsx(
        'border-ink-200 mt-2 gap-1 border-t pt-2',
        className
      )}
    >
      <Row className="text-ink-500 mb-1 items-center gap-1 text-xs font-medium">
        Recent activity
      </Row>
      <Col className="gap-1.5">
        {bets?.slice(0, 3).map((bet) => (
          <ActivityBetRow
            key={bet.id}
            bet={bet}
            contract={contract as MarketContract}
          />
        ))}
        {comments?.slice(0, 2).map((comment) => (
          <ActivityCommentRow
            key={comment.id}
            comment={comment}
            contract={contract}
          />
        ))}
      </Col>
      {((bets?.length ?? 0) > 3 || (comments?.length ?? 0) > 2) && (
        <Link
          href={contractPath(contract)}
          className="text-primary-600 hover:text-primary-700 mt-1 text-xs"
          onClick={(e) => e.stopPropagation()}
        >
          View all activity
        </Link>
      )}
    </Col>
  )
})

const ActivityBetRow = memo(function ActivityBetRow(props: {
  bet: Bet
  contract: MarketContract
}) {
  const { bet, contract } = props
  const { oddsType } = contract
  const user = useDisplayUserById(bet.userId)

  const isYes = bet.outcome === 'YES'
  const amount = Math.abs(bet.amount)
  const isCashContract = contract.token === 'CASH'

  // Get outcome text
  let outcomeText = bet.outcome
  if (oddsType === 'numeric') {
    outcomeText = `${bet.outcome}`
  } else if (contract.outcomeType === 'MULTIPLE_CHOICE' && bet.answerId) {
    const answer = contract.answers?.find((a) => a.id === bet.answerId)
    outcomeText = answer?.text ?? bet.outcome
  }

  return (
    <Row className="text-ink-600 items-center gap-1.5 text-sm">
      <UserHovercard userId={bet.userId}>
        <Avatar
          avatarUrl={user?.avatarUrl}
          username={user?.username}
          size="2xs"
          entitlements={user?.entitlements}
          displayContext="activity"
        />
      </UserHovercard>
      <span className="text-ink-700 font-medium">
        {user?.name ?? 'Someone'}
      </span>
      <span>bet</span>
      <span className="font-semibold">
        {formatMoney(amount, isCashContract ? 'CASH' : 'mana')}
      </span>
      <span
        className={clsx(
          'font-semibold',
          isYes ? 'text-teal-600' : 'text-scarlet-600'
        )}
      >
        {outcomeText}
      </span>
      <RelativeTimestamp
        time={bet.createdTime}
        shortened
        className="text-ink-400 ml-auto text-xs"
      />
    </Row>
  )
})

const ActivityCommentRow = memo(function ActivityCommentRow(props: {
  comment: ContractComment
  contract: Contract
}) {
  const { comment, contract } = props
  const user = useDisplayUserById(comment.userId)

  const commentText = richTextToString(comment.content)
  const truncatedText =
    commentText.length > 80 ? commentText.slice(0, 80) + '...' : commentText

  return (
    <Row className="text-ink-600 items-start gap-1.5 text-sm">
      <UserHovercard userId={comment.userId}>
        <Avatar
          avatarUrl={user?.avatarUrl ?? comment.userAvatarUrl}
          username={user?.username ?? comment.userUsername}
          size="2xs"
          entitlements={user?.entitlements}
          displayContext="activity"
        />
      </UserHovercard>
      <Col className="min-w-0 flex-1">
        <Row className="items-center gap-1">
          <span className="text-ink-700 font-medium">
            {user?.name ?? comment.userName}
          </span>
          <RelativeTimestamp
            time={comment.createdTime}
            shortened
            className="text-ink-400 text-xs"
          />
        </Row>
        <Link
          href={`${contractPath(contract)}#${comment.id}`}
          className="text-ink-500 hover:text-ink-700 line-clamp-2 text-xs"
          onClick={(e) => e.stopPropagation()}
        >
          {truncatedText}
        </Link>
      </Col>
    </Row>
  )
})
