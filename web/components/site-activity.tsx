import clsx from 'clsx'
import { ContractComment } from 'common/comment'
import { Contract } from 'common/contract'
import { filterDefined } from 'common/util/array'
import {
  groupBy,
  keyBy,
  orderBy,
  partition,
  range,
  sortBy,
  uniq,
  uniqBy,
} from 'lodash'
import { memo } from 'react'
import { useBetsOnce, useSubscribeGlobalBets } from 'web/hooks/use-bets'
import {
  useGlobalComments,
  useSubscribeGlobalComments,
} from 'web/hooks/use-comments'
import {
  usePublicContracts,
  useLiveAllNewContracts,
} from 'web/hooks/use-contract'
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
import { Bet } from 'common/bet'

const filterBets = (bet: Bet, contract: Contract | undefined) =>
  bet.amount >= 500 || (contract?.token === 'CASH' && bet.amount >= 5)

const filterComments = (
  comment: ContractComment,
  contract: Contract | undefined
) => (comment.likes ?? 0) - (comment.dislikes ?? 0) >= 2

const filterNewContracts = (contract: Contract) =>
  contract.marketTier !== 'play'

const count = 50

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

  const recentBets = useBetsOnce({
    limit: count * 3,
    filterRedemptions: true,
    order: 'desc',
  })
  const allRealtimeBets = useSubscribeGlobalBets({
    filterRedemptions: true,
  })
  const realtimeBets = sortBy(allRealtimeBets, 'createdTime')
    .reverse()
    .slice(0, count * 3)

  const recentComments = useGlobalComments(count * 3)
  const realtimeComments = useSubscribeGlobalComments()

  const newContracts = useLiveAllNewContracts(count * 3)?.filter(
    (c) =>
      !blockedContractIds.includes(c.id) &&
      !blockedUserIds.includes(c.creatorId) &&
      c.visibility === 'public' &&
      (!c.groupSlugs?.some((slug) => blockedGroupSlugs.includes(slug)) || true)
  )
  const bets = uniqBy(
    [...(realtimeBets ?? []), ...(recentBets ?? [])],
    'id'
  ).filter(
    (bet) =>
      !blockedContractIds.includes(bet.contractId) &&
      !blockedUserIds.includes(bet.userId)
  )
  const comments = uniqBy(
    [...(realtimeComments ?? []), ...(recentComments ?? [])],
    'id'
  ).filter(
    (c) =>
      c.commentType === 'contract' &&
      !blockedContractIds.includes(c.contractId) &&
      !blockedUserIds.includes(c.userId)
  )

  const activeContractIds = uniq([
    ...bets.map((b) => b.contractId),
    ...comments.map((c) => c.contractId),
  ])

  const activeContracts = usePublicContracts(
    activeContractIds,
    undefined,
    blockedGroupSlugs
  )

  const [contracts, _unlistedContracts] = partition(
    filterDefined(activeContracts ?? []).concat(newContracts ?? []),
    (c) => c.visibility === 'public'
  )
  const contractsById = keyBy(contracts, 'id')

  const displayedBets = bets.filter((bet) =>
    filterBets(bet, contractsById[bet.contractId])
  )

  const displayedComments = comments.filter((comment) =>
    filterComments(comment, contractsById[comment.contractId])
  )

  const displayedNewContracts = newContracts?.filter(filterNewContracts)

  const items = sortBy(
    [...displayedBets, ...displayedComments, ...(displayedNewContracts ?? [])],
    (i) => i.createdTime
  )
    .reverse()
    .filter((i) =>
      // filter out comments and bets on ignored/off-topic contracts
      'contractId' in i ? contractsById[i.contractId] : true
    )

  const startIndex =
    range(0, items.length - count).find((i) =>
      items
        .slice(i, i + count)
        .every((item) =>
          'contractId' in item ? contractsById[item.contractId] : true
        )
    ) ?? 0
  const itemsSubset = items.slice(startIndex, startIndex + count)
  const allLoaded =
    realtimeBets &&
    realtimeComments &&
    contracts &&
    activeContracts &&
    itemsSubset.every((item) =>
      'contractId' in item ? contractsById[item.contractId] : true
    )

  const groups = orderBy(
    Object.entries(
      groupBy(itemsSubset, (item) =>
        'contractId' in item ? item.contractId : item.id
      )
    ).map(([parentId, items]) => ({
      parentId,
      items,
    })),
    ({ items }) =>
      // get the largest createdTime of any item in the group
      Math.max(...items.map((item) => item.createdTime)),
    'desc'
  )

  return (
    <Col className={clsx('gap-4', className)}>
      {!allLoaded && <LoadingIndicator />}
      {allLoaded && (
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
      )}
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
