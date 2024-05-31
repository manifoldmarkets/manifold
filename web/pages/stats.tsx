import { DailyChart } from 'web/components/charts/stats'
import { Col } from 'web/components/layout/col'
import { Spacer } from 'web/components/layout/spacer'
import { Tabs } from 'web/components/layout/tabs'
import { Page } from 'web/components/layout/page'
import { Title } from 'web/components/widgets/title'
import { getStats } from 'web/lib/supabase/stats'
import { Stats } from 'common/stats'
import { PLURAL_BETS } from 'common/user'
import { capitalize, last } from 'lodash'
import { formatLargeNumber, formatMoney } from 'common/util/format'
import { formatWithCommas } from 'common/util/format'
import { SEO } from 'web/components/SEO'
import { useAdmin } from 'web/hooks/use-admin'
import Link from 'next/link'
import { linkClass } from 'web/components/widgets/site-link'
import { api } from '../lib/firebase/api'
import { Row as rowfor } from 'common/supabase/utils'
import { BonusSummary } from 'web/components/stats/bonus-summary'
import { ManaSupplySummary } from 'web/components/stats/mana-summary'
import { Row } from 'web/components/layout/row'
import { VIEW_RECORDINGS_START } from 'common/feed'

export const getStaticProps = async () => {
  try {
    const stats = await getStats()
    const manaSupplyOverTime = await api('get-mana-summary-stats', {
      limitDays: 100,
    })
    const fromBankSummary = await api('get-txn-summary-stats', {
      ignoreCategories: ['RECLAIM_MANA', 'AIR_DROP', 'EXTRA_PURCHASED_MANA'],
      fromType: 'BANK',
      limitDays: 100,
    })
    const toBankSummary = await api('get-txn-summary-stats', {
      toType: 'BANK',
      ignoreCategories: ['RECLAIM_MANA'],
      limitDays: 100,
    })
    return {
      props: { stats, fromBankSummary, toBankSummary, manaSupplyOverTime },
      revalidate: 60 * 60, // One hour
    }
  } catch (err) {
    console.error(err)
    return { props: { stats: null }, revalidate: 60 }
  }
}

export default function Analytics(props: {
  stats: Stats | null
  manaSupplyOverTime: rowfor<'mana_supply_stats'>[]
  fromBankSummary: rowfor<'txn_summary_stats'>[]
  toBankSummary: rowfor<'txn_summary_stats'>[]
}) {
  const { stats, manaSupplyOverTime, fromBankSummary, toBankSummary } = props
  if (!stats) {
    return null
  }
  return (
    <Page trackPageView={'site stats page'}>
      <SEO
        title="Stats"
        description="See site-wide usage statistics."
        url="/stats"
      />
      <CustomAnalytics
        stats={stats}
        manaSupplyOverTime={manaSupplyOverTime}
        fromBankSummary={fromBankSummary}
        toBankSummary={toBankSummary}
      />
    </Page>
  )
}

export function CustomAnalytics(props: {
  stats: Stats
  manaSupplyOverTime: rowfor<'mana_supply_stats'>[]
  fromBankSummary: rowfor<'txn_summary_stats'>[]
  toBankSummary: rowfor<'txn_summary_stats'>[]
}) {
  const {
    dailyActiveUsers,
    dailyActiveUsersWeeklyAvg,
    dailySales,
    salesWeeklyAvg,
    monthlySales,
    weeklyActiveUsers,
    monthlyActiveUsers,
    engagedUsers,
    d1,
    d1WeeklyAvg,
    nd1,
    nd1WeeklyAvg,
    fracDaysActiveD1ToD3,
    fracDaysActiveD1ToD3Avg7d,
    nw1,
    dailyBetCounts,
    dailyContractCounts,
    dailyCommentCounts,
    weekOnWeekRetention,
    monthlyRetention,
    dailyActivationRate,
    dailyActivationRateWeeklyAvg,
    manaBetDaily,
    manaBetWeekly,
    manaBetMonthly,
    dailyNewRealUserSignups,
    d1BetAverage,
    d1Bet3DayAverage,
    feedConversionScores,
  } = props.stats

  const { manaSupplyOverTime, fromBankSummary, toBankSummary } = props

  const manaSupply = last(manaSupplyOverTime)!
  const startDate = props.stats.startDate[0]

  const dailyDividedByWeekly = dailyActiveUsers.map(
    (dailyActive, i) => dailyActive / weeklyActiveUsers[i]
  )
  const dailyDividedByMonthly = dailyActiveUsers.map(
    (dailyActive, i) => dailyActive / monthlyActiveUsers[i]
  )
  const weeklyDividedByMonthly = weeklyActiveUsers.map(
    (weeklyActive, i) => weeklyActive / monthlyActiveUsers[i]
  )

  const currentDAUs = dailyActiveUsers[dailyActiveUsers.length - 1]
  const avgDAUs =
    dailyActiveUsersWeeklyAvg[dailyActiveUsersWeeklyAvg.length - 1]
  const last30dSales = dailySales.slice(-30).reduce((a, b) => a + b, 0)

  const currentEngaged = engagedUsers[engagedUsers.length - 1]
  const isAdmin = useAdmin()

  return (
    <Col className="px-4 sm:pl-6 sm:pr-16">
      <Title>Active users</Title>
      <p className="text-ink-500">
        An active user is a user who has traded in, commented on, or created a
        question.
      </p>
      <div className="text-ink-500 mt-2">
        <b>{formatLargeNumber(currentDAUs)} DAUs</b> yesterday;{' '}
        {formatLargeNumber(avgDAUs)} avg DAUs last week
      </div>
      <Spacer h={4} />

      <Tabs
        className="mb-4"
        defaultIndex={1}
        tabs={[
          {
            title: 'Daily',
            content: (
              <DailyChart
                dailyValues={dailyActiveUsers}
                startDate={startDate}
              />
            ),
          },
          {
            title: 'Daily (7d avg)',
            content: (
              <DailyChart
                dailyValues={dailyActiveUsersWeeklyAvg.map(Math.round)}
                startDate={startDate}
              />
            ),
          },
          {
            title: 'Weekly',
            content: (
              <DailyChart
                dailyValues={weeklyActiveUsers}
                startDate={startDate}
              />
            ),
          },
          {
            title: 'Monthly',
            content: (
              <DailyChart
                dailyValues={monthlyActiveUsers}
                startDate={startDate}
              />
            ),
          },
        ]}
      />

      <Spacer h={8} />

      <Title>Engaged users</Title>
      <p className="text-ink-500">
        An engaged user is a user who has traded in, commented on, or created a
        question on at least 2 out of 7 days in each of the past 3 weeks.
      </p>
      <div className="text-ink-500 mt-2">
        <b>{formatLargeNumber(currentEngaged)} </b> engaged users
      </div>
      <Spacer h={4} />

      <DailyChart dailyValues={engagedUsers} startDate={startDate} />
      <Spacer h={8} />

      <Title>Mana supply</Title>
      <Col className="mb-6 max-w-sm gap-2">
        Supply Today
        <Row className="justify-between">
          <div className="text-ink-700">Balances</div>
          <div className="text-ink-700 font-semibold">
            {formatMoney(manaSupply.balance)}
          </div>
        </Row>
        <Row className="justify-between">
          <div className="text-ink-700">Prize point balances</div>
          <div className="text-ink-700 font-semibold">
            ₽{formatWithCommas(manaSupply.spice_balance)}
          </div>
        </Row>
        <Row className="justify-between">
          <div className="text-ink-700">Investment</div>
          <div className="text-ink-700 font-semibold">
            {formatMoney(manaSupply.investment_value)}
          </div>
        </Row>
        {/* <Row className="justify-between">
          <div className="text-ink-700">Loans</div>
          <div className="text-ink-700 font-semibold">
            {formatMoney(manaSupply.loanTotal)}
          </div>
        </Row> */}
        <Row className="justify-between">
          <div className="text-ink-700">AMM liquidity</div>
          <div className="text-ink-700 font-semibold">
            {formatMoney(manaSupply.amm_liquidity)}
          </div>
        </Row>
        <Row className="mt-6 justify-between">
          <div className="text-ink-700">Total</div>
          <div className="text-ink-700 font-semibold">
            {formatMoney(manaSupply.total_value)}
          </div>
        </Row>
      </Col>

      <Title>Mana supply over time</Title>
      <ManaSupplySummary manaSupplyStats={manaSupplyOverTime} />

      <Spacer h={8} />
      <Title>Transactions from Manifold</Title>
      <BonusSummary txnSummaryStats={fromBankSummary} />

      <Spacer h={8} />

      <Title>Transactions to Manifold</Title>
      <span className={'text-ink-700'}>(Ignores mana purchases)</span>
      <BonusSummary txnSummaryStats={toBankSummary} />
      <Spacer h={8} />

      <Title>Mana sales</Title>

      <p className="text-ink-500">
        <b>${formatWithCommas(last30dSales)}</b> of mana sold in the last 30d
      </p>

      <Spacer h={4} />

      <Tabs
        className="mb-4"
        defaultIndex={0}
        tabs={[
          {
            title: 'Daily',
            content: (
              <DailyChart dailyValues={dailySales} startDate={startDate} />
            ),
          },
          {
            title: 'Daily (7d avg)',
            content: (
              <DailyChart
                dailyValues={salesWeeklyAvg.map(Math.round)}
                startDate={startDate}
              />
            ),
          },
          {
            title: 'Monthly',
            content: (
              <DailyChart
                dailyValues={monthlySales.map(Math.round)}
                startDate={startDate}
              />
            ),
          },
        ]}
      />
      <Spacer h={8} />

      <Title>Retention</Title>
      <p className="text-ink-500">
        What fraction of active users are still active after the given time
        period?
      </p>
      <Tabs
        className="mb-4"
        defaultIndex={1}
        tabs={[
          {
            title: 'D1',
            content: (
              <DailyChart
                dailyValues={d1}
                startDate={startDate}
                excludeFirstDays={1}
                pct
              />
            ),
          },
          {
            title: 'D1 (7d avg)',
            content: (
              <DailyChart
                dailyValues={d1WeeklyAvg}
                startDate={startDate}
                excludeFirstDays={7}
                pct
              />
            ),
          },
          {
            title: 'W1',
            content: (
              <DailyChart
                dailyValues={weekOnWeekRetention}
                startDate={startDate}
                excludeFirstDays={14}
                pct
              />
            ),
          },
          {
            title: 'M1',
            content: (
              <DailyChart
                dailyValues={monthlyRetention}
                startDate={startDate}
                excludeFirstDays={60}
                pct
              />
            ),
          },
        ]}
      />

      <Spacer h={8} />
      <Title>New user retention</Title>
      <p className="text-ink-500">
        What fraction of new users are still active after the given time period?
      </p>
      <Spacer h={4} />

      <Tabs
        className="mb-4"
        defaultIndex={1}
        tabs={[
          {
            title: 'ND1',
            content: (
              <DailyChart
                dailyValues={nd1}
                startDate={startDate}
                excludeLastDays={1}
                pct
              />
            ),
          },
          {
            title: 'ND1 (7d avg)',
            content: (
              <DailyChart
                dailyValues={nd1WeeklyAvg}
                startDate={startDate}
                excludeFirstDays={7}
                excludeLastDays={1}
                pct
              />
            ),
          },
          {
            title: 'Active days D1-D3',
            content: (
              <DailyChart
                dailyValues={fracDaysActiveD1ToD3}
                startDate={startDate}
                excludeLastDays={3}
                pct
              />
            ),
          },
          {
            title: 'Active days D1-D3 (7d avg)',
            content: (
              <DailyChart
                dailyValues={fracDaysActiveD1ToD3Avg7d}
                startDate={startDate}
                excludeLastDays={3}
                pct
              />
            ),
          },
          {
            title: 'NW1',
            content: (
              <DailyChart
                dailyValues={nw1}
                startDate={startDate}
                excludeFirstDays={14}
                pct
              />
            ),
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
            title: capitalize(PLURAL_BETS),
            content: (
              <DailyChart dailyValues={dailyBetCounts} startDate={startDate} />
            ),
          },
          {
            title: 'Questions created',
            content: (
              <DailyChart
                dailyValues={dailyContractCounts}
                startDate={startDate}
              />
            ),
          },
          {
            title: 'Comments',
            content: (
              <DailyChart
                dailyValues={dailyCommentCounts}
                startDate={startDate}
              />
            ),
          },
          {
            title: 'Signups',
            content: (
              <DailyChart
                dailyValues={dailyNewRealUserSignups}
                startDate={startDate}
              />
            ),
          },
        ]}
      />

      <Spacer h={8} />

      <Title>Activation rate</Title>
      <p className="text-ink-500">
        Out of all new users, how many placed at least one bet?
      </p>
      <Spacer h={4} />

      <Tabs
        className="mb-4"
        defaultIndex={1}
        tabs={[
          {
            title: 'Daily',
            content: (
              <DailyChart
                dailyValues={dailyActivationRate}
                startDate={startDate}
                excludeFirstDays={1}
                pct
              />
            ),
          },
          {
            title: 'Daily (7d avg)',
            content: (
              <DailyChart
                dailyValues={dailyActivationRateWeeklyAvg}
                startDate={startDate}
                excludeFirstDays={7}
                pct
              />
            ),
          },
        ]}
      />
      <Spacer h={8} />
      <Title>D1 average new user bets</Title>
      <p className="text-ink-500">
        On average for new users, how many bets did they place in the first 24
        hours?
      </p>
      {isAdmin && (
        <Link className={linkClass} href={'/admin/journeys'}>
          Check out the new user journerys page to see what they did.
        </Link>
      )}
      <Spacer h={4} />

      <Tabs
        className="mb-4"
        defaultIndex={1}
        tabs={[
          {
            title: 'Daily',
            content: (
              <DailyChart
                dailyValues={d1BetAverage}
                startDate={startDate}
                excludeFirstDays={1}
              />
            ),
          },
          {
            title: 'Daily (3d average)',
            content: (
              <DailyChart
                dailyValues={d1Bet3DayAverage}
                startDate={startDate}
                excludeFirstDays={1}
              />
            ),
          },
        ]}
      />
      <Spacer h={8} />

      <Title>Ratio of Active Users</Title>
      <Tabs
        className="mb-4"
        defaultIndex={1}
        tabs={[
          {
            title: 'Daily / Weekly',
            content: (
              <DailyChart
                dailyValues={dailyDividedByWeekly}
                startDate={startDate}
                excludeFirstDays={7}
                pct
              />
            ),
          },
          {
            title: 'Daily / Monthly',
            content: (
              <DailyChart
                dailyValues={dailyDividedByMonthly}
                startDate={startDate}
                excludeFirstDays={30}
                pct
              />
            ),
          },
          {
            title: 'Weekly / Monthly',
            content: (
              <DailyChart
                dailyValues={weeklyDividedByMonthly}
                startDate={startDate}
                excludeFirstDays={30}
                pct
              />
            ),
          },
        ]}
      />
      <Spacer h={8} />

      <Title>Total mana bet</Title>
      <p className="text-ink-500">
        Sum of bet amounts. (Divided by 100 to be more readable.)
      </p>
      <Tabs
        className="mb-4"
        defaultIndex={1}
        tabs={[
          {
            title: 'Daily',
            content: (
              <DailyChart dailyValues={manaBetDaily} startDate={startDate} />
            ),
          },
          {
            title: 'Weekly',
            content: (
              <DailyChart dailyValues={manaBetWeekly} startDate={startDate} />
            ),
          },
          {
            title: 'Monthly',
            content: (
              <DailyChart dailyValues={manaBetMonthly} startDate={startDate} />
            ),
          },
        ]}
      />
      <Spacer h={8} />
      <Title>Home feed conversion rate</Title>
      <p className="text-ink-500">Interactions/views</p>
      <Tabs
        className="mb-4"
        defaultIndex={0}
        tabs={[
          {
            title: 'Daily',
            content: (
              <DailyChart
                dailyValues={feedConversionScores}
                startDate={VIEW_RECORDINGS_START}
                pct
              />
            ),
          },
        ]}
      />
      <Spacer h={8} />
    </Col>
  )
}
