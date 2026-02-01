import clsx from 'clsx'
import Image from 'next/image'
import { useRouter } from 'next/router'
import { memo } from 'react'
import { groupBy, orderBy } from 'lodash'

import { Bet } from 'common/bet'
import { CommentWithTotalReplies, ContractComment } from 'common/comment'
import { Contract, MarketContract } from 'common/contract'
import { PrivateUser, User } from 'common/user'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { ContractMention } from 'web/components/contract/contract-mention'
import { FeedBet } from 'web/components/feed/feed-bets'
import { YourMetricsFooter } from 'web/components/contract/feed-contract-card'
import { useSavedContractMetrics } from 'web/hooks/use-saved-contract-metrics'
import { usePrivateUser } from 'web/hooks/use-user'
import { RelativeTimestamp } from 'web/components/relative-timestamp'
import { Avatar } from 'web/components/widgets/avatar'
import { Content } from 'web/components/widgets/editor'
import { UserLink } from 'web/components/widgets/user-link'
import { UserHovercard } from 'web/components/user/user-hovercard'
import { LikeAndDislikeComment } from 'web/components/comments/comment-actions'
import { useDisplayUserById } from 'web/hooks/use-user-supabase'
import { track } from 'web/lib/service/analytics'

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

  // Separate comments and group replies
  const commentItems = items.filter((item) => item.type === 'comment')
  const comments = commentItems.map((item) => item.data as CommentWithTotalReplies)
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

  return (
    <Col
      className={clsx(
        'bg-canvas-0 dark:bg-canvas-50 dark:border-canvas-50 hover:border-primary-300 gap-2 rounded-lg border p-3 shadow-md transition-colors sm:px-5'
      )}
    >
      <Row className="gap-2">
        <Col className="flex-1 gap-2">
          <Row className="gap-2">
            {contract.coverImageUrl && (
              <Image
                src={contract.coverImageUrl}
                alt=""
                width={100}
                height={100}
                className={clsx(
                  'rounded-md object-cover',
                  'h-12 w-12',
                  items.length === 1 && items[0].type === 'bet' && 'sm:hidden'
                )}
              />
            )}
            <ContractMention
              className={
                displayItems.length === 1 && displayItems[0].type === 'market'
                  ? ''
                  : '!opacity-70'
              }
              contract={contract}
              trackingLocation={'unified-feed-activity'}
            />
          </Row>
          <div className="space-y-1">
            {displayItems.map((item) => {
              if (item.type === 'bet') {
                return (
                  <FeedBet
                    className="p-1"
                    key={`${item.id}-bet`}
                    contract={contract as MarketContract}
                    bet={item.data as Bet}
                    avatarSize="xs"
                    hideActions={true}
                  />
                )
              } else if (item.type === 'market') {
                return (
                  <MarketCreatedLog
                    key={`${item.id}-market`}
                    contract={item.data as Contract}
                    showDescription={items.length === 1}
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

                    {hiddenRepliesCount > 0 && childReplies.length > 0 && (
                      <Row className="text-ink-400 ml-6 items-center gap-1 pb-2 pl-2 text-xs">
                        <div className="border-ink-400 w-5 border-b-[1px] border-l-[1px]" />
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            router.push(
                              `/${comment.userUsername}/${comment.contractSlug}#${comment.id}`
                            )
                          }}
                          className="hover:underline"
                        >
                          {hiddenRepliesCount} more{' '}
                          {hiddenRepliesCount === 1 ? 'reply' : 'replies'}
                        </button>
                        <div className="border-ink-400 w-5 border-b-[1px] border-l-[1px]" />
                      </Row>
                    )}

                    {childReplies.length > 0 && (
                      <Col className="ml-6 space-y-1 pl-2">
                        {childReplies.map((reply) => (
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
        </Col>
      </Row>
      {contract.outcomeType === 'BINARY' && position && position.hasShares && (
        <YourMetricsFooter
          metrics={position}
          isCashContract={contract.token === 'CASH'}
          className="dark:!bg-canvas-50 !bg-canvas-0"
        />
      )}
    </Col>
  )
})

const MarketCreatedLog = memo(function MarketCreatedLog(props: {
  contract: Contract
  showDescription?: boolean
}) {
  const {
    creatorId,
    creatorAvatarUrl,
    creatorUsername,
    creatorName,
    createdTime,
  } = props.contract
  const { showDescription = false } = props

  const creator = useDisplayUserById(creatorId)

  return (
    <Col className="gap-2">
      <Row className="text-ink-1000 items-center gap-2 text-sm">
        <UserHovercard userId={creatorId}>
          <Row className="items-center gap-2 font-semibold">
            <Avatar
              avatarUrl={creator?.avatarUrl ?? creatorAvatarUrl}
              username={creator?.username ?? creatorUsername}
              size="xs"
              entitlements={creator?.entitlements}
              displayContext="activity"
            />
            <UserLink
              user={{
                id: creatorId,
                name: creator?.name ?? creatorName,
                username: creator?.username ?? creatorUsername,
                entitlements: creator?.entitlements,
              }}
              displayContext="activity"
            />
          </Row>
        </UserHovercard>
        <div className="-ml-1">created this market</div>
        <Row className="text-ink-400">
          <RelativeTimestamp time={createdTime} shortened />
        </Row>
      </Row>

      {showDescription && props.contract.description && (
        <div className="relative max-h-[120px] max-w-xs overflow-hidden sm:max-w-none">
          <Content
            size="sm"
            content={props.contract.description}
            className="mt-2 text-left"
          />
          <div className="dark:from-canvas-50 from-canvas-0 absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t to-transparent" />
        </div>
      )}
    </Col>
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

  return (
    <Col
      className={clsx('hover:bg-canvas-100 cursor-pointer rounded-md p-1')}
      onClick={() => {
        router.push(`/${userUsername}/${contractSlug}#${comment.id}`)
        track('unified feed comment click', {
          commentId: comment.id,
          userId: userId,
          contractSlug: contractSlug,
        })
      }}
    >
      <Row id={comment.id} className="items-center gap-2 text-sm">
        <UserHovercard userId={userId}>
          <Row className="items-center gap-2 font-semibold">
            <Avatar
              avatarUrl={commenter?.avatarUrl ?? userAvatarUrl}
              username={commenter?.username ?? userUsername}
              size="xs"
              entitlements={commenter?.entitlements}
              displayContext="activity"
            />
            <UserLink
              user={{
                id: userId,
                name: commenter?.name ?? userName,
                username: commenter?.username ?? userUsername,
                entitlements: commenter?.entitlements,
              }}
              displayContext="activity"
            />
          </Row>
        </UserHovercard>
        <div className="-ml-1">{isReply ? 'replied' : 'commented'}</div>
        <Row className="text-ink-400">
          <RelativeTimestamp time={createdTime} shortened />
        </Row>
      </Row>
      <Content size="sm" className="grow" content={content} />
      <Row className="items-center justify-end">
        <LikeAndDislikeComment
          comment={comment}
          trackingLocation={'unified-feed'}
          privateUser={privateUser}
          user={user}
        />
      </Row>
    </Col>
  )
})
