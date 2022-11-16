import { memo, useState } from 'react'
import { Pagination } from 'web/components/widgets/pagination'
import { FeedBet } from '../feed/feed-bets'
import { FeedLiquidity } from '../feed/feed-liquidity'
import { FreeResponseComments } from '../feed/feed-answer-comment-group'
import { FeedCommentThread, ContractCommentInput } from '../feed/feed-comments'
import { groupBy, sortBy, sum } from 'lodash'
import { Bet } from 'common/bet'
import { AnyContractType, Contract } from 'common/contract'
import { ContractBetsTable } from '../bet/bets-list'
import { Spacer } from '../layout/spacer'
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
import { BountiedContractSmallBadge } from 'web/components/contract/bountied-contract-badge'
import { Row } from '../layout/row'
import {
  storageStore,
  usePersistentState,
} from 'web/hooks/use-persistent-state'
import { safeLocalStorage } from 'web/lib/util/local'
import TriangleDownFillIcon from 'web/lib/icons/triangle-down-fill-icon'
import { Answer } from 'common/answer'
import { track } from 'web/lib/service/analytics'

export function ContractTabs(props: {
  contract: Contract
  bets: Bet[]
  userBets: Bet[]
  comments: ContractComment[]
  answerResponse?: Answer | undefined
  onCancelAnswerResponse?: () => void
  blockedUserIds: string[]
  activeIndex: number
  setActiveIndex: (i: number) => void
}) {
  const {
    contract,
    bets,
    userBets,
    comments,
    answerResponse,
    onCancelAnswerResponse,
    blockedUserIds,
    activeIndex,
    setActiveIndex,
  } = props

  const commentTitle =
    comments.length === 0 ? 'Comments' : `${comments.length} Comments`

  const nonZeroBets = bets.filter((bet) => bet.amount !== 0)
  const betsTitle =
    nonZeroBets.length === 0 ? 'Trades' : `${nonZeroBets.length} Trades`

  const nonZeroUserBets = userBets.filter((bet) => bet.amount !== 0)
  const yourBetsTitle =
    nonZeroUserBets.length === 0
      ? 'Trades by you'
      : nonZeroUserBets.length === 1
      ? '1 Trade by you'
      : `${nonZeroUserBets.length} Trades by you`

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
        bets.length > 0 && {
          title: betsTitle,
          content: <BetsTabContent contract={contract} bets={bets} />,
        },
        userBets.length > 0 && {
          title: yourBetsTitle,
          content: (
            <div>
              <Spacer h={6} />
              <ContractBetsTable
                contract={contract}
                bets={userBets}
                isYourBets
              />
              <Spacer h={12} />
            </div>
          ),
        }
      )}
    />
  )
}

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

  const tipsOrBountiesAwarded =
    Object.keys(tips).length > 0 || comments.some((c) => c.bountiesAwarded)

  // replied to answers/comments are NOT newest, otherwise newest first
  const shouldBeNewestFirst = (c: ContractComment) =>
    c.replyToCommentId == undefined

  // TODO: links to comments are broken because tips load after render and
  //  comments will reorganize themselves if there are tips/bounties awarded
  const sortedComments = sortBy(comments, [
    sort === 'Best'
      ? (c) =>
          // Is this too magic? If there are tips/bounties, 'Best' shows your own comments made within the last 10 minutes first, then sorts by score
          tipsOrBountiesAwarded &&
          c.createdTime > Date.now() - 10 * MINUTE_MS &&
          c.userId === me?.id &&
          shouldBeNewestFirst(c)
            ? -Infinity
            : -((c.bountiesAwarded ?? 0) + sum(Object.values(tips[c.id] ?? [])))
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
      id: bet.id + '-' + bet.isSold,
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
  const { comments, contract, sort, onSortClick } = props
  if (comments.length <= 0) {
    return <></>
  }
  return (
    <Row className="mb-4 items-center justify-end gap-4">
      <BountiedContractSmallBadge contract={contract} showAmount />
      <Row className="items-center gap-1">
        <div className="text-sm text-gray-400">Sort by:</div>
        <button className="w-20 text-sm text-gray-600" onClick={onSortClick}>
          <Tooltip
            text={sort === 'Best' ? 'Highest tips + bounties first.' : ''}
          >
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
