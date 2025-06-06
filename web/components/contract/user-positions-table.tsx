import clsx from 'clsx'
import { Answer } from 'common/answer'
import {
  BinaryContract,
  CPMMContract,
  CPMMMultiContract,
  getMainBinaryMCAnswer,
  isBinaryMulti,
} from 'common/contract'
import { ContractMetric } from 'common/contract-metric'
import { getStonkDisplayShares } from 'common/stonk'
import {
  convertContractMetricRows,
  getContractMetricsCount,
  getOrderedContractMetricRowsForContractId,
} from 'common/supabase/contract-metrics'
import { User } from 'common/user'
import { first, orderBy, partition, uniqBy } from 'lodash'
import { memo, ReactNode, useEffect, useState } from 'react'
import { PillButton } from 'web/components/buttons/pill-button'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import {
  BuyLabel,
  HigherLabel,
  LowerLabel,
  NoLabel,
  OutcomeLabel,
  ShortLabel,
  YesLabel,
} from 'web/components/outcome-label'
import { EmptyAvatar } from 'web/components/widgets/avatar'
import { Carousel } from 'web/components/widgets/carousel'
import { Pagination } from 'web/components/widgets/pagination'
import { UserAvatarAndBadge } from 'web/components/widgets/user-link'
import { useFollows } from 'web/hooks/use-follows'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { useUser } from 'web/hooks/use-user'
import TriangleDownFillIcon from 'web/lib/icons/triangle-down-fill-icon.svg'
import { db } from 'web/lib/supabase/db'
import { MoneyDisplay } from '../bet/money-display'
import { UserHovercard } from '../user/user-hovercard'
import { Select } from '../widgets/select'
import { getPseudonym } from '../charts/contract/choice'

const ROWS_PER_CALL = 50 // Number of items to fetch per backend call, per side
const USER_TABLE_PAGE_SIZE = 20 // Number of items displayed per page in the UI

export const UserPositionsTable = memo(
  function UserPositionsTableContent(props: {
    contract: BinaryContract | CPMMMultiContract
    setTotalPositions?: (totalPositions: number) => void
    answerDetails?: {
      answer: Answer
      totalPositions: number
    }
  }) {
    const { contract, setTotalPositions, answerDetails } = props
    const answer = answerDetails?.answer
    const contractId = contract.id

    const [contractMetricsOrderedByProfit, setContractMetricsOrderedByProfit] =
      useState<ContractMetric[] | undefined>()
    const [nextProfitOffset, setNextProfitOffset] = useState(0)
    const [hasMoreProfit, setHasMoreProfit] = useState(true)

    const [contractMetricsOrderedByShares, setContractMetricsOrderedByShares] =
      useState<ContractMetric[] | undefined>(undefined)
    const [nextSharesOffset, setNextSharesOffset] = useState(0)
    const [hasMoreShares, setHasMoreShares] = useState(true)

    const [metricsCountsByAnswerId, setMetricsCountsByAnswerId] = useState<{
      [key: string]: number
    }>(
      answerDetails
        ? { [answerDetails.answer.id]: answerDetails.totalPositions }
        : {}
    )
    const answers = answer
      ? [answer]
      : contract.mechanism !== 'cpmm-multi-1'
      ? []
      : contract.answers

    const [currentAnswerId, setCurrentAnswerId] = useState<string | undefined>(
      answers.length > 0
        ? getMainBinaryMCAnswer(contract)?.id ??
            first(orderBy(answers, 'totalLiquidity', 'desc'))?.id
        : undefined
    )
    const [page, setPage] = useState(0)
    const [loading, setLoading] = useState(false)
    const [totalYesPositions, setTotalYesPositions] = useState(0)
    const [totalNoPositions, setTotalNoPositions] = useState(0)
    const [sortBy, setSortBy] = useState<'profit' | 'shares'>(
      contract.isResolved ? 'profit' : 'shares'
    )

    const updateContractMetrics = async (
      newSortBy: 'profit' | 'shares',
      answerIdForShares?: string,
      loadMore = false
    ) => {
      const currentLoading = loading
      const currentHasMore =
        newSortBy === 'profit' ? hasMoreProfit : hasMoreShares

      if (loadMore && (currentLoading || !currentHasMore)) {
        if (!currentHasMore && !currentLoading) setLoading(false) // If no more, ensure loading is false
        return
      }
      // If a full refresh is requested while loading something else, allow it if it's not for the same sort type or not a loadMore operation.
      // This condition might need refinement based on desired UX for rapid changes.
      if (currentLoading && !loadMore && newSortBy !== sortBy) {
        // Allow if changing sort type
      } else if (currentLoading) {
        return
      }

      setLoading(true)

      const offsetToUse = loadMore
        ? newSortBy === 'profit'
          ? nextProfitOffset
          : nextSharesOffset
        : 0

      if (!loadMore) {
        setPage(0) // Reset page on new sort/filter
        if (newSortBy === 'profit') {
          setContractMetricsOrderedByProfit(undefined)
          setNextProfitOffset(0)
          setHasMoreProfit(true)
        } else {
          setContractMetricsOrderedByShares(undefined)
          setNextSharesOffset(0)
          setHasMoreShares(true)
        }
      }
      const rows = await getOrderedContractMetricRowsForContractId(
        contractId,
        db,
        newSortBy === 'profit' ? undefined : answerIdForShares,
        newSortBy,
        ROWS_PER_CALL,
        offsetToUse
      )

      const newMetrics = convertContractMetricRows(rows)

      if (newSortBy === 'profit') {
        setContractMetricsOrderedByProfit((prev) =>
          uniqBy(
            (loadMore && prev ? prev : []).concat(newMetrics),
            (cm) => cm.userId + (cm.answerId ?? '') + cm.contractId
          )
        )
        setNextProfitOffset(offsetToUse + ROWS_PER_CALL)
        if (loadMore) {
          if (rows.length === 0) setHasMoreProfit(false)
        } else {
          setHasMoreProfit(rows.length > 0)
        }
      } else {
        setContractMetricsOrderedByShares((prev) =>
          uniqBy(
            (loadMore && prev ? prev : []).concat(newMetrics),
            (cm) => cm.userId + (cm.answerId ?? '') + cm.contractId
          )
        )
        setNextSharesOffset(offsetToUse + ROWS_PER_CALL)
        if (loadMore) {
          if (rows.length === 0) setHasMoreShares(false)
        } else {
          setHasMoreShares(rows.length > 0)
        }
      }
      setLoading(false)
    }

    useEffect(() => {
      // Initial load
      updateContractMetrics(sortBy, currentAnswerId, false)
    }, []) // sortBy and currentAnswerId are stable initially from props/useState

    // Fetch total counts for YES/NO labels (independent of paged positions)
    useEffect(() => {
      getContractMetricsCount(contractId, db, 'yes', currentAnswerId).then(
        setTotalYesPositions
      )
      getContractMetricsCount(contractId, db, 'no', currentAnswerId).then(
        setTotalNoPositions
      )
    }, [currentAnswerId, contractId])

    // Fetch total positions for all answers (for multi-choice carousel/select)
    const getAllAnswerPositionCounts = async () => {
      if (!setTotalPositions) return
      const count = await getContractMetricsCount(contractId, db)
      setTotalPositions(count)
      if (contract.mechanism === 'cpmm-1' || answers.length === 0) return
      const allCounts = Object.fromEntries(
        await Promise.all(
          answers.map(async (ans) => {
            const ansCount = await getContractMetricsCount(
              contractId,
              db,
              undefined,
              ans.id
            )
            return [ans.id, ansCount]
          })
        )
      )
      setMetricsCountsByAnswerId(allCounts)
    }
    useEffect(() => {
      getAllAnswerPositionCounts()
    }, [contract.id, contract.mechanism, answers, setTotalPositions]) // Added dependencies

    const positionsToDisplay = contractMetricsOrderedByShares?.filter((cm) =>
      currentAnswerId ? cm.answerId === currentAnswerId : !cm.answerId
    )
    const profitPositionsToDisplay = contractMetricsOrderedByProfit // Already filtered by backend for !cm.answerId effectively when sortBy is profit

    // Effect to load more data when user scrolls near the end of the list
    useEffect(() => {
      if (loading) return

      const currentHasMore = sortBy === 'profit' ? hasMoreProfit : hasMoreShares
      if (!currentHasMore) return

      const metricsForPartition =
        sortBy === 'profit'
          ? profitPositionsToDisplay ?? []
          : positionsToDisplay ?? []

      if (
        metricsForPartition.length === 0 &&
        (sortBy === 'profit' ? nextProfitOffset : nextSharesOffset) === 0
      ) {
        // Initial load might still be in progress or returned nothing, wait for it
        return
      }

      let tempLeftLength = 0
      let tempRightLength = 0

      if (sortBy === 'profit') {
        const [left, right] = partition(
          metricsForPartition,
          (cm) => cm.profit >= 0
        )
        tempLeftLength = left.length
        tempRightLength = right.length
      } else {
        // 'shares'
        const [left, right] = partition(
          metricsForPartition,
          (cm) => cm.hasYesShares
        )
        tempLeftLength = left.length
        tempRightLength = right.length
      }

      const requiredItemsForPageEnd = (page + 1) * USER_TABLE_PAGE_SIZE
      const shouldLoadMore =
        requiredItemsForPageEnd > tempLeftLength ||
        requiredItemsForPageEnd > tempRightLength

      if (shouldLoadMore && currentHasMore && !loading) {
        updateContractMetrics(sortBy, currentAnswerId, true /* loadMore */)
      }
    }, [
      page,
      sortBy,
      profitPositionsToDisplay,
      positionsToDisplay,
      hasMoreProfit,
      hasMoreShares,
      loading,
      currentAnswerId,
      nextProfitOffset,
      nextSharesOffset,
    ])

    if (contract.mechanism === 'cpmm-1' || isBinaryMulti(contract)) {
      return (
        <Col className={'w-full'}>
          <Row className={'mb-2 items-center justify-end gap-2'}>
            <SortRow
              sort={sortBy === 'profit' ? 'profit' : 'position'}
              onSortClick={() => {
                const newSort = sortBy === 'shares' ? 'profit' : 'shares'
                setSortBy(newSort)
                updateContractMetrics(newSort, currentAnswerId, false)
              }}
            />
          </Row>
          <BinaryUserPositionsTable
            loading={
              loading &&
              (sortBy === 'profit' ? nextProfitOffset : nextSharesOffset) === 0
            }
            contract={contract}
            positionsByShares={positionsToDisplay}
            positionsByProfit={profitPositionsToDisplay}
            totalYesPositions={totalYesPositions}
            totalNoPositions={totalNoPositions}
            sortBy={sortBy}
            page={page}
            setPage={setPage}
            pageSize={USER_TABLE_PAGE_SIZE}
          />
        </Col>
      )
    } else if (contract.mechanism === 'cpmm-multi-1') {
      return (
        <Col className={'w-full'}>
          {!answer && answers.length < 4 && (
            <Carousel labelsParentClassName={'gap-1'}>
              {orderBy(
                answers,
                (answer) => metricsCountsByAnswerId[answer.id] ?? answer.text,
                'desc'
              ).map((answer) => (
                <PillButton
                  key={answer.id}
                  selected={answer.id === currentAnswerId}
                  onSelect={() => {
                    setCurrentAnswerId(answer.id)
                    updateContractMetrics(sortBy, answer.id, false)
                  }}
                >
                  <Row className={'gap-1'}>
                    <span className={'max-w-[60px] truncate text-ellipsis'}>
                      {answer.text}
                    </span>
                    {metricsCountsByAnswerId[answer.id]
                      ? ` (${metricsCountsByAnswerId[answer.id]})`
                      : ''}
                  </Row>
                </PillButton>
              ))}
            </Carousel>
          )}

          <Row className={'mb-2 mt-1 items-center justify-between gap-2'}>
            <Row className={'font-semibold '}>
              {sortBy === 'profit' ? (
                <span className="text-ink-600">Overall Profit</span>
              ) : answers.length >= 4 ? (
                <Select
                  className="h-9 w-full max-w-sm"
                  value={currentAnswerId}
                  onChange={(e) => {
                    setCurrentAnswerId(e.target.value)
                    updateContractMetrics(sortBy, e.target.value, false)
                  }}
                >
                  {orderBy(
                    answers,
                    (answer) =>
                      metricsCountsByAnswerId[answer.id] ?? answer.text,
                    'desc'
                  ).map((answer) => (
                    <option key={answer.id} value={answer.id}>
                      {answer.text}{' '}
                      {metricsCountsByAnswerId[answer.id]
                        ? ` (${metricsCountsByAnswerId[answer.id]})`
                        : ''}
                    </option>
                  ))}
                </Select>
              ) : (
                <span className={'line-clamp-1 '}>
                  {answers.find((a) => a.id === currentAnswerId)?.text}
                </span>
              )}
            </Row>

            <SortRow
              sort={sortBy === 'profit' ? 'profit' : 'position'}
              onSortClick={() => {
                const newSort = sortBy === 'shares' ? 'profit' : 'shares'
                setSortBy(newSort)
                updateContractMetrics(newSort, currentAnswerId, false)
              }}
            />
          </Row>
          <BinaryUserPositionsTable
            loading={
              loading &&
              (sortBy === 'profit' ? nextProfitOffset : nextSharesOffset) === 0
            }
            contract={contract}
            positionsByShares={positionsToDisplay}
            positionsByProfit={profitPositionsToDisplay}
            totalYesPositions={totalYesPositions}
            totalNoPositions={totalNoPositions}
            sortBy={sortBy}
            page={page}
            setPage={setPage}
            pageSize={USER_TABLE_PAGE_SIZE}
          />
        </Col>
      )
    }
    return null
  }
)

const BinaryUserPositionsTable = memo(
  function BinaryUserPositionsTabContent(props: {
    contract: CPMMContract | CPMMMultiContract
    positionsByShares: ContractMetric[] | undefined
    positionsByProfit: ContractMetric[] | undefined
    totalYesPositions: number
    totalNoPositions: number
    sortBy: 'profit' | 'shares'
    page: number
    setPage: (page: number) => void
    loading: boolean
    pageSize: number
  }) {
    const {
      contract,
      totalYesPositions,
      totalNoPositions,
      positionsByShares,
      positionsByProfit,
      sortBy,
      page,
      setPage,
      loading,
      pageSize,
    } = props
    const currentUser = useUser()
    const followedUsers = useFollows(currentUser?.id)
    const isCashContract = contract.token === 'CASH'

    const [leftColumnPositions, rightColumnPositions] = partition(
      sortBy === 'profit' ? positionsByProfit ?? [] : positionsByShares,
      (cm) => (sortBy === 'profit' ? cm.profit >= 0 : cm.hasYesShares)
    )

    const visibleLeftPositions = orderBy(
      leftColumnPositions,
      (cm) => (sortBy === 'profit' ? cm.profit : cm.totalShares['YES']),
      'desc'
    ).slice(page * pageSize, (page + 1) * pageSize)

    const visibleRightPositions = orderBy(
      rightColumnPositions,
      (cm) => (sortBy === 'profit' ? -cm.profit : cm.totalShares['NO']),
      'desc'
    ).slice(page * pageSize, (page + 1) * pageSize)

    const largestColumnLength = Math.max(totalYesPositions, totalNoPositions)

    const isBinary =
      contract.outcomeType === 'BINARY' || contract.mechanism === 'cpmm-multi-1'
    const isStonk = contract.outcomeType === 'STONK'
    const isPseudoNumeric = contract.outcomeType === 'PSEUDO_NUMERIC'
    const mainBinaryMCAnswer = getMainBinaryMCAnswer(contract)
    const getPositionsTitle = (outcome: 'YES' | 'NO') => {
      return outcome === 'YES' ? (
        <span>
          {totalYesPositions}{' '}
          {mainBinaryMCAnswer ? (
            <OutcomeLabel
              contract={contract}
              outcome={outcome}
              truncate={'short'}
              pseudonym={getPseudonym(contract)}
            />
          ) : isBinary ? (
            <>
              <YesLabel />
            </>
          ) : isStonk ? (
            <>
              <BuyLabel />
            </>
          ) : isPseudoNumeric ? (
            <>
              <HigherLabel />
            </>
          ) : (
            <></>
          )}
        </span>
      ) : (
        <span>
          {totalNoPositions}{' '}
          {mainBinaryMCAnswer ? (
            <OutcomeLabel
              pseudonym={getPseudonym(contract)}
              contract={contract}
              outcome={outcome}
              truncate={'short'}
            />
          ) : isBinary ? (
            <>
              <NoLabel />
            </>
          ) : isStonk ? (
            <>
              <ShortLabel />
            </>
          ) : isPseudoNumeric ? (
            <>
              <LowerLabel />
            </>
          ) : (
            <></>
          )}{' '}
        </span>
      )
    }

    // Calculate placeholders based on totalYes/No positions for the current view.
    const maxSidePositions = Math.max(totalYesPositions, totalNoPositions)
    const numPlaceholders =
      maxSidePositions > 0 ? Math.min(maxSidePositions, pageSize) : pageSize
    const itemsToReserveSpaceFor =
      maxSidePositions > 0 ? Math.min(maxSidePositions, pageSize) : pageSize

    return (
      <>
        <Col
          className={clsx('w-full')}
          style={{
            minHeight: `${80 + itemsToReserveSpaceFor * 57}px`,
          }}
        >
          {loading ? (
            <LoadingResults placeholderCount={numPlaceholders} />
          ) : (
            <Row className={'gap-1'}>
              <Col className={'w-1/2'}>
                <Row className={'justify-between p-2'}>
                  {sortBy === 'profit' ? (
                    <span>Profit</span>
                  ) : (
                    <span>{getPositionsTitle('YES')}</span>
                  )}
                  {sortBy === 'shares' && (
                    <span className="text-ink-600">To win</span>
                  )}
                </Row>
                {visibleLeftPositions.map((position) => {
                  const outcome = 'YES'
                  return (
                    <PositionRow
                      key={position.userId + outcome}
                      position={position}
                      colorClassName={
                        isBinaryMulti(contract)
                          ? 'text-indigo-500'
                          : 'text-teal-500'
                      }
                      currentUser={currentUser}
                      followedUsers={followedUsers}
                      numberToShow={
                        sortBy === 'shares' ? (
                          isStonk ? (
                            getStonkDisplayShares(
                              contract,
                              position.totalShares[outcome] ?? 0,
                              2
                            ).toString()
                          ) : (
                            <MoneyDisplay
                              amount={position.totalShares[outcome] ?? 0}
                              isCashContract={isCashContract}
                            />
                          )
                        ) : (
                          <MoneyDisplay
                            amount={position.profit}
                            isCashContract={isCashContract}
                          />
                        )
                      }
                      invested={position.invested}
                      isCashContract={isCashContract}
                    />
                  )
                })}
              </Col>
              <Col className={'w-1/2'}>
                <Row className={'justify-between p-2'}>
                  {sortBy === 'profit' ? (
                    <span>Loss</span>
                  ) : (
                    <span>{getPositionsTitle('NO')}</span>
                  )}
                  {sortBy === 'shares' && (
                    <span className="text-ink-600">To win</span>
                  )}
                </Row>
                {visibleRightPositions.map((position) => {
                  const outcome = 'NO'
                  return (
                    <PositionRow
                      key={position.userId + outcome}
                      position={position}
                      colorClassName={
                        isBinaryMulti(contract)
                          ? 'text-amber-600'
                          : 'text-scarlet-600'
                      }
                      currentUser={currentUser}
                      followedUsers={followedUsers}
                      numberToShow={
                        sortBy === 'shares' ? (
                          isStonk ? (
                            getStonkDisplayShares(
                              contract,
                              position.totalShares[outcome] ?? 0,
                              2
                            ).toString()
                          ) : (
                            <MoneyDisplay
                              amount={position.totalShares[outcome] ?? 0}
                              isCashContract={isCashContract}
                            />
                          )
                        ) : (
                          <MoneyDisplay
                            amount={position.profit}
                            isCashContract={isCashContract}
                          />
                        )
                      }
                      invested={position.invested}
                      isCashContract={isCashContract}
                    />
                  )
                })}
              </Col>
            </Row>
          )}
        </Col>
        <Pagination
          page={page}
          pageSize={pageSize}
          totalItems={largestColumnLength}
          setPage={setPage}
        />
      </>
    )
  }
)
const PositionRow = memo(function PositionRow(props: {
  position: ContractMetric
  numberToShow: ReactNode
  invested: number
  currentUser: User | undefined | null
  followedUsers: string[] | undefined
  colorClassName: string
  isCashContract: boolean
}) {
  const {
    position,
    colorClassName,
    currentUser,
    followedUsers,
    numberToShow,
    invested,
    isCashContract,
  } = props
  const { userId, userName, userUsername, userAvatarUrl } = position
  const isMobile = useIsMobile(800)

  return (
    <Row
      className={clsx(
        'border-ink-300 items-center justify-between gap-2 border-b px-2 py-3',
        currentUser?.id === position.userId && 'bg-amber-500/20',
        followedUsers?.includes(position.userId) && 'bg-blue-500/20'
      )}
    >
      <UserHovercard userId={userId}>
        <Row
          className={clsx(
            'max-w-[7rem] shrink items-center gap-2 overflow-hidden sm:max-w-none'
          )}
        >
          <UserAvatarAndBadge
            user={{
              id: userId,
              name: userName,
              avatarUrl: userAvatarUrl,
              username: userUsername,
            }}
            short={isMobile}
          />
        </Row>
      </UserHovercard>
      <Col>
        <span className={clsx(colorClassName, 'shrink-0', 'text-right')}>
          {numberToShow}
        </span>
        {invested > -99999999 && invested < 9999999999 && (
          <span
            className={clsx(
              'text-ink-500 hidden shrink-0 text-right text-xs sm:flex'
            )}
          >
            Spent{' '}
            <MoneyDisplay amount={invested} isCashContract={isCashContract} />
          </span>
        )}
      </Col>
    </Row>
  )
})
const LoadingResults = ({ placeholderCount }: { placeholderCount: number }) => {
  return (
    <Row className={'gap-1'}>
      <Col className={'w-1/2'}>
        {Array.from({ length: placeholderCount }).map((_, i) => (
          <LoadingPositionsRows key={`left-loading-${i}`} />
        ))}
      </Col>
      <Col className={'w-1/2'}>
        {Array.from({ length: placeholderCount }).map((_, i) => (
          <LoadingPositionsRows key={`right-loading-${i}`} />
        ))}
      </Col>
    </Row>
  )
}
export function LoadingPositionsRows() {
  return (
    <Row className="border-ink-200 min-h-[4rem] animate-pulse items-center justify-center gap-2 border-b p-2 last:border-none sm:rounded-md sm:border-none">
      <EmptyAvatar />
      <div className="bg-canvas-100 h-7 grow rounded-md" />
    </Row>
  )
}

function SortRow(props: { sort: string; onSortClick: () => void }) {
  const { sort, onSortClick } = props
  return (
    <Row className="items-center justify-end gap-4 whitespace-nowrap">
      <Row className="items-center gap-1">
        <span className="text-ink-400 text-sm">Sort by:</span>
        <button className="text-ink-600 w-20 text-sm" onClick={onSortClick}>
          <Row className="items-center gap-1">
            {sort}
            <TriangleDownFillIcon className=" h-2 w-2" />
          </Row>
        </button>
      </Row>
    </Row>
  )
}
