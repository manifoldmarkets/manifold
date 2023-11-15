import clsx from 'clsx'
import {
  CPMMBinaryContract,
  CPMMContract,
  CPMMMultiContract,
} from 'common/contract'
import {
  ContractMetric,
  ContractMetricsByOutcome,
} from 'common/contract-metric'
import {
  convertContractMetricRows,
  getContractMetricsCount,
  getOrderedContractMetricRowsForContractId,
} from 'common/supabase/contract-metrics'
import { User } from 'common/user'
import { formatMoney } from 'common/util/format'
import { first, orderBy, partition, uniqBy } from 'lodash'
import { memo, useEffect, useMemo, useState } from 'react'
import { SortRow } from 'web/components/contract/contract-tabs'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import {
  BuyLabel,
  HigherLabel,
  LowerLabel,
  NoLabel,
  ShortLabel,
  YesLabel,
} from 'web/components/outcome-label'
import { Avatar } from 'web/components/widgets/avatar'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { Pagination } from 'web/components/widgets/pagination'
import { UserLink } from 'web/components/widgets/user-link'
import { useFollows } from 'web/hooks/use-follows'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { useUser } from 'web/hooks/use-user'
import { db } from 'web/lib/supabase/db'
import { getStonkDisplayShares } from 'common/stonk'
import { PillButton } from 'web/components/buttons/pill-button'
import { Carousel } from 'web/components/widgets/carousel'

export const UserPositionsTable = memo(
  function UserPositionsTableContent(props: {
    contract: CPMMBinaryContract | CPMMMultiContract
    positions: ContractMetricsByOutcome
    setTotalPositions?: (totalPositions: number) => void
  }) {
    const { contract, setTotalPositions } = props
    const contractId = contract.id

    const [contractMetricsByProfit, setContractMetricsByProfit] =
      useState<ContractMetric[]>()
    const [contractMetricsByShares, setContractMetricsByShares] = useState<
      ContractMetric[]
    >(Object.values(props.positions).flat())

    const [totalMetricsByAnswerId, setTotalMetricsByAnswerId] = useState<{
      [key: string]: number
    }>({})
    const [answerId, setAnswerId] = useState<string | undefined>(
      contract.mechanism === 'cpmm-multi-1'
        ? first(orderBy(contract.answers, 'totalLiquidity', 'desc'))?.id
        : undefined
    )
    const [page, setPage] = useState(0)
    const [loading, setLoading] = useState(false)
    const [totalYesPositions, setTotalYesPositions] = useState(0)
    const [totalNoPositions, setTotalNoPositions] = useState(0)
    const [sortBy, setSortBy] = useState<'profit' | 'shares'>(
      contract.isResolved ? 'profit' : 'shares'
    )

    useEffect(() => {
      setLoading(true)
      getOrderedContractMetricRowsForContractId(
        contractId,
        db,
        answerId,
        sortBy
      ).then((rows) =>
        sortBy === 'profit'
          ? updateContractMetricsByProfit(convertContractMetricRows(rows))
          : updateContractMetricsByShares(convertContractMetricRows(rows))
      )
    }, [contractId, answerId, sortBy])

    const updateContractMetricsByProfit = (cms: ContractMetric[]) => {
      setContractMetricsByProfit((prev) =>
        uniqBy(
          cms.concat(prev ?? []),
          (cm) => cm.userId + cm.answerId + cm.contractId
        )
      )
      setLoading(false)
    }

    const updateContractMetricsByShares = (cms: ContractMetric[]) => {
      setContractMetricsByShares((prev) =>
        uniqBy(
          cms.concat(prev ?? []),
          (cm) => cm.userId + cm.answerId + cm.contractId
        )
      )
      setLoading(false)
    }

    useEffect(() => {
      getContractMetricsCount(contractId, db, 'yes', answerId).then(
        setTotalYesPositions
      )
      getContractMetricsCount(contractId, db, 'no', answerId).then(
        setTotalNoPositions
      )
    }, [answerId, contractId])

    const getAllAnswerPositionCounts = async () => {
      if (!setTotalPositions) return
      const count = await getContractMetricsCount(contractId, db)
      setTotalPositions(count)
      if (contract.mechanism == 'cpmm-1') return
      const allCounts = Object.fromEntries(
        await Promise.all(
          contract.answers.map(async (answer) => {
            const count = await getContractMetricsCount(
              contractId,
              db,
              undefined,
              answer.id
            )
            return [answer.id, count]
          })
        )
      )
      setTotalMetricsByAnswerId(allCounts)
    }
    useEffect(() => {
      getAllAnswerPositionCounts()
    }, [])

    const positionsToDisplay = contractMetricsByShares.filter((cm) =>
      answerId ? cm.answerId === answerId : !cm.answerId
    )
    const profitPositionsToDisplay = contractMetricsByProfit?.filter((cm) =>
      answerId ? cm.answerId === answerId : !cm.answerId
    )

    if (contract.mechanism === 'cpmm-1') {
      return (
        <Col className={'w-full'}>
          <Row className={'mb-2 items-center justify-end gap-2'}>
            <SortRow
              sort={sortBy === 'profit' ? 'profit' : 'position'}
              onSortClick={() => {
                setSortBy(sortBy === 'shares' ? 'profit' : 'shares')
                setPage(0)
              }}
            />
          </Row>
          <BinaryUserPositionsTable
            loading={loading}
            contract={contract}
            positionsByShares={positionsToDisplay}
            positionsByProfit={profitPositionsToDisplay}
            totalYesPositions={totalYesPositions}
            totalNoPositions={totalNoPositions}
            sortBy={sortBy}
            page={page}
            setPage={setPage}
            loadingPositions={Math.min(totalYesPositions, totalNoPositions)}
          />
        </Col>
      )
    } else if (contract.mechanism === 'cpmm-multi-1') {
      return (
        <Col className={'w-full'}>
          <Carousel labelsParentClassName={'gap-1'}>
            {orderBy(
              contract.answers,
              (answer) => totalMetricsByAnswerId[answer.id] ?? answer.text,
              'desc'
            ).map((answer) => (
              <PillButton
                key={answer.id}
                selected={answer.id === answerId}
                onSelect={() => setAnswerId(answer.id)}
              >
                <Row className={'gap-1'}>
                  <span className={'max-w-[60px] truncate text-ellipsis'}>
                    {answer.text}
                  </span>
                  {totalMetricsByAnswerId[answer.id]
                    ? ` (${totalMetricsByAnswerId[answer.id]})`
                    : ''}
                </Row>
              </PillButton>
            ))}
          </Carousel>
          <Row className={'mb-2 mt-1 items-center justify-between gap-2'}>
            <Row className={'font-semibold '}>
              <span className={'line-clamp-1 '}>
                {contract.answers.find((a) => a.id === answerId)?.text}
              </span>
            </Row>

            <SortRow
              sort={sortBy === 'profit' ? 'profit' : 'position'}
              onSortClick={() => {
                setSortBy(sortBy === 'shares' ? 'profit' : 'shares')
                setPage(0)
              }}
            />
          </Row>
          <BinaryUserPositionsTable
            loading={loading}
            contract={contract}
            positionsByShares={positionsToDisplay}
            positionsByProfit={profitPositionsToDisplay}
            totalYesPositions={totalYesPositions}
            totalNoPositions={totalNoPositions}
            sortBy={sortBy}
            page={page}
            setPage={setPage}
            loadingPositions={
              answerId
                ? // Just an approximation, could be more asymmetric
                  totalMetricsByAnswerId[answerId] / 2
                : Math.min(totalYesPositions, totalNoPositions)
            }
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
    positionsByShares: ContractMetric[]
    positionsByProfit: ContractMetric[] | undefined
    totalYesPositions: number
    totalNoPositions: number
    sortBy: 'profit' | 'shares'
    page: number
    setPage: (page: number) => void
    loading: boolean
    loadingPositions: number
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
      loadingPositions,
    } = props
    const pageSize = 20
    const currentUser = useUser()
    const followedUsers = useFollows(currentUser?.id)

    const [leftColumnPositions, rightColumnPositions] = useMemo(
      () =>
        partition(
          sortBy === 'profit' ? positionsByProfit ?? [] : positionsByShares,
          (cm) => (sortBy === 'profit' ? cm.profit >= 0 : cm.hasYesShares)
        ),
      [
        JSON.stringify(positionsByProfit),
        JSON.stringify(positionsByShares),
        sortBy,
      ]
    )

    const visibleLeftPositions = leftColumnPositions.slice(
      page * pageSize,
      (page + 1) * pageSize
    )

    const visibleRightPositions = rightColumnPositions.slice(
      page * pageSize,
      (page + 1) * pageSize
    )

    const largestColumnLength =
      leftColumnPositions.length > rightColumnPositions.length
        ? leftColumnPositions.length
        : rightColumnPositions.length

    const isBinary =
      contract.outcomeType === 'BINARY' || contract.mechanism === 'cpmm-multi-1'
    const isStonk = contract.outcomeType === 'STONK'
    const isPseudoNumeric = contract.outcomeType === 'PSEUDO_NUMERIC'

    const getPositionsTitle = (outcome: 'YES' | 'NO') => {
      return outcome === 'YES' ? (
        <span>
          {totalYesPositions}{' '}
          {isBinary ? (
            <>
              <YesLabel /> payouts
            </>
          ) : isStonk ? (
            <>
              <BuyLabel /> positions
            </>
          ) : isPseudoNumeric ? (
            <>
              <HigherLabel /> positions
            </>
          ) : (
            <></>
          )}
        </span>
      ) : (
        <span>
          {totalNoPositions}{' '}
          {isBinary ? (
            <>
              <NoLabel /> payouts
            </>
          ) : isStonk ? (
            <>
              <ShortLabel /> positions
            </>
          ) : isPseudoNumeric ? (
            <>
              <LowerLabel /> positions
            </>
          ) : (
            <></>
          )}{' '}
        </span>
      )
    }

    return (
      <>
        <Col
          className={clsx('w-full')}
          // To avoid the table height jumping when loading
          style={{
            minHeight: `${
              80 +
              (loadingPositions > pageSize ? pageSize : loadingPositions) * 57
            }px`,
          }}
        >
          {loading ? (
            <LoadingIndicator spinnerClassName={'border-ink-500'} size={'lg'} />
          ) : (
            <Row className={'gap-1'}>
              <Col className={'w-1/2'}>
                <Row className={'text-ink-500 justify-end p-2'}>
                  {sortBy === 'profit' ? (
                    <span className={'text-ink-500'}>Profit</span>
                  ) : (
                    <span>{getPositionsTitle('YES')}</span>
                  )}
                </Row>
                {visibleLeftPositions.map((position) => {
                  const outcome = 'YES'
                  return (
                    <PositionRow
                      key={position.userId + outcome}
                      position={position}
                      outcome={outcome}
                      currentUser={currentUser}
                      followedUsers={followedUsers}
                      numberToShow={
                        sortBy === 'shares'
                          ? isStonk
                            ? getStonkDisplayShares(
                                contract,
                                position.totalShares[outcome] ?? 0,
                                2
                              ).toString()
                            : formatMoney(position.totalShares[outcome] ?? 0)
                          : formatMoney(position.profit)
                      }
                    />
                  )
                })}
              </Col>
              <Col className={'w-1/2'}>
                <Row className={'text-ink-500 justify-end p-2'}>
                  {sortBy === 'profit' ? (
                    <span className={'text-ink-500'}>Loss</span>
                  ) : (
                    <span>{getPositionsTitle('NO')}</span>
                  )}
                </Row>
                {visibleRightPositions.map((position) => {
                  const outcome = 'NO'
                  return (
                    <PositionRow
                      key={position.userId + outcome}
                      position={position}
                      outcome={outcome}
                      currentUser={currentUser}
                      followedUsers={followedUsers}
                      numberToShow={
                        sortBy === 'shares'
                          ? isStonk
                            ? getStonkDisplayShares(
                                contract,
                                position.totalShares[outcome] ?? 0,
                                2
                              ).toString()
                            : formatMoney(position.totalShares[outcome] ?? 0)
                          : formatMoney(position.profit)
                      }
                    />
                  )
                })}
              </Col>
            </Row>
          )}
        </Col>
        <Pagination
          page={page}
          itemsPerPage={pageSize}
          totalItems={largestColumnLength}
          setPage={setPage}
        />
      </>
    )
  }
)
const PositionRow = memo(function PositionRow(props: {
  position: ContractMetric
  outcome: 'YES' | 'NO'
  numberToShow: string
  currentUser: User | undefined | null
  followedUsers: string[] | undefined
}) {
  const { position, outcome, currentUser, followedUsers, numberToShow } = props
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
      <Row
        className={clsx(
          'max-w-[7rem] shrink items-center gap-2 overflow-hidden sm:max-w-none'
        )}
      >
        <Avatar size={'sm'} avatarUrl={userAvatarUrl} username={userUsername} />
        {userName && userUsername ? (
          <UserLink
            user={{ id: userId, name: userName, username: userUsername }}
            short={isMobile}
          />
        ) : (
          <span>Loading..</span>
        )}
      </Row>
      <span
        className={clsx(
          outcome === 'YES' ? 'text-teal-500' : 'text-scarlet-600',
          'shrink-0'
        )}
      >
        {numberToShow}
      </span>
    </Row>
  )
})
