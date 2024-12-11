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
import { Bet } from 'common/bet'

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
    // blockedUserIds,
    // blockedGroupSlugs,
    // blockedContractIds,
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

  console.log('first bet', bets[0])
  console.log('first comment', comments[0])
  console.log('first contract', contracts[0])

  console.log('items', items)


  const groups = orderBy(
    Object.entries(
      groupBy(items, (item) =>
        'contractId' in item ? item.contractId : item.id
      )
    ).map(([parentId, items]) => ({
      parentId,
      items,
    })),
    ({ items }) =>
      Math.max(...items.map((item) => item.createdTime)),
    'desc'
  )

  console.log('groups', groups)

  return (
    <Col className={clsx('gap-4', className)}>
      <Col className="gap-0.5">
        {groups.map(({ parentId, items }) => {
          const contract = contractsById[parentId] as Contract

          return (
            <Col key={parentId} className="bg-canvas-0 gap-2 px-4 py-3">
              <ContractMention contract={contract} />
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
                  <MarketCreatedLog key={item.id} contract={item} />
                ) : 'channelId' in item ? null : (
                  <CommentLog key={item.id} comment={item} />
                )
              )}
            </Col>
          )
        })}
      </Col>
    </Col>
  )
}

const MarketCreatedLog = memo((props: { contract: Contract }) => {
  const {
    creatorId,
    creatorAvatarUrl,
    creatorUsername,
    creatorName,
    createdTime,
  } = props.contract

  return (
    <UserHovercard userId={creatorId}>
      <Row className="text-ink-600 items-center gap-2 text-sm">
        <Avatar
          avatarUrl={creatorAvatarUrl}
          username={creatorUsername}
          size="xs"
        />
        <UserLink
          user={{ id: creatorId, name: creatorName, username: creatorUsername }}
        />
        <Row className="text-ink-400">
          created
          <RelativeTimestamp time={createdTime} />
        </Row>
      </Row>
    </UserHovercard>
  )
})

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
