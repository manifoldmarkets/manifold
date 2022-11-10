import { ContractComment } from 'common/comment'
import { Contract } from 'common/contract'
import { BOT_USERNAMES } from 'common/envs/constants'
import { filterDefined } from 'common/util/array'
import { keyBy, range, groupBy, sortBy } from 'lodash'
import { memo, useState } from 'react'
import { useLiveBets } from 'web/hooks/use-bets'
import { useLiveComments } from 'web/hooks/use-comments'
import { useContracts, useLiveContracts } from 'web/hooks/use-contracts'
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

const EXTRA_USERNAMES_TO_EXCLUDE = ['Charlie']

export function ActivityLog(props: { count: number; showPills: boolean }) {
  const { count, showPills } = props
  const bets = (useLiveBets(count * 2 + 10) ?? []).filter(
    (bet) =>
      !BOT_USERNAMES.includes(bet.userUsername) &&
      !EXTRA_USERNAMES_TO_EXCLUDE.includes(bet.userUsername) &&
      !bet.isRedemption &&
      !bet.isAnte
  )
  const comments = (useLiveComments(count * 2) ?? []).filter(
    (c) =>
      c.commentType === 'contract' && !BOT_USERNAMES.includes(c.userUsername)
  ) as ContractComment[]

  const newContracts = useLiveContracts(count)

  const [pill, setPill] = useState<'all' | 'markets' | 'comments' | 'trades'>(
    'all'
  )

  const items = sortBy(
    pill === 'all'
      ? [...bets, ...comments, ...(newContracts ?? [])]
      : pill === 'comments'
      ? comments
      : pill === 'trades'
      ? bets
      : newContracts ?? [],
    (i) => i.createdTime
  ).reverse()

  const contracts = filterDefined(
    useContracts([
      ...bets.map((b) => b.contractId),
      ...comments.map((c) => c.contractId),
    ])
  ).concat(newContracts ?? [])
  const contractsById = keyBy(contracts, 'id')

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
    bets.length > 0 &&
    comments.length > 0 &&
    itemsSubset.every((item) =>
      'contractId' in item ? contractsById[item.contractId] : true
    )

  const groups = Object.entries(
    groupBy(itemsSubset, (item) =>
      'contractId' in item ? item.contractId : item.id
    )
  ).map(([contractId, items]) => ({
    contractId,
    items,
  }))

  if (!allLoaded) return <LoadingIndicator />

  return (
    <Col className="gap-4">
      {showPills && (
        <Row className="gap-2">
          <PillButton selected={pill === 'all'} onSelect={() => setPill('all')}>
            All
          </PillButton>
          <PillButton
            selected={pill === 'markets'}
            onSelect={() => setPill('markets')}
          >
            Markets
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
                ) : 'question' in item ? (
                  <MarketCreatedLog key={item.id} contract={item} />
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
export const MarketCreatedLog = (props: { contract: Contract }) => {
  const { creatorAvatarUrl, creatorUsername, creatorName, createdTime } =
    props.contract

  return (
    <Row className="items-center gap-2 text-sm text-gray-500">
      <Avatar
        avatarUrl={creatorAvatarUrl}
        username={creatorUsername}
        size="xs"
      />
      <UserLink name={creatorName} username={creatorUsername} />
      <Row>
        <div className="text-gray-400">created</div>
        <RelativeTimestamp time={createdTime} />
      </Row>
    </Row>
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
      <Content size="sm" className="grow" content={content || text} />
    </Col>
  )
})
