import clsx from 'clsx'
import { ContractComment } from 'common/comment'
import { Contract } from 'common/contract'
import { BOT_USERNAMES, DESTINY_GROUP_SLUGS } from 'common/envs/constants'
import { buildArray, filterDefined } from 'common/util/array'
import {
  difference,
  groupBy,
  keyBy,
  orderBy,
  partition,
  range,
  sortBy,
  uniq,
  uniqBy,
} from 'lodash'
import { ReactNode, memo, useEffect, useState } from 'react'
import { useRealtimeBets } from 'web/hooks/use-bets-supabase'
import { useRealtimeComments } from 'web/hooks/use-comments-supabase'
import {
  usePublicContracts,
  useRealtimeNewContracts,
} from 'web/hooks/use-contract-supabase'
import {
  usePrivateUser,
  useShouldBlockDestiny,
  useUser,
} from 'web/hooks/use-user'
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
import { track } from 'web/lib/service/analytics'
import { getRecentCommentsOnContracts } from 'web/lib/supabase/comments'
import { getRecentActiveContractsOnTopics } from 'web/lib/supabase/contracts'
import { getBetsOnContracts } from 'common/supabase/bets'
import { db } from 'web/lib/supabase/db'
import { Bet } from 'common/bet'

const EXTRA_USERNAMES_TO_EXCLUDE = ['Charlie', 'GamblingGandalf']

export function ActivityLog(props: {
  count: number
  className?: string
  topicSlugs?: string[]
  blockedUserIds?: string[]
  hideQuestions?: boolean
}) {
  const { count, topicSlugs, hideQuestions, className } = props

  const privateUser = usePrivateUser()
  const user = useUser()
  const shouldBlockDestiny = useShouldBlockDestiny(user?.id)

  const blockedGroupSlugs = buildArray(
    privateUser?.blockedGroupSlugs ?? [],
    shouldBlockDestiny && DESTINY_GROUP_SLUGS
  ).filter((t) => !topicSlugs?.includes(t))
  const blockedContractIds = privateUser?.blockedContractIds ?? []
  const blockedUserIds = (privateUser?.blockedUserIds ?? []).concat(
    props.blockedUserIds ?? []
  )

  const [pill, setPill] = useState<PillOptions>('all')

  const [recentTopicalBets, setRecentTopicalBets] = useState<Bet[]>()
  const [recentTopicalComments, setRecentTopicalComments] =
    useState<ContractComment[]>()
  const [loading, setLoading] = useState(false)

  const getRecentTopicalContent = async (topicSlugs: string[]) => {
    setLoading(true)
    const recentContracts = await getRecentActiveContractsOnTopics(
      topicSlugs,
      blockedGroupSlugs,
      count
    )
    const recentContractIds = recentContracts.map((c) => c.id)
    const recentBets = await getBetsOnContracts(db, recentContractIds, {
      limit: count * 3,
      filterRedemptions: true,
      order: 'desc',
    })
    const recentComments = await getRecentCommentsOnContracts(
      recentContractIds,
      count
    )
    setRecentTopicalBets(recentBets)
    setRecentTopicalComments(recentComments)
    setLoading(false)
  }

  useEffect(() => {
    if (topicSlugs) getRecentTopicalContent(topicSlugs)
  }, [topicSlugs])

  const { rows: realtimeBets } = useRealtimeBets({
    limit: count * 3,
    filterRedemptions: true,
    order: 'desc',
  })

  const realtimeComments = useRealtimeComments(count * 3)

  // TODO: could change the initial query to factor in topicSlugs
  const newContracts = useRealtimeNewContracts(count * 3)?.filter(
    (c) =>
      !blockedContractIds.includes(c.id) &&
      !blockedUserIds.includes(c.creatorId) &&
      c.visibility === 'public' &&
      (!c.groupSlugs?.some((slug) => blockedGroupSlugs.includes(slug)) ??
        true) &&
      (topicSlugs?.some((s) => c.groupSlugs?.includes(s)) ?? true)
  )
  const bets = uniqBy(
    (realtimeBets ?? []).concat(recentTopicalBets ?? []),
    'id'
  ).filter(
    (bet) =>
      !blockedContractIds.includes(bet.contractId) &&
      !blockedUserIds.includes(bet.userId) &&
      !BOT_USERNAMES.includes(bet.userUsername) &&
      !EXTRA_USERNAMES_TO_EXCLUDE.includes(bet.userUsername)
  )
  const comments = uniqBy(
    (realtimeComments ?? []).concat(recentTopicalComments ?? []),
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
    topicSlugs,
    blockedGroupSlugs
  )?.filter((c) =>
    c.groupSlugs
      ? (topicSlugs?.some((s) => c.groupSlugs?.includes(s)) ?? true) &&
        !c.groupSlugs.some((slug) => blockedGroupSlugs.includes(slug))
      : true
  )

  const [contracts, unlistedContracts] = partition(
    filterDefined(activeContracts ?? []).concat(newContracts ?? []),
    (c) => c.visibility === 'public'
  )

  const ignoredContractIds = difference(
    activeContractIds,
    activeContracts?.map((c) => c.id) ?? []
  ).concat(unlistedContracts.map((c) => c.id))

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
      // filter out comments and bets on ignored/off-topic contracts
      'contractId' in i ? !ignoredContractIds.includes(i.contractId) : true
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
      <LivePillOptions
        pill={pill}
        setPill={setPill}
        hideQuestions={hideQuestions}
      >
        {loading && <LoadingIndicator size="sm" />}
      </LivePillOptions>
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

type PillOptions = 'all' | 'questions' | 'comments' | 'trades'
const LivePillOptions = (props: {
  pill: PillOptions
  setPill: (pill: PillOptions) => void
  hideQuestions?: boolean
  children?: ReactNode
}) => {
  const { pill, setPill, hideQuestions, children } = props

  const selectPill = (pill: PillOptions) => {
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
      {!hideQuestions && (
        <PillButton
          selected={pill === 'questions'}
          onSelect={() => selectPill('questions')}
          xs
        >
          Questions
        </PillButton>
      )}
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
      {children}
    </Row>
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
        <Avatar size="xs" username={userUsername} avatarUrl={userAvatarUrl} />
        <span>
          <UserLink
            user={{ id: userId, name: userName, username: userUsername }}
          />{' '}
          commented
        </span>
        <RelativeTimestamp time={createdTime} />
      </Row>
      <Content size="sm" className="grow" content={content || text} />
    </Col>
  )
})
