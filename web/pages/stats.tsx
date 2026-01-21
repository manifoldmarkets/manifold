import { DailyChart } from 'web/components/charts/stats'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Spacer } from 'web/components/layout/spacer'
import { Tabs } from 'web/components/layout/tabs'
import { Page } from 'web/components/layout/page'
import { Title } from 'web/components/widgets/title'
import { getStats } from 'web/lib/supabase/stats'
import { orderBy, sum, sumBy, uniq } from 'lodash'
import { formatLargeNumber, formatMoney } from 'common/util/format'
import { formatWithCommas } from 'common/util/format'
import { SEO } from 'web/components/SEO'
import { useAdmin } from 'web/hooks/use-admin'
import Link from 'next/link'
import { linkClass } from 'web/components/widgets/site-link'
import { api } from '../lib/api/api'
import { Column, Row as rowfor } from 'common/supabase/utils'
import { BonusSummary } from 'web/components/stats/bonus-summary'
import { ManaSupplySummary } from 'web/components/stats/mana-summary'
import { average } from 'common/util/math'
import { useCallback, useState } from 'react'
import { Button } from 'web/components/buttons/button'
import {
  MANA_PURCHASE_RATE_CHANGE_DATE,
  MANA_PURCHASE_RATE_REVERT_DATE,
  TRADE_TERM,
  TRADED_TERM,
} from 'common/envs/constants'
import { capitalize, partition } from 'lodash'
import { formatTimeShort } from 'client-common/lib/time'
import { InfoTooltip } from 'web/components/widgets/info-tooltip'
import { TopicDauSummary } from 'web/components/stats/topic-dau-summary'
import { Contract, contractPath } from 'common/contract'
import { ContractStatusLabel } from 'web/components/contract/contracts-table'
import { UserIcon, EyeIcon } from '@heroicons/react/solid'

export const getStaticProps = async () => {
  try {
    const [
      stats,
      manaSupplyOverTime,
      fromBankSummary,
      toBankSummary,
      activeUserManaStats,
      topMarketsYesterday,
      shopStats,
    ] = await Promise.all([
      getStats(),
      api('get-mana-summary-stats', { limitDays: 100 }),
      api('get-txn-summary-stats', {
        ignoreCategories: ['RECLAIM_MANA', 'AIR_DROP', 'EXTRA_PURCHASED_MANA'],
        fromType: 'BANK',
        limitDays: 100,
      }),
      api('get-txn-summary-stats', {
        toType: 'BANK',
        ignoreCategories: ['RECLAIM_MANA'],
        limitDays: 100,
      }),
      api('get-active-user-mana-stats', { limitDays: 100 }),
      api('get-top-markets-yesterday', {}),
      api('get-shop-stats', { limitDays: 100 }),
    ])

    return {
      props: {
        stats,
        fromBankSummary,
        toBankSummary,
        manaSupplyOverTime,
        activeUserManaStats,
        topMarketsYesterday,
        shopStats,
        totalRedeemable: 0,
      },
      revalidate: 60 * 60, // One hour
    }
  } catch (err) {
    console.error(err)
    return { props: { stats: null }, revalidate: 60 }
  }
}

type ActiveUserManaStats = {
  date: string
  activeBalance: number
}

type TopMarketsYesterdayData = {
  topByTraders: { contract: Contract; tradersYesterday: number }[]
  topByViews: { contract: Contract; viewsYesterday: number }[]
}

type ShopStats = {
  subscriptionSales: {
    date: string
    itemId: string
    quantity: number
    revenue: number
  }[]
  digitalGoodsSales: {
    date: string
    itemId: string
    quantity: number
    revenue: number
  }[]
  subscribersByTier: {
    tier: 'basic' | 'plus' | 'premium'
    count: number
    autoRenewCount: number
  }[]
  subscriptionsOverTime: {
    date: string
    basicCount: number
    plusCount: number
    premiumCount: number
    totalCount: number
  }[]
}

export default function Analytics(props: {
  stats: rowfor<'daily_stats'>[]
  manaSupplyOverTime: rowfor<'mana_supply_stats'>[]
  fromBankSummary: rowfor<'txn_summary_stats'>[]
  toBankSummary: rowfor<'txn_summary_stats'>[]
  activeUserManaStats: ActiveUserManaStats[]
  topMarketsYesterday?: TopMarketsYesterdayData
  shopStats?: ShopStats
  totalRedeemable: number
}) {
  const {
    stats,
    manaSupplyOverTime,
    fromBankSummary,
    toBankSummary,
    activeUserManaStats,
    topMarketsYesterday,
    shopStats,
  } = props

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
        activeUserManaStats={activeUserManaStats}
        topMarketsYesterday={topMarketsYesterday}
        shopStats={shopStats}
      />
    </Page>
  )
}

function ActivityTab(props: {
  stats: rowfor<'daily_stats'>[]
  setStats: (stats: rowfor<'daily_stats'>[]) => void
  topMarketsYesterday?: TopMarketsYesterdayData
}) {
  const { stats, setStats, topMarketsYesterday } = props
  const dataFor = useCallback(dataForStats(stats), [stats])
  const current = stats[stats.length - 1]
  const avgDAUlastWeek = average(
    stats
      .slice(-7)
      .map((row) => row.dau)
      .filter((val): val is number => val != null)
  )
  const avgDAVlastWeek = average(
    stats
      .slice(-7)
      .map((row) => row.dav)
      .filter((val): val is number => val != null)
  )
  const isAdmin = useAdmin()
  const fracDaysActiveD1ToD3 = dataFor('active_d1_to_d3')
  const fracDaysActiveD1ToD3Avg7d = rollingAvg(
    dataFor('active_d1_to_d3'),
    7
  ).slice(7)
  const dailyDividedByWeekly = stats
    .filter((row) => row.dau && row.wau)
    .map((row) => ({ x: row.start_date, y: row.dau! / row.wau! }))
  const dailyDividedByMonthly = stats
    .filter((row) => row.dau && row.mau)
    .map((row) => ({ x: row.start_date, y: row.dau! / row.mau! }))
  const weeklyDividedByMonthly = stats
    .filter((row) => row.wau && row.mau)
    .map((row) => ({ x: row.start_date, y: row.wau! / row.mau! }))

  return (
    <Col>
      <div className="flex items-start justify-between">
        <Title>Active users</Title>
        <Button onClick={() => getStats().then(setStats)}>Reload All</Button>
      </div>
      <p className="text-ink-500">
        An active user is a user who has taken any action on the site.
      </p>
      <div className="text-ink-500 mt-2">
        <b>{formatLargeNumber(current.dav ?? 0)}</b> yesterday;{' '}
        {formatLargeNumber(avgDAVlastWeek)} avg last week
      </div>
      <Spacer h={4} />
      <Tabs
        className="mb-4"
        defaultIndex={1}
        tabs={[
          {
            title: 'Daily',
            content: <DailyChart values={dataFor('dav')} />,
          },
          {
            title: 'Daily (7d avg)',
            content: (
              <DailyChart values={rollingAvg(dataFor('dav'), 7).map(round)} />
            ),
          },
        ]}
      />
      <Spacer h={8} />
      <div className="flex items-start justify-between">
        <Title>Active traders</Title>
      </div>
      <p className="text-ink-500">
        An active trader is a user who has traded in, commented on, or created a
        question.
      </p>
      <div className="text-ink-500 mt-2">
        <b>{formatLargeNumber(current.dau ?? 0)}</b> yesterday;{' '}
        {formatLargeNumber(avgDAUlastWeek)} avg last week
      </div>
      <Spacer h={4} />
      <Tabs
        className="mb-4"
        defaultIndex={1}
        tabs={[
          {
            title: 'Daily',
            content: <DailyChart values={dataFor('dau')} />,
          },
          {
            title: 'Daily (7d avg)',
            content: (
              <DailyChart values={rollingAvg(dataFor('dau'), 7).map(round)} />
            ),
          },
          {
            title: 'Weekly',
            content: <DailyChart values={dataFor('wau')} />,
          },
          {
            title: 'Monthly',
            content: <DailyChart values={dataFor('mau')} />,
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
            content: <DailyChart values={dataFor('d1')} pct />,
          },
          {
            title: 'D1 (7d avg)',
            content: <DailyChart values={rollingAvg(dataFor('d1'), 7)} pct />,
          },
          {
            title: 'W1',
            content: <DailyChart values={dataFor('w1')} pct />,
          },
          {
            title: 'M1',
            content: <DailyChart values={dataFor('m1')} pct />,
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
            content: <DailyChart values={dataFor('nd1')} pct />,
          },
          {
            title: 'ND1 (7d avg)',
            content: (
              <DailyChart values={rollingAvg(dataFor('nd1'), 7).slice(7)} pct />
            ),
          },
          {
            title: 'Active days D1-D3',
            content: <DailyChart values={fracDaysActiveD1ToD3} pct />,
          },
          {
            title: 'Active days D1-D3 (7d avg)',
            content: <DailyChart values={fracDaysActiveD1ToD3Avg7d} pct />,
          },
          {
            title: 'NW1',
            content: <DailyChart values={dataFor('nw1').slice(14)} pct />,
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
            title: `${capitalize(TRADE_TERM)}s`,
            content: <DailyChart values={dataFor('bet_count')} />,
          },
          {
            title: 'Questions created',
            content: <DailyChart values={dataFor('contract_count')} />,
          },
          {
            title: 'Comments',
            content: <DailyChart values={dataFor('comment_count')} />,
          },
          {
            title: 'Signups',
            content: <DailyChart values={dataFor('signups_real')} />,
          },
        ]}
      />
      <Spacer h={8} />
      <Title>Activation rate</Title>
      <p className="text-ink-500">
        Out of all new users, how many placed at least one {TRADE_TERM}?
      </p>
      <Spacer h={4} />
      <Tabs
        className="mb-4"
        defaultIndex={1}
        tabs={[
          {
            title: 'Daily',
            content: <DailyChart values={dataFor('activation')} pct />,
          },
          {
            title: 'Daily (7d avg)',
            content: (
              <DailyChart
                values={rollingAvg(dataFor('activation'), 7).slice(7)}
                pct
              />
            ),
          },
        ]}
      />
      <Spacer h={8} />
      <Title>D1 average new user {TRADE_TERM}s</Title>
      <p className="text-ink-500">
        On average for new users, how many {TRADE_TERM}s did they place in the
        first 24 hours?
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
            content: <DailyChart values={dataFor('d1_bet_average')} />,
          },
          {
            title: 'Daily (3d average)',
            content: (
              <DailyChart values={dataFor('d1_bet_3_day_average').slice(1)} />
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
            content: <DailyChart values={dailyDividedByWeekly} pct />,
          },
          {
            title: 'Daily / Monthly',
            content: <DailyChart values={dailyDividedByMonthly} pct />,
          },
          {
            title: 'Weekly / Monthly',
            content: <DailyChart values={weeklyDividedByMonthly} pct />,
          },
        ]}
      />
      <Spacer h={8} />
      <Title>Total mana {TRADED_TERM}</Title>
      <p className="text-ink-500">
        Sum of {TRADE_TERM} amounts. (Divided by 100 to be more readable.)
      </p>
      <Tabs
        className="mb-4"
        defaultIndex={1}
        tabs={[
          {
            title: 'Daily',
            content: <DailyChart values={dataFor('bet_amount')} />,
          },
          {
            title: 'Weekly',
            content: (
              <DailyChart values={rollingSum(dataFor('bet_amount'), 7)} />
            ),
          },
          {
            title: 'Monthly',
            content: (
              <DailyChart values={rollingSum(dataFor('bet_amount'), 30)} />
            ),
          },
        ]}
      />
      <Spacer h={8} />
      <Title>Home feed conversion rate</Title>
      <p className="text-ink-500">Interactions/views</p>
      <Spacer h={4} />
      <DailyChart values={dataFor('feed_conversion')} pct />,
      <Spacer h={8} />
      <TopicDauSummary stats={stats} />
      <Spacer h={8} />
      {topMarketsYesterday && (
        <TopMarketsYesterday data={topMarketsYesterday} />
      )}
    </Col>
  )
}

function TopMarketsYesterday(props: { data: TopMarketsYesterdayData }) {
  const { data } = props
  const { topByTraders, topByViews } = data

  return (
    <Col>
      <Title>Top markets yesterday</Title>
      <p className="text-ink-500 mb-4">
        Markets with the most activity in the past 24 hours.
      </p>

      <Row className="flex-col gap-8 lg:flex-row">
        <Col className="flex-1">
          <h3 className="text-ink-800 mb-2 font-semibold">Most traders</h3>
          <Col className="bg-canvas-50 divide-ink-200 divide-y rounded-lg">
            {topByTraders.map(({ contract, tradersYesterday }) => (
              <TopMarketRow
                key={contract.id}
                contract={contract}
                stat={tradersYesterday}
                icon={<UserIcon className="text-ink-400 h-4 w-4" />}
              />
            ))}
            {topByTraders.length === 0 && (
              <div className="text-ink-500 p-4 text-sm">No data available</div>
            )}
          </Col>
        </Col>

        <Col className="flex-1">
          <h3 className="text-ink-800 mb-2 font-semibold">Most views</h3>
          <Col className="bg-canvas-50 divide-ink-200 divide-y rounded-lg">
            {topByViews.map(({ contract, viewsYesterday }) => (
              <TopMarketRow
                key={contract.id}
                contract={contract}
                stat={viewsYesterday}
                icon={<EyeIcon className="text-ink-400 h-4 w-4" />}
              />
            ))}
            {topByViews.length === 0 && (
              <div className="text-ink-500 p-4 text-sm">No data available</div>
            )}
          </Col>
        </Col>
      </Row>
      <Spacer h={8} />
    </Col>
  )
}

function TopMarketRow(props: {
  contract: Contract
  stat: number
  icon: React.ReactNode
}) {
  const { contract, stat, icon } = props

  return (
    <Link
      href={contractPath(contract)}
      className="hover:bg-canvas-100 flex items-center gap-3 px-3 py-2 transition-colors"
    >
      <div className="min-w-0 flex-1">
        <div className="text-ink-900 line-clamp-2 text-sm font-medium">
          {contract.question}
        </div>
      </div>
      <Row className="text-ink-600 items-center gap-1 text-sm">
        {icon}
        <span>{formatLargeNumber(stat)}</span>
      </Row>
      <div className="text-ink-700 w-16 text-right text-sm font-semibold">
        <ContractStatusLabel contract={contract} />
      </div>
    </Link>
  )
}

function ManaSupplyTab(props: {
  manaSupplyOverTime: rowfor<'mana_supply_stats'>[]
  fromBankSummary: rowfor<'txn_summary_stats'>[]
  toBankSummary: rowfor<'txn_summary_stats'>[]
  activeUserManaStats: ActiveUserManaStats[]
}) {
  const {
    manaSupplyOverTime,
    fromBankSummary,
    toBankSummary,
    activeUserManaStats,
  } = props
  const currentSupply = manaSupplyOverTime[manaSupplyOverTime.length - 1]
  const yesterdaySupply = manaSupplyOverTime[manaSupplyOverTime.length - 2]
  const differenceInSupplySinceYesterday =
    currentSupply.total_value - yesterdaySupply.total_value

  const [fromBankSummaryCash, fromBankSummaryMana] = partition(
    fromBankSummary,
    (f) => f.token === 'CASH'
  )
  const [toBankSummaryCash, toBankSummaryMana] = partition(
    toBankSummary,
    (f) => f.token === 'CASH'
  )

  const days = uniq(
    [...fromBankSummary, ...toBankSummary].map(
      (stat) => stat.start_time.split(' ')[0]
    )
  ).sort()

  const latestRecordingTime = orderBy(fromBankSummary, 'start_time', 'desc')[0]
    .start_time
  const fromBankManaSum = sumBy(
    fromBankSummaryMana.filter((txn) => txn.start_time === latestRecordingTime),
    'total_amount'
  )

  const toBankManaSum = sumBy(
    toBankSummaryMana.filter((txn) => txn.start_time === latestRecordingTime),
    'total_amount'
  )

  const netBankManaTrans = fromBankManaSum - toBankManaSum
  const unaccountedDifference =
    differenceInSupplySinceYesterday - netBankManaTrans

  const latestActiveStats = activeUserManaStats[activeUserManaStats.length - 1]

  return (
    <Col>
      <Title>Mana supply</Title>
      <div className="text-ink-700 mb-4 grid grid-cols-2 justify-items-end gap-y-1">
        <div className="text-ink-800 mb-2">Supply Today</div>
        <div className="text-ink-800 mb-2">Mana</div>

        <div>Balances</div>
        <div className="font-semibold">
          {formatMoney(currentSupply.balance)}
        </div>

        <div>
          Active Balances{' '}
          <InfoTooltip text="Sum of balances held by users active in the last 30 days" />
        </div>
        <div className="font-semibold">
          {formatMoney(latestActiveStats?.activeBalance ?? 0)}
        </div>

        <div>Investment</div>
        <div className="font-semibold">
          {formatMoney(currentSupply.investment_value)}
        </div>

        <div>AMM liquidity</div>
        <div className="font-semibold">
          {formatMoney(currentSupply.amm_liquidity)}
        </div>

        <div>Total</div>
        <div className="font-semibold">
          {formatMoney(currentSupply.total_value)}
        </div>

        <div>
          Change over (yesterday){' '}
          <InfoTooltip
            text={
              <>
                &Delta; mana_supply_stats.total_value
                <br />
                minus net sum txns to or from Manifold
              </>
            }
          />
        </div>
        <div className="font-semibold">
          {formatMoney(unaccountedDifference)}
        </div>
      </div>
      <ManaSupplySummary manaSupplyStats={manaSupplyOverTime} />
      <Spacer h={8} />
      <Title>Active Balances</Title>
      <p className="text-ink-500">
        Sum of mana balances held by users who were active in the last 30 days.
      </p>
      {activeUserManaStats.length > 0 && (
        <DailyChart
          values={activeUserManaStats.map((s) => ({
            x: s.date,
            y: s.activeBalance,
          }))}
        />
      )}
      <Spacer h={8} />
      <Title>Transactions from Manifold</Title>
      <BonusSummary txnSummaryStats={fromBankSummaryMana} days={days} />
      <Spacer h={8} />
      <Title>Transactions to Manifold</Title>
      <span className="text-ink-500">(Ignores mana purchases)</span>
      <BonusSummary txnSummaryStats={toBankSummaryMana} days={days} />
    </Col>
  )
}

function ManaSalesTab(props: { stats: rowfor<'daily_stats'>[] }) {
  const { stats } = props
  const dataFor = useCallback(dataForStats(stats), [stats])
  const last30dSales = sum(stats.slice(-30).map((row) => row.sales || 0))

  return (
    <Col>
      <Title>Mana sales</Title>
      <p className="text-ink-500">
        <b>${formatWithCommas(last30dSales)}</b> of mana sold in the last 30d
        <br />
      </p>
      <Spacer h={4} />
      <Tabs
        className="mb-4"
        defaultIndex={0}
        tabs={[
          {
            title: 'Daily',
            content: <DailyChart values={dataFor('sales')} />,
          },
          {
            title: 'Daily (7d avg)',
            content: (
              <DailyChart values={rollingAvg(dataFor('sales'), 7).map(round)} />
            ),
          },
          {
            title: 'Monthly',
            content: <DailyChart values={rollingSum(dataFor('sales'), 30)} />,
          },
        ]}
      />
      <Spacer h={8} />
      <span className="text-ink-500 italic">
        mana purchased divided by 100, except from{' '}
        {formatTimeShort(MANA_PURCHASE_RATE_CHANGE_DATE.valueOf())} to{' '}
        {formatTimeShort(MANA_PURCHASE_RATE_REVERT_DATE.valueOf())} it is
        divided by 1000
      </span>
    </Col>
  )
}

function PurchasesTab(props: { shopStats?: ShopStats }) {
  const { shopStats } = props

  if (!shopStats) {
    return (
      <Col>
        <Title>Shop Purchases</Title>
        <p className="text-ink-500">No shop data available.</p>
      </Col>
    )
  }

  const {
    subscriptionSales,
    digitalGoodsSales,
    subscribersByTier,
    subscriptionsOverTime,
  } = shopStats

  // Calculate total subscribers
  const totalSubscribers = sumBy(subscribersByTier, 'count')
  const totalAutoRenew = sumBy(subscribersByTier, 'autoRenewCount')

  // Aggregate subscription sales by date
  const subSalesByDate = subscriptionSales.reduce((acc, sale) => {
    if (!acc[sale.date]) {
      acc[sale.date] = { quantity: 0, revenue: 0 }
    }
    acc[sale.date].quantity += sale.quantity
    acc[sale.date].revenue += sale.revenue
    return acc
  }, {} as Record<string, { quantity: number; revenue: number }>)
  const dailySubSales = Object.entries(subSalesByDate)
    .map(([date, data]) => ({ x: date, y: data.quantity }))
    .sort((a, b) => a.x.localeCompare(b.x))
  const dailySubRevenue = Object.entries(subSalesByDate)
    .map(([date, data]) => ({ x: date, y: data.revenue / 1000 }))
    .sort((a, b) => a.x.localeCompare(b.x))

  // Aggregate digital goods sales by date
  const goodsSalesByDate = digitalGoodsSales.reduce((acc, sale) => {
    if (!acc[sale.date]) {
      acc[sale.date] = { quantity: 0, revenue: 0 }
    }
    acc[sale.date].quantity += sale.quantity
    acc[sale.date].revenue += sale.revenue
    return acc
  }, {} as Record<string, { quantity: number; revenue: number }>)
  const dailyGoodsSales = Object.entries(goodsSalesByDate)
    .map(([date, data]) => ({ x: date, y: data.quantity }))
    .sort((a, b) => a.x.localeCompare(b.x))
  const dailyGoodsRevenue = Object.entries(goodsSalesByDate)
    .map(([date, data]) => ({ x: date, y: data.revenue / 1000 }))
    .sort((a, b) => a.x.localeCompare(b.x))

  // Calculate total revenue in last 30 days for each category
  const last30dSubRevenue = subscriptionSales
    .filter((s) => {
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      return new Date(s.date) >= thirtyDaysAgo
    })
    .reduce((sum, s) => sum + s.revenue, 0)

  const last30dGoodsRevenue = digitalGoodsSales
    .filter((s) => {
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      return new Date(s.date) >= thirtyDaysAgo
    })
    .reduce((sum, s) => sum + s.revenue, 0)

  // Get sales breakdown by item for subscriptions
  const subItemSales = subscriptionSales.reduce((acc, sale) => {
    if (!acc[sale.itemId]) {
      acc[sale.itemId] = { quantity: 0, revenue: 0 }
    }
    acc[sale.itemId].quantity += sale.quantity
    acc[sale.itemId].revenue += sale.revenue
    return acc
  }, {} as Record<string, { quantity: number; revenue: number }>)
  const subItemSalesArray = orderBy(
    Object.entries(subItemSales).map(([itemId, data]) => ({
      itemId,
      ...data,
    })),
    'revenue',
    'desc'
  )

  // Get sales breakdown by item for digital goods
  const goodsItemSales = digitalGoodsSales.reduce((acc, sale) => {
    if (!acc[sale.itemId]) {
      acc[sale.itemId] = { quantity: 0, revenue: 0 }
    }
    acc[sale.itemId].quantity += sale.quantity
    acc[sale.itemId].revenue += sale.revenue
    return acc
  }, {} as Record<string, { quantity: number; revenue: number }>)
  const goodsItemSalesArray = orderBy(
    Object.entries(goodsItemSales).map(([itemId, data]) => ({
      itemId,
      ...data,
    })),
    'revenue',
    'desc'
  )

  // Subscription chart data
  const subscriptionChartData = subscriptionsOverTime.map((d) => ({
    x: d.date,
    y: d.totalCount,
  }))

  const tierNames: Record<string, string> = {
    basic: 'Plus',
    plus: 'Pro',
    premium: 'Premium',
  }

  const tierColors: Record<string, string> = {
    basic: 'text-gray-500',
    plus: 'text-indigo-500',
    premium: 'text-amber-500',
  }

  const itemDisplayNames: Record<string, string> = {
    'supporter-basic': 'Plus Membership',
    'supporter-plus': 'Pro Membership',
    'supporter-premium': 'Premium Membership',
    'streak-forgiveness': 'Streak Freeze',
    'pampu-skin': 'PAMPU Skin',
    'avatar-golden-border': 'Golden Glow',
    'avatar-crown': 'Crown',
    'avatar-graduation-cap': 'Graduation Cap',
    'hovercard-glow': 'Profile Border',
  }

  return (
    <Col>
      {/* SUBSCRIPTIONS SECTION */}
      <Title>Subscriptions</Title>

      <Spacer h={4} />
      <h3 className="text-lg font-semibold">Current Subscribers</h3>
      <p className="text-ink-500 mb-4">
        <b>{totalSubscribers}</b> active subscribers ({totalAutoRenew}{' '}
        auto-renewing)
      </p>
      <div className="mb-8 grid grid-cols-3 gap-4">
        {(['basic', 'plus', 'premium'] as const).map((tier) => {
          const tierData = subscribersByTier.find((t) => t.tier === tier)
          return (
            <div key={tier} className="bg-canvas-50 rounded-lg p-4 text-center">
              <div className={`text-2xl font-bold ${tierColors[tier]}`}>
                {tierData?.count ?? 0}
              </div>
              <div className="text-ink-600 text-sm font-medium">
                {tierNames[tier]}
              </div>
              <div className="text-ink-500 text-xs">
                {tierData?.autoRenewCount ?? 0} auto-renew
              </div>
            </div>
          )
        })}
      </div>

      <h3 className="text-lg font-semibold">Subscribers Over Time</h3>
      <p className="text-ink-500">Active subscribers at the end of each day.</p>
      <Spacer h={4} />
      {subscriptionChartData.length > 0 ? (
        <DailyChart values={subscriptionChartData} />
      ) : (
        <p className="text-ink-500">No subscription history available.</p>
      )}

      <Spacer h={8} />
      <h3 className="text-lg font-semibold">Subscription Sales</h3>
      <p className="text-ink-500">
        <b>{formatMoney(last30dSubRevenue)}</b> from subscriptions in the last
        30d
      </p>
      <Spacer h={4} />
      <Tabs
        className="mb-4"
        defaultIndex={0}
        tabs={[
          {
            title: 'Daily Purchases',
            content:
              dailySubSales.length > 0 ? (
                <DailyChart values={dailySubSales} />
              ) : (
                <p className="text-ink-500">
                  No subscription sales data available.
                </p>
              ),
          },
          {
            title: 'Daily Revenue (÷1000)',
            content:
              dailySubRevenue.length > 0 ? (
                <DailyChart values={dailySubRevenue} />
              ) : (
                <p className="text-ink-500">No revenue data available.</p>
              ),
          },
        ]}
      />

      <SalesTable
        title="Subscription Sales by Tier"
        items={subItemSalesArray}
        itemDisplayNames={itemDisplayNames}
      />

      {/* DIGITAL GOODS SECTION */}
      <Spacer h={12} />
      <Title>Digital Goods</Title>

      <Spacer h={4} />
      <h3 className="text-lg font-semibold">Digital Goods Sales</h3>
      <p className="text-ink-500">
        <b>{formatMoney(last30dGoodsRevenue)}</b> from digital goods in the last
        30d
      </p>
      <Spacer h={4} />
      <Tabs
        className="mb-4"
        defaultIndex={0}
        tabs={[
          {
            title: 'Daily Items Sold',
            content:
              dailyGoodsSales.length > 0 ? (
                <DailyChart values={dailyGoodsSales} />
              ) : (
                <p className="text-ink-500">
                  No digital goods sales data available.
                </p>
              ),
          },
          {
            title: 'Daily Revenue (÷1000)',
            content:
              dailyGoodsRevenue.length > 0 ? (
                <DailyChart values={dailyGoodsRevenue} />
              ) : (
                <p className="text-ink-500">No revenue data available.</p>
              ),
          },
        ]}
      />

      <SalesTable
        title="Digital Goods Sales by Item"
        items={goodsItemSalesArray}
        itemDisplayNames={itemDisplayNames}
      />
    </Col>
  )
}

function SalesTable(props: {
  title: string
  items: { itemId: string; quantity: number; revenue: number }[]
  itemDisplayNames: Record<string, string>
}) {
  const { title, items, itemDisplayNames } = props

  return (
    <>
      <Spacer h={4} />
      <h3 className="text-lg font-semibold">{title}</h3>
      <Spacer h={2} />
      <div className="bg-canvas-50 rounded-lg">
        <table className="w-full">
          <thead>
            <tr className="border-ink-200 border-b">
              <th className="text-ink-600 px-4 py-2 text-left text-sm font-medium">
                Item
              </th>
              <th className="text-ink-600 px-4 py-2 text-right text-sm font-medium">
                Quantity
              </th>
              <th className="text-ink-600 px-4 py-2 text-right text-sm font-medium">
                Revenue
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr
                key={item.itemId}
                className="border-ink-200 border-b last:border-0"
              >
                <td className="px-4 py-2 text-sm">
                  {itemDisplayNames[item.itemId] ?? item.itemId}
                </td>
                <td className="px-4 py-2 text-right text-sm">
                  {formatWithCommas(item.quantity)}
                </td>
                <td className="px-4 py-2 text-right text-sm font-medium text-teal-600">
                  {formatMoney(item.revenue)}
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td
                  colSpan={3}
                  className="text-ink-500 px-4 py-4 text-center text-sm"
                >
                  No sales recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}

export function CustomAnalytics(props: {
  stats: rowfor<'daily_stats'>[]
  manaSupplyOverTime: rowfor<'mana_supply_stats'>[]
  fromBankSummary: rowfor<'txn_summary_stats'>[]
  toBankSummary: rowfor<'txn_summary_stats'>[]
  activeUserManaStats?: ActiveUserManaStats[]
  topMarketsYesterday?: TopMarketsYesterdayData
  shopStats?: ShopStats
}) {
  const {
    stats,
    manaSupplyOverTime,
    fromBankSummary,
    toBankSummary,
    activeUserManaStats,
    topMarketsYesterday,
    shopStats,
  } = props
  const [localStats, setLocalStats] = useState(stats)

  return (
    <Col className="px-4 sm:pl-6 sm:pr-16">
      <Tabs
        className="mb-4"
        defaultIndex={0}
        tabs={[
          {
            title: 'Activity',
            content: (
              <ActivityTab
                stats={localStats}
                setStats={setLocalStats}
                topMarketsYesterday={topMarketsYesterday}
              />
            ),
          },
          {
            title: 'Mana Supply',
            content: (
              <ManaSupplyTab
                manaSupplyOverTime={manaSupplyOverTime}
                fromBankSummary={fromBankSummary}
                toBankSummary={toBankSummary}
                activeUserManaStats={activeUserManaStats ?? []}
              />
            ),
          },
          {
            title: 'Mana Sales',
            content: <ManaSalesTab stats={localStats} />,
          },
          {
            title: 'Purchases',
            content: <PurchasesTab shopStats={shopStats} />,
          },
        ]}
      />
    </Col>
  )
}

const dataForStats =
  (stats: rowfor<'daily_stats'>[]) =>
  <S extends Column<'daily_stats'>>(key: S) =>
    stats
      .map((row) => ({ x: row.start_date, y: row[key]! }))
      .filter((row) => row.y != null)

const rollingAvg = (arr: { x: string; y: number }[], period: number) =>
  arr.map(({ x }, i) => {
    const start = Math.max(0, i - period + 1)
    const end = i + 1
    const values = arr.slice(start, end).map((d) => d.y ?? 0)
    return { x, y: values.length ? average(values) : 0 }
  })

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

const round = (point: { x: string; y: number }) => ({
  x: point.x,
  y: Math.round(point.y),
})
