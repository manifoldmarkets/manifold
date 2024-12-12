import clsx from 'clsx'
import { ContractComment } from 'common/comment'
import { Contract } from 'common/contract'
import { groupBy, keyBy, orderBy } from 'lodash'
import { memo } from 'react'
import { usePrivateUser } from 'web/hooks/use-user'
import { ContractMention } from './contract/contract-mention'
import { FeedBet } from './feed/feed-bets'
import { Col } from './layout/col'
import { Row } from './layout/row'
import { RelativeTimestamp } from './relative-timestamp'
import { Avatar } from './widgets/avatar'
import { Content } from './widgets/editor'
import { LoadingIndicator } from './widgets/loading-indicator'
import { UserLink } from './widgets/user-link'
import { UserHovercard } from './user/user-hovercard'
import { useAPIGetter } from 'web/hooks/use-api-getter'

export function SiteActivity(props: {
  className?: string
  blockedUserIds?: string[]
}) {
  const { className } = props
  const privateUser = usePrivateUser()

  const blockedGroupSlugs = privateUser?.blockedGroupSlugs ?? []
  const blockedContractIds = privateUser?.blockedContractIds ?? []
  const blockedUserIds = (privateUser?.blockedUserIds ?? []).concat(
    props.blockedUserIds ?? []
  )

  const { data, loading } = useAPIGetter('get-site-activity', {
    limit: 10,
    blockedUserIds,
    blockedGroupSlugs,
    blockedContractIds,
  })

  if (loading || !data) return <LoadingIndicator />

  const { bets, comments, newContracts, relatedContracts } = data
  const contracts = [...newContracts, ...relatedContracts]
  const contractsById = keyBy(contracts, 'id')

  const items = orderBy(
    [...bets, ...comments, ...newContracts],
    'createdTime',
    'desc'
  )

  const groups = orderBy(
    Object.entries(
      groupBy(items, (item) =>
        'contractId' in item ? item.contractId : item.id
      )
    ).map(([parentId, items]) => ({
      parentId,
      items,
    })),
    ({ items }) => Math.max(...items.map((item) => item.createdTime)),
    'desc'
  )

  return (
    <Col className={clsx('gap-4', className)}>
      <Col className="gap-4">
        {groups.map(({ parentId, items }) => {
          const contract = contractsById[parentId] as Contract

          return (
            <Col
              key={parentId}
              className="bg-canvas-0 border-canvas-50 hover:border-primary-300 gap-2 rounded-lg border px-4 py-3 transition-colors"
            >
              <Row className="gap-2">
                <Col className="flex-1 gap-2">
                  <ContractMention contract={contract} />
                  <div className="space-y-2">
                    {items.map((item) =>
                      'amount' in item ? (
                        <FeedBet
                          className="!pt-0"
                          key={item.id}
                          contract={contract}
                          bet={item}
                          avatarSize="xs"
                        />
                      ) : 'question' in item ? (
                        <MarketCreatedLog
                          key={item.id}
                          contract={item}
                          showDescription={items.length === 1}
                        />
                      ) : 'channelId' in item ? null : (
                        <CommentLog key={item.id} comment={item} />
                      )
                    )}
                  </div>
                </Col>
                {contract.coverImageUrl && (
                  <img
                    src={contract.coverImageUrl}
                    alt=""
                    className="h-32 w-32 rounded-md object-cover"
                  />
                )}
              </Row>
            </Col>
          )
        })}
      </Col>
    </Col>
  )
}

const MarketCreatedLog = memo(
  (props: { contract: Contract; showDescription?: boolean }) => {
    const {
      creatorId,
      creatorAvatarUrl,
      creatorUsername,
      creatorName,
      createdTime,
    } = props.contract
    const { showDescription = false } = props

    return (
      <Col className="gap-2">
        <UserHovercard userId={creatorId} className="flex-col">
          <Row className="text-ink-600 items-center gap-2 text-sm">
            <Avatar
              avatarUrl={creatorAvatarUrl}
              username={creatorUsername}
              size="xs"
            />
            <UserLink
              user={{
                id: creatorId,
                name: creatorName,
                username: creatorUsername,
              }}
            />
            <Row className="text-ink-400">
              created
              <RelativeTimestamp time={createdTime} />
            </Row>
          </Row>
        </UserHovercard>

        {showDescription && props.contract.description && (
          // TODO: truncate if too long
          <Content
            size="sm"
            content={props.contract.description}
            className="mt-2 text-left"
          />
        )}
      </Col>
    )
  }
)

const CommentLog = memo(function FeedComment(props: {
  comment: ContractComment
}) {
  const { comment } = props
  const {
    userName,
    text,
    content,
    userId,
    userUsername,
    userAvatarUrl,
    createdTime,
  } = comment

  return (
    <Col>
      <Row
        id={comment.id}
        className="text-ink-500 mb-1 items-center gap-2 text-sm"
      >
        <UserHovercard userId={userId}>
          <Avatar size="xs" username={userUsername} avatarUrl={userAvatarUrl} />
        </UserHovercard>
        <span>
          <UserHovercard userId={userId}>
            <UserLink
              user={{ id: userId, name: userName, username: userUsername }}
            />
          </UserHovercard>{' '}
          commented
        </span>
        <RelativeTimestamp time={createdTime} />
      </Row>
      <Content size="sm" className="grow" content={content || text} />
    </Col>
  )
})
