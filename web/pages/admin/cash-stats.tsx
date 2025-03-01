import { DailyChart } from 'web/components/charts/stats'
import { Col } from 'web/components/layout/col'
import { Spacer } from 'web/components/layout/spacer'
import { Tabs } from 'web/components/layout/tabs'
import { Page } from 'web/components/layout/page'
import { Title } from 'web/components/widgets/title'
import { getStats } from 'web/lib/supabase/stats'
import { sum } from 'lodash'
import { formatLargeNumber, formatSweepies } from 'common/util/format'
import { SEO } from 'web/components/SEO'
import { type Row } from 'common/supabase/utils'
import { average } from 'common/util/math'
export const getStaticProps = async () => {
  try {
    const stats = await getStats('2024-09-16')
    return {
      props: {
        stats,
      },
      revalidate: 60 * 60, // One hour
    }
  } catch (err) {
    console.error(err)
    return { props: { stats: null }, revalidate: 60 }
  }
}

export default function CashStats(props: { stats: Row<'daily_stats'>[] }) {
  const { stats } = props

  if (!stats) {
    return null
  }

  return (
    <Page trackPageView={'cash stats page'}>
      <SEO
        title="Sweepcash Stats"
        description="See sweepcash trading statistics."
        url="/cash-stats"
      />
      <CustomCashAnalytics stats={stats} />
    </Page>
  )
}

export function CustomCashAnalytics(props: { stats: Row<'daily_stats'>[] }) {
  const { stats } = props

  const dataFor = (key: keyof Row<'daily_stats'>) =>
    stats
      .map((row) => ({ x: row.start_date, y: Number(row[key]) }))
      .filter((row) => !isNaN(row.y))

  const current = stats[stats.length - 1]
  const avgDAUlastWeek = average(
    stats
      .slice(-7)
      .map((row) => row.cash_dau)
      .filter((val): val is number => val != null)
  )
  const last30dCashTrades = sum(
    stats.slice(-30).map((row) => row.cash_bet_amount || 0)
  )

  return (
    <Col className="px-4 sm:pl-6 sm:pr-16">
      <Title>Active traders</Title>
      <p className="text-ink-500">
        An active trader is a user who has traded in, commented on, or created a
        sweep cash question.
      </p>
      <div className="text-ink-500 mt-2">
        <b>{formatLargeNumber(current.cash_dau ?? 0)}</b> yesterday;{' '}
        {formatLargeNumber(avgDAUlastWeek)} avg last week
      </div>
      <Spacer h={4} />
      <Tabs
        className="mb-4"
        defaultIndex={1}
        tabs={[
          {
            title: 'Daily',
            content: <DailyChart values={dataFor('cash_dau')} />,
          },
          {
            title: 'Daily (7d avg)',
            content: (
              <DailyChart
                values={rollingAvg(dataFor('cash_dau'), 7).map(round)}
              />
            ),
          },
          {
            title: 'Weekly',
            content: <DailyChart values={dataFor('cash_wau')} />,
          },
          {
            title: 'Monthly',
            content: <DailyChart values={dataFor('cash_mau')} />,
          },
        ]}
      />
      <Spacer h={8} />

      <Title>Daily activity</Title>
      <Tabs
        className="mb-4"
        defaultIndex={0}
        tabs={[
          {
            title: 'Trades',
            content: <DailyChart values={dataFor('cash_bet_count')} />,
          },
          {
            title: 'Questions created',
            content: <DailyChart values={dataFor('cash_contract_count')} />,
          },
          {
            title: 'Comments',
            content: <DailyChart values={dataFor('cash_comment_count')} />,
          },
        ]}
      />
      <Spacer h={8} />

      <Title>Retention</Title>
      <p className="text-ink-500">
        What fraction of active traders are still active after the given time
        period?
      </p>
      <Tabs
        className="mb-4"
        defaultIndex={1}
        tabs={[
          {
            title: 'D1',
            content: <DailyChart values={dataFor('cash_d1')} pct />,
          },
          {
            title: 'D1 (7d avg)',
            content: (
              <DailyChart values={rollingAvg(dataFor('cash_d1'), 7)} pct />
            ),
          },
          {
            title: 'W1',
            content: <DailyChart values={dataFor('cash_w1')} pct />,
          },
          {
            title: 'M1',
            content: <DailyChart values={dataFor('cash_m1')} pct />,
          },
        ]}
      />
      <Spacer h={8} />

      <Title>Total sweepcash traded</Title>
      <p className="text-ink-500">
        <b>{formatSweepies(last30dCashTrades)}</b> of sweepcash traded in the
        last 30d
      </p>
      <Tabs
        className="mb-4"
        defaultIndex={1}
        tabs={[
          {
            title: 'Daily',
            content: <DailyChart values={dataFor('cash_bet_amount')} />,
          },
          {
            title: 'Weekly',
            content: (
              <DailyChart values={rollingSum(dataFor('cash_bet_amount'), 7)} />
            ),
          },
          {
            title: 'Monthly',
            content: (
              <DailyChart values={rollingSum(dataFor('cash_bet_amount'), 30)} />
            ),
          },
        ]}
      />
      <Spacer h={8} />

      <Title>Sweepcash issued</Title>
      <p className="text-ink-500">
        Sweepcash bonus issued from mana sales
        <br />
      </p>
      <Spacer h={4} />
      <Tabs
        className="mb-4"
        defaultIndex={1}
        tabs={[
          {
            title: 'Daily',
            content: <DailyChart values={dataFor('cash_sales')} />,
          },
          {
            title: 'Daily (7d avg)',
            content: (
              <DailyChart
                values={rollingAvg(dataFor('cash_sales'), 7).map(round)}
              />
            ),
          },
          {
            title: 'Monthly',
            content: (
              <DailyChart values={rollingSum(dataFor('cash_sales'), 30)} />
            ),
          },
        ]}
      />
      <Spacer h={8} />
    </Col>
  )
}

const rollingSum = (arr: { x: string; y: number }[], period: number) =>
  arr.map(({ x }, i) => {
    const start = Math.max(0, i - period + 1)
    const end = i + 1
    const values = arr.slice(start, end).map((d) => d.y ?? 0)
    const total = sum(values)
    // scale to make up for holes or missing data at the start
    const adjusted =
      values.length == period ? total : (total * period) / values.length
    return { x, y: adjusted }
  })

const rollingAvg = (arr: { x: string; y: number }[], period: number) =>
  arr.map(({ x }, i) => {
    const start = Math.max(0, i - period + 1)
    const end = i + 1
    const values = arr.slice(start, end).map((d) => d.y ?? 0)
    return { x, y: values.length ? average(values) : 0 }
  })

const round = (point: { x: string; y: number }) => ({
  x: point.x,
  y: Math.round(point.y),
})
