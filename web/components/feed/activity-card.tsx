import clsx from 'clsx'
import Link from 'next/link'
import Router from 'next/router'
import { useRouter } from 'next/router'
import { memo } from 'react'
import { groupBy, orderBy } from 'lodash'
import { TbDroplet, TbMoneybag } from 'react-icons/tb'

import { Bet } from 'common/bet'
import { CommentWithTotalReplies, ContractComment } from 'common/comment'
import {
  BinaryContract,
  Contract,
  contractPath,
  CPMMMultiContract,
  CPMMNumericContract,
  PollContract,
} from 'common/contract'
import { ENV_CONFIG } from 'common/envs/constants'
import { PrivateUser, User } from 'common/user'
import { formatWithToken, shortFormatNumber } from 'common/util/format'
import { removeEmojis } from 'common/util/string'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import {
  ContractStatusLabel,
  VisibilityIcon,
} from 'web/components/contract/contracts-table'
import { YourMetricsFooter } from 'web/components/contract/feed-contract-card'
import { useSavedContractMetrics } from 'web/hooks/use-saved-contract-metrics'
import { usePrivateUser } from 'web/hooks/use-user'
import { RelativeTimestamp } from 'web/components/relative-timestamp'
import { Avatar } from 'web/components/widgets/avatar'
import { MoneyDisplay } from 'web/components/bet/money-display'
import { Button } from 'web/components/buttons/button'
import { Content } from 'web/components/widgets/editor'
import { Tooltip } from 'web/components/widgets/tooltip'
import { UserLink } from 'web/components/widgets/user-link'
import { UserHovercard } from 'web/components/user/user-hovercard'
import { LikeAndDislikeComment } from 'web/components/comments/comment-actions'
import { useDisplayUserById } from 'web/hooks/use-user-supabase'
import { ClickFrame } from 'web/components/widgets/click-frame'
import { track } from 'web/lib/service/analytics'
import { BetButton } from 'web/components/bet/feed-bet-button'
import { NumericBetButton } from 'web/components/bet/numeric-bet-button'
import { SimpleAnswerBars } from 'web/components/answers/answers-panel'
import { PollPanel } from 'web/components/poll/poll-panel'
import { TradesButton } from 'web/components/contract/trades-button'
import { ReactButton } from 'web/components/contract/react-button'
import { RepostButton } from 'web/components/comments/repost-modal'

export type ActivityItem = {
  type: 'bet' | 'comment' | 'market'
  id: string
  contractId: string
  createdTime: number
  data: Bet | CommentWithTotalReplies | Contract
}

export type ActivityGroup = {
  contractId: string
  contract: Contract
  items: ActivityItem[]
  latestTime: number
}

export const ActivityCard = memo(function ActivityCard(props: {
  group: ActivityGroup
  user: User | null | undefined
}) {
  const { group, user } = props
  const { contract, items } = group
  const privateUser = usePrivateUser()
  const router = useRouter()
  const position = useSavedContractMetrics(contract)
  const path = contractPath(contract)

  // Separate comments and group replies
  const commentItems = items.filter((item) => item.type === 'comment')
  const comments = commentItems.map(
    (item) => item.data as CommentWithTotalReplies
  )
  const replies = comments.filter((c) => !!c.replyToCommentId)
  const repliesByParentId = groupBy(
    orderBy(replies, 'createdTime', 'asc'),
    'replyToCommentId'
  )

  // Filter items to show (exclude replies from main list)
  const displayItems = orderBy(
    items.filter((item) => {
      if (item.type === 'comment') {
        const comment = item.data as CommentWithTotalReplies
        return !comment.replyToCommentId
      }
      return true
    }),
    'createdTime',
    'desc'
  )

  const trackClick = () =>
    track('click activity card', {
      contractId: contract.id,
      creatorId: contract.creatorId,
      slug: contract.slug,
    })

  return (
    <ClickFrame
      className={clsx(
        'ring-primary-200 hover:ring-1',
        'relative cursor-pointer rounded-xl transition-all',
        'flex w-full flex-col gap-0.5 px-4 py-2',
        'bg-canvas-0 dark:bg-canvas-50 dark:border-canvas-50 hover:border-primary-300 gap-2 rounded-lg border shadow-md transition-colors'
      )}
      onClick={(e) => {
        trackClick()
        Router.push(path)
        e.currentTarget.focus()
      }}
    >
      {/* Contract header - similar to FeedContractCard */}
      <Col className="w-full gap-1.5 pt-2">
        <Row className="w-full justify-between">
          <UserHovercard userId={contract.creatorId}>
            <Row className={'text-ink-500 items-center gap-1 text-sm'}>
              <Avatar
                size="xs"
                className={'mr-0.5'}
                avatarUrl={contract.creatorAvatarUrl}
                username={contract.creatorUsername}
              />
              <UserLink
                user={{
                  id: contract.creatorId,
                  name: contract.creatorName,
                  username: contract.creatorUsername,
                }}
                className={
                  'w-full max-w-[10rem] text-ellipsis sm:max-w-[12rem]'
                }
              />
            </Row>
          </UserHovercard>
          <Row className="text-ink-400 items-center gap-1 text-xs">
            <span className="bg-primary-100 text-primary-700 rounded-full px-2 py-0.5 text-xs font-medium">
              Activity
            </span>
          </Row>
        </Row>

        {/* Market question */}
        <Link
          className="hover:text-primary-700 grow items-start font-medium transition-colors sm:text-lg"
          href={path}
          onClick={(e) => {
            e.stopPropagation()
            trackClick()
          }}
        >
          <VisibilityIcon contract={contract} />{' '}
          {removeEmojis(contract.question)}
        </Link>

        {/* Probability and bet buttons for binary markets */}
        {contract.outcomeType === 'BINARY' && (
          <Row className="items-center justify-between">
            <ContractStatusLabel
              className="text-lg font-bold"
              contract={contract}
              chanceLabel
            />
            {!contract.isResolved &&
              contract.closeTime &&
              contract.closeTime > Date.now() && (
                <div onClick={(e) => e.stopPropagation()}>
                  <BetButton
                    contract={contract as BinaryContract}
                    user={user}
                    className="h-min"
                  />
                </div>
              )}
          </Row>
        )}

        {/* Answer bars for multiple choice markets */}
        {contract.outcomeType === 'MULTIPLE_CHOICE' &&
          contract.mechanism === 'cpmm-multi-1' && (
            <div onClick={(e) => e.stopPropagation()} className="mt-2">
              <SimpleAnswerBars
                contract={contract as CPMMMultiContract}
                maxAnswers={5}
              />
            </div>
          )}

        {/* Poll options */}
        {contract.outcomeType === 'POLL' && (
          <div onClick={(e) => e.stopPropagation()} className="mt-2">
            <PollPanel contract={contract as PollContract} maxOptions={5} />
          </div>
        )}

        {/* Numeric markets - show Lower/Higher buttons */}
        {contract.outcomeType === 'NUMBER' && (
          <Row className="mt-2 items-center justify-between">
            <ContractStatusLabel
              className="text-lg font-bold"
              contract={contract}
            />
            {!contract.isResolved &&
              contract.closeTime &&
              contract.closeTime > Date.now() && (
                <div onClick={(e) => e.stopPropagation()}>
                  <NumericBetButton
                    contract={contract as CPMMNumericContract}
                    user={user}
                  />
                </div>
              )}
          </Row>
        )}
      </Col>

      {/* Bottom action row */}
      <Row
        className="justify-between pb-2 pt-2"
        onClick={(e) => e.stopPropagation()}
      >
        <BottomRowButtonWrapper>
          <TradesButton contract={contract} className={'h-full'} />
        </BottomRowButtonWrapper>

        {contract.outcomeType === 'BOUNTIED_QUESTION' && (
          <BottomRowButtonWrapper>
            <div className="text-ink-500 z-10 flex items-center gap-1.5 text-sm">
              <TbMoneybag className="h-6 w-6 stroke-2" />
              <div>
                {ENV_CONFIG.moneyMoniker}
                {shortFormatNumber(contract.bountyLeft)}
              </div>
            </div>
          </BottomRowButtonWrapper>
        )}

        {'totalLiquidity' in contract && (
          <BottomRowButtonWrapper>
            <Button
              disabled={true}
              size={'2xs'}
              color={'gray-white'}
              className={'disabled:cursor-pointer'}
            >
              <Tooltip text={`Total liquidity`} placement="top" noTap>
                <Row
                  className={'text-ink-500 h-full items-center gap-1.5 text-sm'}
                >
                  <TbDroplet className="h-6 w-6 stroke-2" />
                  <div className="text-ink-600">
                    {formatWithToken({
                      amount: contract.totalLiquidity,
                      token: contract.token === 'CASH' ? 'CASH' : 'M$',
                      short: true,
                    })}
                  </div>
                </Row>
              </Tooltip>
            </Button>
          </BottomRowButtonWrapper>
        )}

        <BottomRowButtonWrapper>
          <RepostButton
            playContract={contract}
            size={'2xs'}
            className={'h-full'}
            iconClassName={'text-ink-500'}
          />
        </BottomRowButtonWrapper>
        <BottomRowButtonWrapper>
          <ReactButton
            contentId={contract.id}
            contentCreatorId={contract.creatorId}
            user={user}
            contentType={'contract'}
            contentText={contract.question}
            size={'xs'}
            trackingLocation={'activity card'}
            placement="top"
            contractId={contract.id}
            heartClassName="stroke-ink-500"
          />
        </BottomRowButtonWrapper>
      </Row>

      {/* Activity section */}
      <Col className="border-ink-200 mt-1 gap-1 border-t pt-2">
        <div className="space-y-1">
          {displayItems.slice(0, 4).map((item) => {
            if (item.type === 'bet') {
              return (
                <BetLog
                  key={`${item.id}-bet`}
                  contract={contract}
                  bet={item.data as Bet}
                />
              )
            } else if (item.type === 'market') {
              return (
                <MarketCreatedLog
                  key={`${item.id}-market`}
                  contract={item.data as Contract}
                />
              )
            } else if (item.type === 'comment') {
              const comment = item.data as CommentWithTotalReplies
              const childReplies = repliesByParentId[comment.id] ?? []
              const hiddenRepliesCount =
                (comment.totalReplies ?? 0) - childReplies.length

              return (
                <div key={`${comment.id}-comment`}>
                  <CommentLog
                    comment={comment}
                    privateUser={privateUser}
                    user={user}
                    router={router}
                    hiddenReplies={hiddenRepliesCount}
                  />

                  {childReplies.length > 0 && (
                    <Col className="ml-6 space-y-1 pl-2">
                      {childReplies.slice(0, 2).map((reply) => (
                        <CommentLog
                          key={`${reply.id}-reply`}
                          comment={reply}
                          privateUser={privateUser}
                          user={user}
                          router={router}
                          isReply={true}
                        />
                      ))}
                    </Col>
                  )}
                </div>
              )
            }
            return null
          })}
        </div>
        {displayItems.length > 4 && (
          <Link
            href={path}
            className="text-primary-600 hover:text-primary-700 mt-1 text-xs"
            onClick={(e) => e.stopPropagation()}
          >
            View {displayItems.length - 4} more...
          </Link>
        )}
      </Col>

      {/* Position footer */}
      {contract.outcomeType === 'BINARY' && position && position.hasShares && (
        <YourMetricsFooter
          metrics={position}
          isCashContract={contract.token === 'CASH'}
        />
      )}
    </ClickFrame>
  )
})

const BetLog = memo(function BetLog(props: { bet: Bet; contract: Contract }) {
  const { bet, contract } = props
  const {
    amount,
    outcome,
    createdTime,
    answerId,
    userId,
    probBefore,
    probAfter,
  } = bet
  const bettor = useDisplayUserById(userId)
  const isCashContract = contract.token === 'CASH'

  const bought = amount >= 0 ? 'bought' : 'sold'
  const absAmount = Math.abs(amount)

  const answer =
    contract.mechanism === 'cpmm-multi-1'
      ? contract.answers?.find((a) => a.id === answerId)
      : undefined

  const fromProb = `${(probBefore * 100).toFixed(0)}%`
  const toProb = `${(probAfter * 100).toFixed(0)}%`

  return (
    <Row className="items-start gap-2 py-1">
      <UserHovercard userId={userId}>
        <Avatar
          avatarUrl={bettor?.avatarUrl}
          username={bettor?.username}
          size="xs"
          entitlements={bettor?.entitlements}
          className="mt-0.5 shrink-0"
        />
      </UserHovercard>
      <Col className="min-w-0 gap-0.5">
        <Row className="flex-wrap items-baseline gap-x-1.5 text-sm">
          <span className="text-ink-900 font-semibold">
            {bettor?.name ?? 'Someone'}
          </span>
          <span className="text-ink-500">{bought}</span>
          <span className="text-ink-700 font-semibold">
            <MoneyDisplay amount={absAmount} isCashContract={isCashContract} />
          </span>
          {answer && <span className="text-ink-700">{answer.text}</span>}
          <span
            className={outcome === 'YES' ? 'text-teal-500' : 'text-scarlet-500'}
          >
            {outcome}
          </span>
        </Row>
        <Row className="flex-wrap items-center gap-x-2 text-xs">
          {fromProb === toProb ? (
            <span className="text-ink-700 font-medium">{fromProb}</span>
          ) : (
            <span>
              <span className="text-ink-600">{fromProb}</span>
              <span className="text-ink-400 mx-0.5">→</span>
              <span className="text-ink-900 font-semibold">{toProb}</span>
            </span>
          )}
          <RelativeTimestamp
            time={createdTime}
            shortened
            className="text-ink-400"
          />
        </Row>
      </Col>
    </Row>
  )
})

const MarketCreatedLog = memo(function MarketCreatedLog(props: {
  contract: Contract
}) {
  const { createdTime } = props.contract

  return (
    <Row className="text-ink-500 items-center gap-1.5 py-1 text-sm">
      <span>Created</span>
      <RelativeTimestamp
        time={createdTime}
        shortened
        className="text-ink-400"
      />
    </Row>
  )
})

const CommentLog = memo(function CommentLog(props: {
  comment: ContractComment
  privateUser: PrivateUser | null | undefined
  user: User | null | undefined
  router: ReturnType<typeof useRouter>
  isReply?: boolean
  hiddenReplies?: number
}) {
  const { comment, privateUser, user, router, isReply } = props
  const {
    userName,
    content,
    userId,
    userUsername,
    userAvatarUrl,
    createdTime,
    contractSlug,
  } = comment

  const commenter = useDisplayUserById(userId)

  const navigateToComment = (e: React.MouseEvent) => {
    e.stopPropagation()
    router.push(`/${userUsername}/${contractSlug}#${comment.id}`)
    track('unified feed comment click', {
      commentId: comment.id,
      userId: userId,
      contractSlug: contractSlug,
    })
  }

  return (
    <div
      className="hover:bg-canvas-50 cursor-pointer rounded-md py-1 transition-colors"
      onClick={navigateToComment}
    >
      <Row className="items-start gap-2">
        <UserHovercard userId={userId}>
          <Avatar
            avatarUrl={commenter?.avatarUrl ?? userAvatarUrl}
            username={commenter?.username ?? userUsername}
            size="xs"
            entitlements={commenter?.entitlements}
            className="mt-0.5 shrink-0"
          />
        </UserHovercard>
        <Col className="min-w-0 flex-1 gap-0.5">
          <Row className="flex-wrap items-baseline gap-x-1.5 text-sm">
            <span className="text-ink-900 font-semibold">
              {commenter?.name ?? userName}
            </span>
            <span className="text-ink-500">
              {isReply ? 'replied' : 'commented'}
            </span>
            <RelativeTimestamp
              time={createdTime}
              shortened
              className="text-ink-400 text-xs"
            />
          </Row>
          <div className="text-ink-600 line-clamp-2 text-sm">
            <Content size="sm" content={content} />
          </div>
          <Row
            className="items-center justify-end"
            onClick={(e) => e.stopPropagation()}
          >
            <LikeAndDislikeComment
              comment={comment}
              trackingLocation={'unified-feed'}
              privateUser={privateUser}
              user={user}
            />
          </Row>
        </Col>
      </Row>
    </div>
  )
})

// Ensures correct spacing between buttons
const BottomRowButtonWrapper = (props: { children: React.ReactNode }) => {
  return (
    <Row className="basis-10 justify-start whitespace-nowrap">
      {props.children}
    </Row>
  )
}
