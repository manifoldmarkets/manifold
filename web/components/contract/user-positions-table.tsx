import clsx from 'clsx'
import { ContractMetrics } from 'common/calculate-metrics'
import { CPMMContract } from 'common/contract'
import { ContractMetric } from 'common/contract-metric'
import {
  ShareholderStats,
  getContractMetricsForContractId,
  getShareholderCountsForContractId,
} from 'common/supabase/contract-metrics'
import { User } from 'common/user'
import { formatMoney } from 'common/util/format'
import { partition } from 'lodash'
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
import { Tooltip } from 'web/components/widgets/tooltip'
import { UserLink } from 'web/components/widgets/user-link'
import { useContractMetrics } from 'web/hooks/use-contract-metrics'
import { useFollows } from 'web/hooks/use-follows'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { useUser } from 'web/hooks/use-user'
import {
  ContractMetricsByOutcome,
  getTotalContractMetricsCount,
} from 'web/lib/firebase/contract-metrics'
import { db } from 'web/lib/supabase/db'
import { getStonkShares } from 'common/stonk'

export const BinaryUserPositionsTable = memo(
  function BinaryUserPositionsTabContent(props: {
    contract: CPMMContract
    positions: ContractMetricsByOutcome
    setTotalPositions: (count: number) => void
    shareholderStats?: ShareholderStats
  }) {
    const { contract, setTotalPositions } = props
    const contractId = contract.id
    const [page, setPage] = useState(0)
    const pageSize = 20
    const outcomes = ['YES', 'NO']
    const currentUser = useUser()
    const followedUsers = useFollows(currentUser?.id)
    const [contractMetricsByProfit, setContractMetricsByProfit] = useState<
      ContractMetrics[] | undefined
    >()
    const [shareholderStats, setShareholderStats] = useState<
      ShareholderStats | undefined
    >(props.shareholderStats)

    const [sortBy, setSortBy] = useState<'profit' | 'shares'>('shares')

    useEffect(() => {
      if (sortBy === 'profit' && contractMetricsByProfit === undefined) {
        getContractMetricsForContractId(contractId, db, sortBy).then(
          setContractMetricsByProfit
        )
      }
    }, [contractId, contractMetricsByProfit, sortBy])

    const [positiveProfitPositions, negativeProfitPositions] = useMemo(() => {
      const [positiveProfitPositions, negativeProfitPositions] = partition(
        contractMetricsByProfit ?? [],
        (cm) => cm.profit > 0
      )
      return [positiveProfitPositions, negativeProfitPositions.reverse()]
    }, [contractMetricsByProfit])

    const [livePositionsLimit, setLivePositionsLimit] = useState(100)
    const positions =
      useContractMetrics(contractId, livePositionsLimit, outcomes) ??
      props.positions

    const yesPositionsSorted =
      sortBy === 'shares' ? positions.YES ?? [] : positiveProfitPositions
    const noPositionsSorted =
      sortBy === 'shares' ? positions.NO ?? [] : negativeProfitPositions
    useEffect(() => {
      // Let's use firebase here as supabase can be slightly out of date, leading to incorrect counts
      getTotalContractMetricsCount(contractId).then(setTotalPositions)

      // This still uses supabase
      getShareholderCountsForContractId(contractId, db).then(
        setShareholderStats
      )
    }, [positions, contractId])

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

    useEffect(() => {
      // TODO: we should switch to using supabase realtime subscription for this
      if (page === largestColumnLength / pageSize - 1) {
        setLivePositionsLimit((livePositionsLimit) => livePositionsLimit + 100)
      }
    }, [page, largestColumnLength])

    const isBinary = contract.outcomeType === 'BINARY'
    const isStonk = contract.outcomeType === 'STONK'
    const isPseudoNumeric = contract.outcomeType === 'PSEUDO_NUMERIC'

    const getPositionsTitle = (outcome: 'YES' | 'NO') => {
      return outcome === 'YES' ? (
        <span>
          <Tooltip
            text={'Approximate count, refresh to update'}
            placement={'top'}
          >
            {shareholderStats?.yesShareholders}{' '}
          </Tooltip>
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
          <Tooltip
            text={'Approximate count, refresh to update'}
            placement={'top'}
          >
            {shareholderStats?.noShareholders}{' '}
          </Tooltip>
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
      <Col className={'w-full'}>
        <Row className={'mb-2 items-center justify-end gap-2'}>
          {sortBy === 'profit' && contractMetricsByProfit === undefined && (
            <LoadingIndicator spinnerClassName={'border-ink-500'} size={'sm'} />
          )}
          <SortRow
            sort={sortBy === 'profit' ? 'profit' : 'position'}
            onSortClick={() => {
              setSortBy(sortBy === 'shares' ? 'profit' : 'shares')
              setPage(0)
            }}
          />
        </Row>

        <Row className={'gap-1 sm:gap-8'}>
          <Col className={'w-full max-w-sm gap-2'}>
            <Row className={'text-ink-500 justify-end px-2'}>
              {sortBy === 'profit' ? (
                <span className={'text-ink-500'}>Profit</span>
              ) : (
                <span>{getPositionsTitle('YES')}</span>
              )}
            </Row>
            {visibleYesPositions.map((position) => {
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
                        ? getStonkShares(
                            contract,
                            position.totalShares[outcome] ?? 0
                          ).toString()
                        : formatMoney(position.totalShares[outcome] ?? 0)
                      : formatMoney(position.profit)
                  }
                />
              )
            })}
          </Col>
          <Col className={'w-full max-w-sm gap-2'}>
            <Row className={'text-ink-500 justify-end px-2'}>
              {sortBy === 'profit' ? (
                <span className={'text-ink-500'}>Loss</span>
              ) : (
                <span>{getPositionsTitle('NO')}</span>
              )}
            </Row>
            {visibleNoPositions.map((position) => {
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
                        ? getStonkShares(
                            contract,
                            position.totalShares[outcome] ?? 0
                          ).toString()
                        : formatMoney(position.totalShares[outcome] ?? 0)
                      : formatMoney(position.profit)
                  }
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
const PositionRow = memo(function PositionRow(props: {
  position: ContractMetric
  outcome: 'YES' | 'NO'
  numberToShow: string
  currentUser: User | undefined | null
  followedUsers: string[] | undefined
}) {
  const { position, outcome, currentUser, followedUsers, numberToShow } = props
  const { userName, userUsername, userAvatarUrl } = position
  const isMobile = useIsMobile(800)

  return (
    <Row
      className={clsx(
        'border-ink-300 items-center justify-between gap-2 rounded-sm border-b p-2',
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
          <UserLink short={isMobile} name={userName} username={userUsername} />
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
        {numberToShow}
      </span>
    </Row>
  )
})
