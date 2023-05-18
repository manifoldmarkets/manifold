import clsx from 'clsx'
import { ContractComment } from 'common/comment'
import { Contract } from 'common/contract'
import { BOT_USERNAMES, DESTINY_GROUP_SLUGS } from 'common/envs/constants'
import { buildArray, filterDefined } from 'common/util/array'
import { groupBy, keyBy, orderBy, partition, range, sortBy, uniq } from 'lodash'
import { ReactNode, memo, useEffect } from 'react'
import { useRealtimeBets } from 'web/hooks/use-bets-supabase'
import { useRealtimeComments } from 'web/hooks/use-comments-supabase'
import {
  usePublicContracts,
  useRealtimeContracts,
} from 'web/hooks/use-contract-supabase'
import {
  inMemoryStore,
  usePersistentState,
} from 'web/hooks/use-persistent-state'
import {
  usePrivateUser,
  useShouldBlockDestiny,
  useUser,
} from 'web/hooks/use-user'
import { getGroupContractIds, getGroupFromSlug } from 'web/lib/supabase/group'
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
import { db } from 'web/lib/supabase/db'
import { track } from 'web/lib/service/analytics'
import { useTracking } from 'web/hooks/use-tracking'

const EXTRA_USERNAMES_TO_EXCLUDE = ['Charlie', 'GamblingGandalf']

export function ActivityLog(props: {
  count: number
  pill: pill_options
  rightPanel?: ReactNode
  className?: string
}) {
  useTracking('view live feed')

  const { count, pill, className } = props

  const privateUser = usePrivateUser()
  const user = useUser()
  const shouldBlockDestiny = useShouldBlockDestiny(user?.id)

  const [blockedGroupContractIds, setBlockedGroupContractIds] =
    usePersistentState<string[] | undefined>(undefined, {
      key: 'blockedGroupContractIds',
      store: inMemoryStore(),
    })

  useEffect(() => {
    const blockedGroupSlugs = buildArray(
      privateUser?.blockedGroupSlugs ?? [],
      shouldBlockDestiny && DESTINY_GROUP_SLUGS
    )

    Promise.all(blockedGroupSlugs.map((slug) => getGroupFromSlug(slug, db)))
      .then((groups) =>
        Promise.all(filterDefined(groups).map((g) => getGroupContractIds(g.id)))
      )
      .then((cids) => setBlockedGroupContractIds(cids.flat()))
  }, [privateUser, setBlockedGroupContractIds, shouldBlockDestiny])

  const blockedContractIds = buildArray(
    blockedGroupContractIds,
    privateUser?.blockedContractIds
  )
  const blockedUserIds = privateUser?.blockedUserIds ?? []

  const rawBets = useRealtimeBets({
    limit: count * 3 + 20,
    filterRedemptions: true,
  })
  const bets = (rawBets ?? []).filter(
    (bet) =>
      !blockedContractIds.includes(bet.contractId) &&
      !blockedUserIds.includes(bet.userId) &&
      !BOT_USERNAMES.includes(bet.userUsername) &&
      !EXTRA_USERNAMES_TO_EXCLUDE.includes(bet.userUsername)
  )
  const rawComments = useRealtimeComments(count * 3)
  const comments = (rawComments ?? []).filter(
    (c) =>
      c.commentType === 'contract' &&
      !blockedContractIds.includes(c.contractId) &&
      !blockedUserIds.includes(c.userId)
  ) as ContractComment[]

  const rawContracts = useRealtimeContracts(count * 3)
  const newContracts = (rawContracts ?? []).filter(
    (c) =>
      !blockedContractIds.includes(c.id) &&
      !blockedUserIds.includes(c.creatorId) &&
      c.visibility === 'public'
  )

  const allContracts = usePublicContracts(
    uniq([
      ...bets.map((b) => b.contractId),
      ...comments.map((c) => c.contractId),
    ])
  )

  const [contracts, unlistedContracts] = partition(
    filterDefined(allContracts ?? []).concat(newContracts ?? []),
    (c) => c.visibility === 'public'
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
  )
    .reverse()
    .filter((i) =>
      'contractId' in i
        ? !unlistedContracts.some((c) => c.id === i.contractId)
        : true
    )
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
    rawBets &&
    rawComments &&
    rawContracts &&
    blockedGroupContractIds &&
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
        <Col className="border-ink-400 divide-ink-400 divide-y-[0.5px] rounded-sm border-[0.5px]">
          {groups.map(({ parentId, items }) => {
            const contract = contractsById[parentId] as Contract

            return (
              <Col
                key={parentId}
                className="bg-canvas-0 focus:bg-canvas-100 lg:hover:bg-canvas-100 gap-2 px-4 py-3"
              >
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

export type pill_options = 'all' | 'markets' | 'comments' | 'trades'
export const LivePillOptions = (props: {
  pill: pill_options
  setPill: (pill: pill_options) => void
}) => {
  const { pill, setPill } = props

  const selectPill = (pill: pill_options) => {
    setPill(pill)
    track('select live feed pill', { pill })
  }

  return (
    <Row className="mx-2 gap-2 sm:mx-0">
      <PillButton
        selected={pill === 'all'}
        onSelect={() => selectPill('all')}
        xs
      >
        All
      </PillButton>
      <PillButton
        selected={pill === 'markets'}
        onSelect={() => selectPill('markets')}
        xs
      >
        Markets
      </PillButton>
      <PillButton
        selected={pill === 'comments'}
        onSelect={() => selectPill('comments')}
        xs
      >
        Comments
      </PillButton>
      <PillButton
        selected={pill === 'trades'}
        onSelect={() => selectPill('trades')}
        xs
      >
        Trades
      </PillButton>
    </Row>
  )
}
const MarketCreatedLog = memo((props: { contract: Contract }) => {
  const { creatorAvatarUrl, creatorUsername, creatorName, createdTime } =
    props.contract

  return (
    <Row className="text-ink-500 items-center gap-2 text-sm">
      <Avatar
        avatarUrl={creatorAvatarUrl}
        username={creatorUsername}
        size="xs"
      />
      <UserLink name={creatorName} username={creatorUsername} />
      <Row>
        <div className="text-ink-400">created</div>
        <RelativeTimestamp time={createdTime} />
      </Row>
    </Row>
  )
})

const CommentLog = memo(function FeedComment(props: {
  comment: ContractComment
}) {
  const { comment } = props
  const { userName, text, content, userUsername, userAvatarUrl, createdTime } =
    comment

  return (
    <Col>
      <Row
        id={comment.id}
        className="text-ink-500 mb-1 items-center gap-2 text-sm"
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
