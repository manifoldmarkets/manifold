import { ContractComment } from 'common/comment'
import { Contract } from 'common/contract'
import { BOT_USERNAMES } from 'common/envs/constants'
import { filterDefined } from 'common/util/array'
import { keyBy, range, groupBy, sortBy } from 'lodash'
import { memo, useState } from 'react'
import { useLiveBets } from 'web/hooks/use-bets'
import { useLiveComments } from 'web/hooks/use-comments'
import { useContracts } from 'web/hooks/use-contracts'
import { PillButton } from './buttons/pill-button'
import { ContractMention } from './contract/contract-mention'
import { FeedBet } from './feed/feed-bets'
import { Col } from './layout/col'
import { Row } from './layout/row'
import { RelativeTimestamp } from './relative-timestamp'
import { Avatar } from './widgets/avatar'
import { Content } from './widgets/editor'
import { LoadingIndicator } from './widgets/loading-indicator'
import { UserLink } from './widgets/user-link'

export function ActivityLog(props: { count: number; showPills: boolean }) {
  const { count, showPills } = props
  const bets = (useLiveBets(count * 2) ?? []).filter(
    (bet) =>
      !BOT_USERNAMES.includes(bet.userUsername) &&
      !bet.isRedemption &&
      !bet.isAnte
  )
  const comments = (useLiveComments(count * 2) ?? []).filter(
    (c) => c.commentType === 'contract'
  ) as ContractComment[]

  const [pill, setPill] = useState<'all' | 'comments' | 'trades'>('all')

  const items = sortBy(
    pill === 'all'
      ? [...bets, ...comments]
      : pill === 'comments'
      ? comments
      : bets,
    (i) => i.createdTime
  ).reverse()

  const contracts = filterDefined([
    ...useContracts(bets.map((b) => b.contractId)),
    ...useContracts(comments.map((c) => c.contractId)),
  ])
  const contractsById = keyBy(contracts, 'id')

  const startIndex =
    range(0, items.length - count).find((i) =>
      items.slice(i, i + count).every((item) => contractsById[item.contractId])
    ) ?? 0
  const itemsSubset = items.slice(startIndex, startIndex + count)

  const allLoaded =
    bets.length > 0 &&
    comments.length > 0 &&
    itemsSubset.every((b) => contractsById[b.contractId])

  const groups = Object.entries(groupBy(itemsSubset, (b) => b.contractId)).map(
    ([contractId, items]) => ({
      contractId,
      items,
    })
  )

  if (!allLoaded) return <LoadingIndicator />

  return (
    <Col className="gap-4">
      {showPills && (
        <Row className="gap-2">
          <PillButton selected={pill === 'all'} onSelect={() => setPill('all')}>
            All
          </PillButton>
          <PillButton
            selected={pill === 'comments'}
            onSelect={() => setPill('comments')}
          >
            Comments
          </PillButton>
          <PillButton
            selected={pill === 'trades'}
            onSelect={() => setPill('trades')}
          >
            Trades
          </PillButton>
        </Row>
      )}
      <Col className="divide-y border">
        {groups.map(({ contractId, items }) => {
          const contract = contractsById[contractId] as Contract
          return (
            <Col key={contractId} className="gap-2 bg-white px-6 py-4 ">
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
                ) : (
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

export const CommentLog = memo(function FeedComment(props: {
  comment: ContractComment
}) {
  const { comment } = props
  const { userName, text, content, userUsername, userAvatarUrl, createdTime } =
    comment

  return (
    <Col>
      <Row
        id={comment.id}
        className="mb-1 items-center gap-2 text-sm text-gray-500"
      >
        <Avatar size="xs" username={userUsername} avatarUrl={userAvatarUrl} />
        <div>
          <UserLink name={userName} username={userUsername} /> commented{' '}
          <RelativeTimestamp time={createdTime} />
        </div>
      </Row>
      <Content
        className="text-greyscale-7 grow text-[14px]"
        content={content || text}
        smallImage
      />
    </Col>
  )
})
