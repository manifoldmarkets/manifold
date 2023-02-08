import { getUserByUsername, User } from 'web/lib/firebase/users'
import { useUser } from 'web/hooks/use-user'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import Custom404 from 'web/pages/404'
import React, { useMemo, useState } from 'react'
import { Page } from 'web/components/layout/page'
import { query, where } from 'firebase/firestore'
import {
  WeeklyPortfolioUpdate,
  WeeklyPortfolioUpdateOGCardProps,
} from 'common/weekly-portfolio-update'
import { Col } from 'web/components/layout/col'
import {
  GraphMode,
  PortfolioGraph,
} from 'web/components/portfolio/portfolio-value-graph'
import { useSingleValueHistoryChartViewScale } from 'web/components/charts/generic-charts'
import { coll, getValues } from 'web/lib/firebase/utils'
import { Row } from 'web/components/layout/row'
import { formatMoney } from 'common/util/format'
import { getContracts } from 'common/supabase/contracts'
import { db } from 'web/lib/supabase/db'
import { CPMMBinaryContract } from 'common/contract'
import { ProfitChangeTable } from 'web/components/daily-profit'
import clsx from 'clsx'
import { SizedContainer } from 'web/components/sized-container'
import { chunk, sum } from 'lodash'
import { UserLink } from 'web/components/widgets/user-link'
import { Title } from 'web/components/widgets/title'
import { ContractsGrid } from 'web/components/contract/contracts-grid'
import { useRecentlyBetOnContracts } from 'web/lib/supabase/bets'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { Button } from 'web/components/buttons/button'
import ArrowUpSquareIcon from 'web/lib/icons/arrow-up-square-icon'
import { getIsNative } from 'web/lib/native/is-native'
import { postMessageToNative } from 'web/components/native-message-listener'
import { copyToClipboard } from 'web/lib/util/copy'
import toast from 'react-hot-toast'
import { track } from 'web/lib/service/analytics'
import { SEO } from 'web/components/SEO'
import { ENV_CONFIG } from 'common/envs/constants'

export async function getStaticProps(props: {
  params: { username: string; rangeEndDateSlug: string }
}) {
  const { username, rangeEndDateSlug } = props.params

  const user = (await getUserByUsername(username)) ?? null
  const weeklyPortfolioUpdates = user
    ? await getValues<WeeklyPortfolioUpdate>(
        query(
          coll<WeeklyPortfolioUpdate>(`users/${user.id}/weekly-update`),
          where('rangeEndDate', '==', rangeEndDateSlug)
        )
      )
    : null
  const weeklyPortfolioUpdate = weeklyPortfolioUpdates?.[0] ?? null
  const contracts = weeklyPortfolioUpdate
    ? await getContracts(
        weeklyPortfolioUpdate.contractMetrics.map((c) => c.contractId),
        db
      )
    : null

  return {
    props: {
      user,
      weeklyPortfolioUpdateString: JSON.stringify(weeklyPortfolioUpdate),
      contractsString: JSON.stringify(contracts),
    },

    revalidate: 60, // regenerate after a minute
  }
}
const averagePointsInChunks = (points: { x: number; y: number }[]) => {
  const chunkSize = 2
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
  weeklyPortfolioUpdateString: string | null
  contractsString: string | null
}) {
  const { user, weeklyPortfolioUpdateString } = props
  const weeklyPortfolioUpdate = JSON.parse(
    weeklyPortfolioUpdateString ?? '{}'
  ) as WeeklyPortfolioUpdate
  const contracts = JSON.parse(
    props.contractsString ?? '{}'
  ) as CPMMBinaryContract[]
  const currentUser = useUser()
  const { profitPoints, contractMetrics, weeklyProfit, rangeEndDate } =
    weeklyPortfolioUpdate

  useSaveReferral(currentUser, {
    defaultReferrerUsername: user?.username,
  })
  const [graphMode, setGraphMode] = useState<GraphMode>('profit')
  const graphPoints = useMemo(() => {
    const contractMetricsSum = sum(
      contractMetrics.map((c) => c.from?.week.profit ?? 0)
    )
    const points = [] as { x: number; y: number; obj: any }[]
    const firstPointToScaleBy = profitPoints[0].y
    const portfolioPoints = profitPoints.map((p) => {
      // Squash the range by 2 times the total profit
      const possibleY = p.y - firstPointToScaleBy
      const y =
        Math.abs(possibleY - contractMetricsSum) > contractMetricsSum * 2
          ? contractMetricsSum * (possibleY < 0 ? -1 : 1)
          : possibleY
      return { x: p.x, y, obj: p }
    })

    // We could replace last point with sum of contractMetrics
    // portfolioPoints[portfolioPoints.length - 1].y = contractMetricsSum - firstPointToScaleBy
    return points.concat(portfolioPoints)
  }, [profitPoints, graphMode])

  const averagePoints = averagePointsInChunks(graphPoints)
  const graphView = useSingleValueHistoryChartViewScale()
  const { contracts: relatedMarkets, loadMore } = useRecentlyBetOnContracts(
    user?.id ?? '_'
  )

  if (!user || !weeklyPortfolioUpdateString) return <Custom404 />
  const date =
    new Date(graphPoints[0].x).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    }) +
    ' - ' +
    new Date(graphPoints[graphPoints.length - 1].x).toLocaleDateString(
      'en-US',
      {
        day: 'numeric',
      }
    )
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
        description={`${user.name} made ${formatMoney(
          weeklyProfit
        )} in the past week. See how they did it.`}
        url={`https://${ENV_CONFIG.domain}/week/${user.username}/${rangeEndDate}`.replace(
          'https://',
          ''
        )}
        basicOgProps={{
          props: ogProps,
          endpoint: 'update',
        }}
      />
      <Col className={' p-2'}>
        <Row className={'w-full items-start justify-between pb-6'}>
          <Title>
            <UserLink
              name={user.name.split(' ')[0] + `'s`}
              hideBadge={true}
              username={user.username}
            />{' '}
            {date} Profit
          </Title>
          <Button
            size={'xs'}
            color={'gray-white'}
            className={'text-indigo-700'}
            onClick={() => {
              if (getIsNative()) {
                postMessageToNative('share', {
                  title: "Share this week's performance",
                  url: window.location.href,
                })
              } else {
                copyToClipboard(window.location.href)
                toast.success('Link copied!')
                track('copy weekly update share link')
              }
            }}
          >
            <ArrowUpSquareIcon className={'h-6 w-6'} />
          </Button>
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
          <Col className={'-mt-2 w-full max-w-md'}>
            <SizedContainer fullHeight={250} mobileHeight={250}>
              {(width, height) => (
                <PortfolioGraph
                  mode={graphMode}
                  points={graphPoints}
                  width={width}
                  height={height}
                  viewScaleProps={graphView}
                />
              )}
            </SizedContainer>
          </Col>
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
