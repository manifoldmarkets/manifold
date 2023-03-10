import clsx from 'clsx'
import { CPMMBinaryContract } from 'common/contract'
import { ENV_CONFIG } from 'common/envs/constants'
import { PortfolioMetrics } from 'common/portfolio-metrics'
import { getContracts } from 'common/supabase/contracts'
import { getPortfolioHistory } from 'common/supabase/portfolio-metrics'
import { formatMoney, formatMoneyNumber } from 'common/util/format'
import { DAY_MS } from 'common/util/time'
import {
  WeeklyPortfolioUpdate,
  WeeklyPortfolioUpdateOGCardProps,
} from 'common/weekly-portfolio-update'
import { query, where } from 'firebase/firestore'
import { chunk, orderBy, sortBy, sum } from 'lodash'
import React, { useMemo } from 'react'
import { CopyLinkButton } from 'web/components/buttons/copy-link-button'
import {
  HistoryPoint,
  useSingleValueHistoryChartViewScale,
} from 'web/components/charts/generic-charts'
import { ContractsGrid } from 'web/components/contract/contracts-grid'
import { ProfitChangeTable } from 'web/components/daily-profit'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { PortfolioGraph } from 'web/components/portfolio/portfolio-value-graph'
import { SEO } from 'web/components/SEO'
import { SizedContainer } from 'web/components/sized-container'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { Title } from 'web/components/widgets/title'
import { UserLink } from 'web/components/widgets/user-link'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { useUser } from 'web/hooks/use-user'
import { getUserByUsername, User } from 'web/lib/firebase/users'
import { coll, getValues } from 'web/lib/firebase/utils'
import { useRecentlyBetOnContracts } from 'web/lib/supabase/bets'
import { db } from 'web/lib/supabase/db'
import Custom404 from 'web/pages/404'

export async function getStaticProps(props: {
  params: { username: string; rangeEndDateSlug: string }
}) {
  const { username, rangeEndDateSlug } = props.params

  const user = (await getUserByUsername(username)) ?? null
  const weeklyPortfolioUpdates = user
    ? await getValues<WeeklyPortfolioUpdate>(
        query(
          coll<WeeklyPortfolioUpdate>(`users/${user.id}/weekly-update`),
          where('rangeEndDateSlug', '==', rangeEndDateSlug)
        )
      )
    : null
  const weeklyPortfolioUpdate = weeklyPortfolioUpdates
    ? orderBy(weeklyPortfolioUpdates, (u) => -(u.createdTime ?? 0))[0]
    : null
  const end = weeklyPortfolioUpdate?.createdTime
    ? weeklyPortfolioUpdate?.createdTime
    : new Date(rangeEndDateSlug).valueOf()
  const start = end - 7 * DAY_MS
  const profitPoints =
    weeklyPortfolioUpdate && user
      ? await getPortfolioHistory(user.id, start, db, end).then(
          (portfolioHistory) => {
            return portfolioHistory?.map((p) => ({
              x: p.timestamp,
              y: p.balance + p.investmentValue - p.totalDeposits,
              obj: p,
            }))
          }
        )
      : []
  const contracts = weeklyPortfolioUpdate
    ? await getContracts(
        weeklyPortfolioUpdate.contractMetrics.map((c) => c.contractId),
        db
      )
    : null

  return {
    props: {
      user,
      profitPoints: sortBy(profitPoints, (p) => -p.x),
      weeklyPortfolioUpdateString:
        JSON.stringify(weeklyPortfolioUpdate) ?? '{}',
      contractsString: JSON.stringify(contracts),
    },

    revalidate: 60 * 60, // regenerate after an hour
  }
}
const averagePointsInChunks = (points: { x: number; y: number }[]) => {
  // Smaller chunks sizes may result in the og image not working bc the url is too long
  const chunkSize = 3
  const chunks = chunk(points, chunkSize)
  return chunks.map((c) => {
    const sumY = sum(c.map((p) => p.y))
    const avgY = sumY / chunkSize
    return { x: c[0].x, y: avgY }
  })
}

export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}

export default function RangePerformancePage(props: {
  user: User | null
  weeklyPortfolioUpdateString: string
  contractsString: string
  profitPoints: HistoryPoint<Partial<PortfolioMetrics>>[]
}) {
  const { user, weeklyPortfolioUpdateString, profitPoints } = props
  const weeklyPortfolioUpdate = JSON.parse(
    weeklyPortfolioUpdateString
  ) as WeeklyPortfolioUpdate
  const contracts = JSON.parse(props.contractsString) as CPMMBinaryContract[]
  const currentUser = useUser()
  useSaveReferral(currentUser, {
    defaultReferrerUsername: user?.username,
  })
  const graphView = useSingleValueHistoryChartViewScale()
  const { contracts: relatedMarkets, loadMore } = useRecentlyBetOnContracts(
    user?.id ?? '_'
  )

  if (!user || !weeklyPortfolioUpdate || !weeklyPortfolioUpdate.weeklyProfit)
    return <Custom404 />

  const { contractMetrics, weeklyProfit, rangeEndDateSlug, createdTime } =
    weeklyPortfolioUpdate

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const graphPoints = useMemo(() => {
    if (profitPoints.length === 0) return []
    const firstPointToScaleBy = profitPoints[0]?.y ?? 0
    return profitPoints.map((p) => {
      const y = p.y - firstPointToScaleBy
      return { x: p.x, y, obj: p.obj }
    })
  }, [profitPoints])

  const endDate = createdTime ? new Date(createdTime) : new Date()
  const startDate = endDate.getTime() - 7 * DAY_MS
  const date =
    new Date(startDate).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    }) +
    ' - ' +
    endDate.toLocaleDateString('en-US', {
      day: 'numeric',
    })
  const averagePoints = averagePointsInChunks(graphPoints)
  const ogProps = {
    points: JSON.stringify(averagePoints),
    weeklyProfit: weeklyProfit.toString(),
    creatorUsername: user.username,
    creatorAvatarUrl: user.avatarUrl,
    creatorName: user.name,
  } as WeeklyPortfolioUpdateOGCardProps
  return (
    <Page>
      <SEO
        title={date + ' profit for ' + user.name}
        description={`${user.name} made M$${formatMoneyNumber(
          weeklyProfit
        )} in the past week. See how they did it.`}
        url={`/week/${user.username}/${rangeEndDateSlug}`}
        ogProps={{ props: ogProps, endpoint: 'update' }}
      />
      <Col className={'p-2'}>
        <Row className={'w-full items-start justify-between pb-6'}>
          <Title>
            <UserLink
              name={user.name.split(' ')[0] + `'s`}
              hideBadge={true}
              username={user.username}
            />{' '}
            {date} Profit
          </Title>
          <CopyLinkButton
            url={`https://${ENV_CONFIG.domain}/week/${user.username}/${rangeEndDateSlug}`}
            linkIconOnlyProps={{ tooltip: 'Copy link to this week' }}
          />
        </Row>

        <Col className={'relative w-full items-center justify-center'}>
          <span
            className={clsx(
              'text-5xl',
              weeklyProfit > 0 ? 'text-teal-500' : 'text-scarlet-500'
            )}
          >
            {formatMoney(weeklyProfit)}
          </span>
        </Col>
        <Col className={'items-center justify-center'}>
          {graphPoints.length > 0 && (
            <Col className={'-mt-2 w-full max-w-md'}>
              <SizedContainer fullHeight={250} mobileHeight={250}>
                {(width, height) => (
                  <PortfolioGraph
                    mode="profit"
                    points={graphPoints}
                    width={width}
                    height={height}
                    viewScaleProps={graphView}
                  />
                )}
              </SizedContainer>
            </Col>
          )}
          <Col className={'my-6 '}>
            <ProfitChangeTable
              contracts={contracts}
              metrics={contractMetrics}
              from={'week'}
              rowsPerSection={3}
              showPagination={false}
            />
          </Col>
        </Col>
        <Title children="Also betting on" />
        {relatedMarkets ? (
          <ContractsGrid
            contracts={relatedMarkets ?? []}
            trackingPostfix=" weekly update related"
            loadMore={loadMore}
          />
        ) : (
          <LoadingIndicator />
        )}
      </Col>
    </Page>
  )
}
