import { memo, useMemo, useState } from 'react'
import { Pagination } from 'web/components/widgets/pagination'
import { FeedBet } from '../feed/feed-bets'
import { FeedLiquidity } from '../feed/feed-liquidity'
import { FreeResponseComments } from '../feed/feed-answer-comment-group'
import { FeedCommentThread, ContractCommentInput } from '../feed/feed-comments'
import { groupBy, sortBy, sum } from 'lodash'
import { Bet } from 'common/bet'
import { AnyContractType, Contract } from 'common/contract'
import { ContractBetsTable } from '../bet/bets-list'
import { ControlledTabs } from '../layout/tabs'
import { Col } from '../layout/col'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { useComments } from 'web/hooks/use-comments'
import { useLiquidity } from 'web/hooks/use-liquidity'
import { useTipTxns } from 'web/hooks/use-tip-txns'
import {
  DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
  HOUSE_LIQUIDITY_PROVIDER_ID,
} from 'common/antes'
import { buildArray } from 'common/util/array'
import { ContractComment } from 'common/comment'

import { MINUTE_MS } from 'common/util/time'
import { useUser } from 'web/hooks/use-user'
import { Tooltip } from 'web/components/widgets/tooltip'
import { Row } from '../layout/row'
import {
  storageStore,
  usePersistentState,
} from 'web/hooks/use-persistent-state'
import { safeLocalStorage } from 'web/lib/util/local'
import TriangleDownFillIcon from 'web/lib/icons/triangle-down-fill-icon'
import { Answer } from 'common/answer'
import { track } from 'web/lib/service/analytics'
import { ContractMetricsByOutcome } from 'web/lib/firebase/contract-metrics'
import { UserLink } from 'web/components/widgets/user-link'
import { Avatar } from 'web/components/widgets/avatar'
import clsx from 'clsx'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { useFollows } from 'web/hooks/use-follows'
import { ContractMetric } from 'common/contract-metric'
import { useContractMetrics } from 'web/hooks/use-contract-metrics'

export function ContractTabs(props: {
  contract: Contract
  bets: Bet[]
  userBets: Bet[]
  comments: ContractComment[]
  userPositionsByOutcome: ContractMetricsByOutcome
  answerResponse?: Answer | undefined
  onCancelAnswerResponse?: () => void
  blockedUserIds: string[]
  activeIndex: number
  setActiveIndex: (i: number) => void
  totalBets: number
  totalPositions: number
}) {
  const {
    contract,
    bets,
    userBets,
    answerResponse,
    onCancelAnswerResponse,
    blockedUserIds,
    activeIndex,
    setActiveIndex,
    totalBets,
    totalPositions,
  } = props

  const contractComments = useComments(contract.id) ?? props.comments
  const comments = useMemo(
    () =>
      contractComments.filter(
        (comment) => !blockedUserIds.includes(comment.userId)
      ),
    [contractComments, blockedUserIds]
  )

  const commentTitle =
    comments.length === 0 ? 'Comments' : `${comments.length} Comments`

  const betsTitle = totalBets === 0 ? 'Trades' : `${totalBets} Trades`

  const visibleUserBets = userBets.filter(
    (bet) => bet.amount !== 0 && !bet.isRedemption
  )
  const yourBetsTitle =
    visibleUserBets.length === 0 ? 'You' : `${visibleUserBets.length} You`

  const outcomes = ['YES', 'NO']
  const positions =
    useContractMetrics(contract.id, 100, outcomes) ??
    props.userPositionsByOutcome
  const positionsTitle =
    totalPositions === 0 ? 'Users' : totalPositions + ' Users'

  return (
    <ControlledTabs
      className="mb-4"
      currentPageForAnalytics={'contract'}
      activeIndex={activeIndex}
      onClick={(_title, i) => {
        setActiveIndex(i)
      }}
      tabs={buildArray(
        {
          title: commentTitle,
          content: (
            <CommentsTabContent
              contract={contract}
              comments={comments}
              answerResponse={answerResponse}
              onCancelAnswerResponse={onCancelAnswerResponse}
              blockedUserIds={blockedUserIds}
            />
          ),
        },
        totalBets > 0 && {
          title: betsTitle,
          content: (
            <Col className={'gap-4'}>
              <BetsTabContent contract={contract} bets={bets} />
            </Col>
          ),
        },

        totalPositions > 0 &&
          contract.outcomeType === 'BINARY' && {
            title: positionsTitle,
            content: <BinaryUserPositionsTabContent positions={positions} />,
          },
        userBets.length > 0 && {
          title: yourBetsTitle,
          content: (
            <ContractBetsTable contract={contract} bets={userBets} isYourBets />
          ),
        }
      )}
    />
  )
}

const BinaryUserPositionsTabContent = memo(
  function BinaryUserPositionsTabContent(props: {
    positions: ContractMetricsByOutcome
  }) {
    const { positions } = props

    const [page, setPage] = useState(0)
    const pageSize = 20
    const currentUser = useUser()
    const followedUsers = useFollows(currentUser?.id)
    const yesPositionsSorted = positions.YES ?? []
    const noPositionsSorted = positions.NO ?? []

    const visibleYesPositions = yesPositionsSorted.slice(
      page * pageSize,
      (page + 1) * pageSize
    )
    const visibleNoPositions = noPositionsSorted.slice(
      page * pageSize,
      (page + 1) * pageSize
    )
    const largestColumnLength =
      yesPositionsSorted.length > noPositionsSorted.length
        ? yesPositionsSorted.length
        : noPositionsSorted.length

    const PositionRow = memo(function PositionRow(props: {
      position: ContractMetric
      outcome: 'YES' | 'NO'
    }) {
      const { position, outcome } = props
      const { totalShares, userName, userUsername, userAvatarUrl } = position
      const shares = totalShares[outcome] ?? 0
      const isMobile = useIsMobile(800)

      return (
        <Row
          className={clsx(
            'items-center justify-between gap-2 rounded-sm border-b p-2',
            currentUser?.id === position.userId && 'bg-amber-100',
            followedUsers?.includes(position.userId) && 'bg-blue-50'
          )}
        >
          <Row
            className={clsx(
              'max-w-[7rem] shrink items-center gap-2 sm:max-w-none'
            )}
          >
            <Avatar
              size={'sm'}
              avatarUrl={userAvatarUrl}
              username={userUsername}
            />
            {userName && userUsername ? (
              <UserLink
                short={isMobile}
                name={userName}
                username={userUsername}
              />
            ) : (
              <span>Loading..</span>
            )}
          </Row>
          <span
            className={clsx(
              outcome === 'YES' ? 'text-teal-500' : 'text-red-700',
              'shrink-0'
            )}
          >
            {Math.round(shares)}
          </span>
        </Row>
      )
    })

    return (
      <Col className={'w-full '}>
        <Row className={'gap-8'}>
          <Col className={'w-full max-w-sm gap-2'}>
            <Row className={'justify-end px-2 text-gray-500'}>
              <span>YES shares</span>
            </Row>
            {visibleYesPositions.map((position) => {
              return (
                <PositionRow
                  key={position.userId + '-YES'}
                  outcome={'YES'}
                  position={position}
                />
              )
            })}
          </Col>
          <Col className={'w-full max-w-sm gap-2'}>
            <Row className={'justify-end px-2 text-gray-500'}>
              <span>NO shares</span>
            </Row>
            {visibleNoPositions.map((position) => {
              return (
                <PositionRow
                  key={position.userId + '-NO'}
                  position={position}
                  outcome={'NO'}
                />
              )
            })}
          </Col>
        </Row>
        <Pagination
          page={page}
          itemsPerPage={pageSize}
          totalItems={largestColumnLength}
          setPage={setPage}
        />
      </Col>
    )
  }
)

const CommentsTabContent = memo(function CommentsTabContent(props: {
  contract: Contract
  comments: ContractComment[]
  answerResponse?: Answer
  onCancelAnswerResponse?: () => void
  blockedUserIds: string[]
}) {
  const { contract, answerResponse, onCancelAnswerResponse, blockedUserIds } =
    props
  const tips = useTipTxns({ contractId: contract.id })
  const comments = (useComments(contract.id) ?? props.comments).filter(
    (c) => !blockedUserIds.includes(c.userId)
  )

  const [sort, setSort] = usePersistentState<'Newest' | 'Best'>('Newest', {
    key: `comments-sort-${contract.id}`,
    store: storageStore(safeLocalStorage()),
  })
  const me = useUser()

  if (comments == null) {
    return <LoadingIndicator />
  }

  const likes = comments.some((c) => c.likes && c.likes > 0)

  // replied to answers/comments are NOT newest, otherwise newest first
  const shouldBeNewestFirst = (c: ContractComment) =>
    c.replyToCommentId == undefined

  // TODO: links to comments are broken because tips load after render and
  //  comments will reorganize themselves if there are tips/bounties awarded
  const sortedComments = sortBy(comments, [
    sort === 'Best'
      ? (c) =>
          // Is this too magic? If there are likes, 'Best' shows your own comments made within the last 10 minutes first, then sorts by score
          likes &&
          c.createdTime > Date.now() - 10 * MINUTE_MS &&
          c.userId === me?.id &&
          shouldBeNewestFirst(c)
            ? -Infinity
            : -((c?.likes ?? 0) + sum(Object.values(tips[c.id] ?? [])))
      : (c) => c,
    (c) => (!shouldBeNewestFirst(c) ? c.createdTime : -c.createdTime),
  ])

  const commentsByParent = groupBy(
    sortedComments,
    (c) => c.replyToCommentId ?? '_'
  )
  const topLevelComments = commentsByParent['_'] ?? []

  return (
    <>
      <ContractCommentInput className="mb-5" contract={contract} />
      <SortRow
        comments={comments}
        contract={contract}
        sort={sort}
        onSortClick={() => {
          setSort(sort === 'Newest' ? 'Best' : 'Newest')
          const totalTips = sum(
            Object.values(tips).map((t) => sum(Object.values(t)))
          )
          track('change-comments-sort', {
            contractSlug: contract.slug,
            contractName: contract.question,
            totalComments: comments.length,
            totalUniqueTraders: contract.uniqueBettorCount,
            totalTips,
          })
        }}
      />
      {contract.outcomeType === 'FREE_RESPONSE' && (
        <FreeResponseComments
          contract={contract}
          answerResponse={answerResponse}
          onCancelAnswerResponse={onCancelAnswerResponse}
          topLevelComments={topLevelComments}
          commentsByParent={commentsByParent}
          tips={tips}
        />
      )}
      {contract.outcomeType !== 'FREE_RESPONSE' &&
        topLevelComments.map((parent) => (
          <FeedCommentThread
            key={parent.id}
            contract={contract}
            parentComment={parent}
            threadComments={sortBy(
              commentsByParent[parent.id] ?? [],
              (c) => c.createdTime
            )}
            tips={tips}
          />
        ))}
    </>
  )
})

const BetsTabContent = memo(function BetsTabContent(props: {
  contract: Contract
  bets: Bet[]
}) {
  const { contract, bets } = props
  const [page, setPage] = useState(0)
  const ITEMS_PER_PAGE = 50
  const start = page * ITEMS_PER_PAGE
  const end = start + ITEMS_PER_PAGE

  const lps = useLiquidity(contract.id) ?? []
  const visibleBets = bets.filter((bet) => !bet.isAnte) // on top of main contract page bet filters
  const visibleLps = lps.filter(
    (l) =>
      !l.isAnte &&
      l.userId !== HOUSE_LIQUIDITY_PROVIDER_ID &&
      l.userId !== DEV_HOUSE_LIQUIDITY_PROVIDER_ID &&
      l.amount > 0
  )

  const items = [
    ...visibleBets.map((bet) => ({
      type: 'bet' as const,
      id: bet.id + '-' + (bet.isSold ? 'sold' : 'unsold'),
      bet,
    })),
    ...visibleLps.map((lp) => ({
      type: 'liquidity' as const,
      id: lp.id,
      lp,
    })),
  ]

  const pageItems = sortBy(items, (item) =>
    item.type === 'bet'
      ? -item.bet.createdTime
      : item.type === 'liquidity'
      ? -item.lp.createdTime
      : undefined
  ).slice(start, end)

  return (
    <>
      <Col className="mb-4 gap-4">
        {pageItems.map((item) =>
          item.type === 'bet' ? (
            <FeedBet key={item.id} contract={contract} bet={item.bet} />
          ) : (
            <FeedLiquidity key={item.id} liquidity={item.lp} />
          )
        )}
      </Col>
      <Pagination
        page={page}
        itemsPerPage={50}
        totalItems={items.length}
        setPage={setPage}
        scrollToTop
      />
    </>
  )
})

export function SortRow(props: {
  comments: ContractComment[]
  contract: Contract<AnyContractType>
  sort: 'Best' | 'Newest'
  onSortClick: () => void
}) {
  const { comments, sort, onSortClick } = props
  if (comments.length <= 0) {
    return <></>
  }
  return (
    <Row className="mb-4 items-center justify-end gap-4">
      <Row className="items-center gap-1">
        <div className="text-sm text-gray-400">Sort by:</div>
        <button className="w-20 text-sm text-gray-600" onClick={onSortClick}>
          <Tooltip text={sort === 'Best' ? 'Most likes first.' : ''}>
            <Row className="items-center gap-1">
              {sort}
              <TriangleDownFillIcon className=" h-2 w-2" />
            </Row>
          </Tooltip>
        </button>
      </Row>
    </Row>
  )
}
