import clsx from 'clsx'
import { HistoryPoint } from 'common/chart'
import { CPMMBinaryContract } from 'common/contract'
import { ContractMetric } from 'common/contract-metric'
import { ENV_CONFIG } from 'common/envs/constants'
import { PortfolioMetrics } from 'common/portfolio-metrics'
import { getContracts } from 'common/supabase/contracts'
import { getPortfolioHistory } from 'common/supabase/portfolio-metrics'
import { tsToMillis } from 'common/supabase/utils'
import { formatMoney, formatMoneyNumber } from 'common/util/format'
import { DAY_MS } from 'common/util/time'
import {
  WeeklyPortfolioUpdate,
  WeeklyPortfolioUpdateOGCardProps,
} from 'common/weekly-portfolio-update'
import { chunk, sortBy, sum } from 'lodash'
import { useMemo } from 'react'
import { CopyLinkOrShareButton } from 'web/components/buttons/copy-link-button'
import { ContractsGrid } from 'web/components/contract/contracts-grid'
import { ProfitChangeTable } from 'web/components/home/daily-profit'
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
import { useRecentlyBetOnContracts } from 'web/lib/supabase/bets'
import { db } from 'web/lib/supabase/db'
import { DisplayUser, getUserByUsername } from 'web/lib/supabase/users'
import Custom404 from 'web/pages/404'

export async function getStaticProps(props: {
  params: { username: string; rangeEndDateSlug: string }
}) {
  const { username, rangeEndDateSlug } = props.params

  const user = (await getUserByUsername(username)) ?? null

  const weeklyPortfolioUpdates = user
    ? (
        await db
          .from('weekly_update')
          .select()
          .eq('user_id', user?.id)
          .eq('range_end', rangeEndDateSlug)
          .order('created_time', { ascending: false })
          .limit(1)
      ).data
    : null

  const weeklyPortfolioUpdate = weeklyPortfolioUpdates?.[0]
  const { created_time, contract_metrics } = weeklyPortfolioUpdate ?? {}
  const end = created_time
    ? tsToMillis(created_time)
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
        (contract_metrics as ContractMetric[]).map((c) => c.contractId),
        db
      )
    : null

  return {
    props: {
      user,
      profitPoints: sortBy(profitPoints, (p) => p.x),
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
  user: DisplayUser | null
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
    <Page
      trackPageView={'weekly portfolio update page'}
      trackPageProps={{ username: user.username }}
    >
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
            <UserLink user={user} hideBadge={true} /> {date} Profit
          </Title>
          <CopyLinkOrShareButton
            url={`https://${ENV_CONFIG.domain}/week/${user.username}/${rangeEndDateSlug}`}
            tooltip="Copy link to this week"
            eventTrackingName={'copy weekly profit link'}
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
            <SizedContainer className="h-[250px] w-full max-w-md">
              {(width, height) => (
                <PortfolioGraph
                  mode="profit"
                  points={graphPoints}
                  width={width}
                  height={height}
                />
              )}
            </SizedContainer>
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
        <Title>Also betting on</Title>
        {relatedMarkets ? (
          <ContractsGrid
            contracts={relatedMarkets}
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
