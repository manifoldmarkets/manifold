import { StatsDailyChart } from 'web/components/stats/stats-daily-chart'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Spacer } from 'web/components/layout/spacer'
import { QueryUncontrolledTabs, Tabs } from 'web/components/layout/tabs'
import { Page } from 'web/components/layout/page'
import { Title } from 'web/components/widgets/title'
import { getStatsPageRows, StatsPageRow } from 'web/lib/supabase/stats'
import { keyBy, orderBy, sum, sumBy, uniq } from 'lodash'
import { formatLargeNumber, formatMoney } from 'common/util/format'
import { formatWithCommas } from 'common/util/format'
import { SEO } from 'web/components/SEO'
import Link from 'next/link'
import { api } from '../lib/api/api'
import { Row as rowfor } from 'common/supabase/utils'
import { BonusSummary, TxnSummaryRow } from 'web/components/stats/bonus-summary'
import { ManaSupplySummary } from 'web/components/stats/mana-summary'
import { StatsExplorer } from 'web/components/stats/stats-explorer'
import {
  dataForStats,
  rollingAvg,
  rollingSum,
  round,
} from 'web/components/stats/stats-series'
import { useCallback, useState } from 'react'
import {
  MANA_PURCHASE_RATE_CHANGE_DATE,
  MANA_PURCHASE_RATE_REVERT_DATE,
} from 'common/envs/constants'
import { formatTimeShort } from 'client-common/lib/time'
import { InfoTooltip } from 'web/components/widgets/info-tooltip'
import {
  StatsTimeControls,
  StatsTimeProvider,
  useStatsTime,
} from 'web/components/stats/stats-time'
import { addDays, getStatsWindow, isInWindow } from 'common/stats-window'
import { Contract, contractPath } from 'common/contract'
import { ContractStatusLabel } from 'web/components/contract/contracts-table'
import { UserIcon, EyeIcon } from '@heroicons/react/solid'
import { DateTimeTooltip } from 'web/components/widgets/datetime-tooltip'
import { SHOP_ITEMS, getTicketItems } from 'common/src/shop/items'

export const getStaticProps = async () => {
  try {
    // Before fetching, so a fetch that runs past midnight can't make an
    // unfinished day look whole.
    const todayLA = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Los_Angeles',
    }).format(new Date())
    const [
      stats,
      manaSupplyOverTime,
      fromBankSummary,
      toBankSummary,
      activeUserManaStats,
      topMarketsYesterday,
      shopStats,
      idenfyStats,
    ] = await Promise.all([
      getStatsPageRows(),
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
      // Three days more than are kept: the endpoint's window starts at its
      // own "now minus limitDays", which can be past midnight after
      // todayLA was taken, and a DST change shifts it by an hour.
      api('get-idenfy-stats', { limitDays: ID_VERIFICATION_DAYS + 3 }),
    ])

    return {
      props: {
        stats,
        fromBankSummary: toTxnSummaryRows(fromBankSummary),
        toBankSummary: toTxnSummaryRows(toBankSummary),
        // From every row, cash included, as before the cash rows were dropped.
        latestBankRecordingTime:
          orderBy(fromBankSummary, 'start_time', 'desc')[0]?.start_time ?? null,
        manaSupplyOverTime,
        activeUserManaStats,
        topMarketsYesterday: withoutDescriptions(topMarketsYesterday),
        shopStats,
        idenfyStats: wholeIdenfyDays(idenfyStats, todayLA),
        totalRedeemable: 0,
      },
      revalidate: 60 * 60, // One hour
    }
  } catch (err) {
    console.error(err)
    return { props: { stats: null }, revalidate: 60 }
  }
}

// Whole LA days of ID verifications the page shows, ending yesterday.
const ID_VERIFICATION_DAYS = 99

// get-idenfy-stats counts verifications from "now minus limitDays" to now,
// grouped by LA day, and leaves out days with none. So its first day is
// partial, its last can be today, unfinished, and a quiet day is missing
// rather than zero. Keep only whole days before today, with the quiet ones
// as zeros, so totals and averages cover what they say.
const wholeIdenfyDays = (stats: IdenfyStats, todayLA: string) => {
  const byDate = keyBy(stats.dailyStats, 'date')
  const days = Array.from({ length: ID_VERIFICATION_DAYS }, (_, i) =>
    addDays(todayLA, i - ID_VERIFICATION_DAYS)
  )
  return {
    ...stats,
    dailyStats: days.map(
      (date) =>
        byDate[date] ?? {
          date,
          approvals: 0,
          denials: 0,
          pending: 0,
          suspected: 0,
        }
    ),
  }
}

// The props are embedded in the page's HTML, so they carry only what renders.
// Nothing here charts cash, and BonusSummary reads four fields.
const toTxnSummaryRows = (
  rows: rowfor<'txn_summary_stats'>[]
): TxnSummaryRow[] =>
  rows
    .filter((r) => r.token !== 'CASH')
    .map(({ start_time, category, quest_type, total_amount }) => ({
      start_time,
      category,
      quest_type,
      total_amount,
    }))

// A market's description can be tens of KB, and the rows show only its title.
const withoutDescriptions = (
  data: TopMarketsYesterdayData
): TopMarketsYesterdayData => ({
  topByTraders: data.topByTraders.map((t) => ({
    ...t,
    contract: { ...t.contract, description: '' },
  })),
  topByViews: data.topByViews.map((t) => ({
    ...t,
    contract: { ...t.contract, description: '' },
  })),
})

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
  merchSales: {
    date: string
    itemId: string
    quantity: number
    revenue: number
  }[]
  ticketSales: {
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

type IdenfyStats = {
  dailyStats: {
    date: string
    approvals: number
    denials: number
    pending: number
    suspected: number
  }[]
}

export default function Analytics(props: {
  stats: StatsPageRow[]
  manaSupplyOverTime: rowfor<'mana_supply_stats'>[]
  fromBankSummary: TxnSummaryRow[]
  toBankSummary: TxnSummaryRow[]
  latestBankRecordingTime: string | null
  activeUserManaStats: ActiveUserManaStats[]
  topMarketsYesterday?: TopMarketsYesterdayData
  shopStats?: ShopStats
  idenfyStats?: IdenfyStats
  totalRedeemable: number
}) {
  const {
    stats,
    manaSupplyOverTime,
    fromBankSummary,
    toBankSummary,
    latestBankRecordingTime,
    activeUserManaStats,
    topMarketsYesterday,
    shopStats,
    idenfyStats,
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
        latestBankRecordingTime={latestBankRecordingTime}
        activeUserManaStats={activeUserManaStats}
        topMarketsYesterday={topMarketsYesterday}
        shopStats={shopStats}
        idenfyStats={idenfyStats}
      />
    </Page>
  )
}

function ActivityTab(props: {
  stats: StatsPageRow[]
  setStats: (stats: StatsPageRow[]) => void
  topMarketsYesterday?: TopMarketsYesterdayData
  idenfyStats?: IdenfyStats
}) {
  const { stats, setStats, topMarketsYesterday, idenfyStats } = props

  return (
    <Col>
      <StatsExplorer
        stats={stats}
        setStats={setStats}
        idVerifications={idenfyStats?.dailyStats}
      />
      <Spacer h={12} />
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
  fromBankSummary: TxnSummaryRow[]
  toBankSummary: TxnSummaryRow[]
  latestBankRecordingTime: string | null
  activeUserManaStats: ActiveUserManaStats[]
}) {
  const {
    manaSupplyOverTime,
    fromBankSummary,
    toBankSummary,
    latestBankRecordingTime,
    activeUserManaStats,
  } = props
  const currentSupply = manaSupplyOverTime[manaSupplyOverTime.length - 1]
  const yesterdaySupply = manaSupplyOverTime[manaSupplyOverTime.length - 2]
  const differenceInSupplySinceYesterday =
    currentSupply.total_value - yesterdaySupply.total_value

  // The stacked charts follow the page's time range too.
  const { range } = useStatsTime()
  const inRange = <T extends { start_time: string }>(rows: T[]) => {
    const lastDay = rows
      .map((r) => r.start_time.slice(0, 10))
      .sort()
      .pop()
    if (!lastDay) return rows
    const window = getStatsWindow(lastDay, range)
    return rows.filter((r) =>
      isInWindow(r.start_time.slice(0, 10), window.from, window.to)
    )
  }

  const days = uniq(
    [...fromBankSummary, ...toBankSummary].map(
      (stat) => stat.start_time.split(' ')[0]
    )
  ).sort()
  const lastTxnDay = days[days.length - 1]
  const txnWindow = lastTxnDay ? getStatsWindow(lastTxnDay, range) : undefined
  const rangedDays = txnWindow
    ? days.filter((d) => isInWindow(d, txnWindow.from, txnWindow.to))
    : days

  const fromBankManaSum = sumBy(
    fromBankSummary.filter((txn) => txn.start_time === latestBankRecordingTime),
    'total_amount'
  )

  const toBankManaSum = sumBy(
    toBankSummary.filter((txn) => txn.start_time === latestBankRecordingTime),
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
      <ManaSupplySummary manaSupplyStats={inRange(manaSupplyOverTime)} />
      <Spacer h={8} />
      <Title>Active Balances</Title>
      <p className="text-ink-500">
        Sum of mana balances held by users who were active in the last 30 days.
      </p>
      {activeUserManaStats.length > 0 && (
        <StatsDailyChart
          values={activeUserManaStats.map((s) => ({
            x: s.date,
            y: s.activeBalance,
          }))}
        />
      )}
      <Spacer h={8} />
      <Title>Transactions from Manifold</Title>
      <BonusSummary
        txnSummaryStats={inRange(fromBankSummary)}
        days={rangedDays}
      />
      <Spacer h={8} />
      <Title>Transactions to Manifold</Title>
      <span className="text-ink-500">(Ignores mana purchases)</span>
      <BonusSummary
        txnSummaryStats={inRange(toBankSummary)}
        days={rangedDays}
      />
    </Col>
  )
}

function ManaSalesTab(props: { stats: StatsPageRow[] }) {
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
            content: <StatsDailyChart values={dataFor('sales')} />,
          },
          {
            title: 'Daily (7d avg)',
            content: (
              <StatsDailyChart
                values={rollingAvg(dataFor('sales'), 7).map(round)}
              />
            ),
          },
          {
            title: 'Monthly',
            content: (
              <StatsDailyChart values={rollingSum(dataFor('sales'), 30)} />
            ),
          },
        ]}
      />
      <Spacer h={8} />
      <span className="text-ink-500 italic">
        mana purchased divided by 100, except from{' '}
        <DateTimeTooltip time={MANA_PURCHASE_RATE_CHANGE_DATE.valueOf()}>
          <span>
            {formatTimeShort(MANA_PURCHASE_RATE_CHANGE_DATE.valueOf())}
          </span>
        </DateTimeTooltip>{' '}
        to{' '}
        <DateTimeTooltip time={MANA_PURCHASE_RATE_REVERT_DATE.valueOf()}>
          <span>
            {formatTimeShort(MANA_PURCHASE_RATE_REVERT_DATE.valueOf())}
          </span>
        </DateTimeTooltip>{' '}
        it is divided by 1000
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
    ticketSales,
    merchSales = [],
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

  // Aggregate merch sales by date (same shape as digital goods)
  const merchSalesByDate = merchSales.reduce((acc, sale) => {
    if (!acc[sale.date]) {
      acc[sale.date] = { quantity: 0, revenue: 0 }
    }
    acc[sale.date].quantity += sale.quantity
    acc[sale.date].revenue += sale.revenue
    return acc
  }, {} as Record<string, { quantity: number; revenue: number }>)
  const dailyMerchSales = Object.entries(merchSalesByDate)
    .map(([date, data]) => ({ x: date, y: data.quantity }))
    .sort((a, b) => a.x.localeCompare(b.x))
  const dailyMerchRevenue = Object.entries(merchSalesByDate)
    .map(([date, data]) => ({ x: date, y: data.revenue / 1000 }))
    .sort((a, b) => a.x.localeCompare(b.x))

  const last30dMerchRevenue = merchSales
    .filter((s) => {
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      return new Date(s.date) >= thirtyDaysAgo
    })
    .reduce((sum, s) => sum + s.revenue, 0)

  const merchItemSales = merchSales.reduce((acc, sale) => {
    if (!acc[sale.itemId]) {
      acc[sale.itemId] = { quantity: 0, revenue: 0 }
    }
    acc[sale.itemId].quantity += sale.quantity
    acc[sale.itemId].revenue += sale.revenue
    return acc
  }, {} as Record<string, { quantity: number; revenue: number }>)
  const merchItemSalesArray = orderBy(
    Object.entries(merchItemSales).map(([itemId, data]) => ({
      itemId,
      ...data,
    })),
    'revenue',
    'desc'
  )

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

  const itemDisplayNames: Record<string, string> = Object.fromEntries(
    SHOP_ITEMS.map((item) => [item.id, item.name])
  )

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
        <StatsDailyChart values={subscriptionChartData} />
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
                <StatsDailyChart values={dailySubSales} />
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
                <StatsDailyChart values={dailySubRevenue} />
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
                <StatsDailyChart values={dailyGoodsSales} />
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
                <StatsDailyChart values={dailyGoodsRevenue} />
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

      {/* MERCH SECTION — physical items fulfilled via Printful. Tracked
          separately from Digital Goods because merch orders never reach
          'COMPLETED' status (they flow PENDING_FULFILLMENT → SHIPPED and
          were silently dropped by the digital-goods query before). */}
      {merchSales.length > 0 && (
        <>
          <Spacer h={12} />
          <Title>Merch</Title>
          <Spacer h={4} />
          <h3 className="text-lg font-semibold">Merch Sales</h3>
          <p className="text-ink-500">
            <b>{formatMoney(last30dMerchRevenue)}</b> from merch in the last 30d
          </p>
          <Spacer h={4} />
          <Tabs
            className="mb-4"
            defaultIndex={0}
            tabs={[
              {
                title: 'Daily Items Sold',
                content:
                  dailyMerchSales.length > 0 ? (
                    <StatsDailyChart values={dailyMerchSales} />
                  ) : (
                    <p className="text-ink-500">
                      No merch sales data available.
                    </p>
                  ),
              },
              {
                title: 'Daily Revenue (÷1000)',
                content:
                  dailyMerchRevenue.length > 0 ? (
                    <StatsDailyChart values={dailyMerchRevenue} />
                  ) : (
                    <p className="text-ink-500">No revenue data available.</p>
                  ),
              },
            ]}
          />

          <SalesTable
            title="Merch Sales by Item"
            items={merchItemSalesArray}
            itemDisplayNames={itemDisplayNames}
          />
        </>
      )}

      {/* MANIFEST TICKETS SECTION */}
      {ticketSales.length > 0 && (
        <>
          <Spacer h={12} />
          <Title>Manifest Tickets</Title>
          <Spacer h={4} />
          <SalesTable
            title="Ticket Sales"
            items={ticketSales}
            itemDisplayNames={Object.fromEntries(
              getTicketItems().map((item) => [item.id, item.name])
            )}
          />
        </>
      )}
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
  stats: StatsPageRow[]
  manaSupplyOverTime: rowfor<'mana_supply_stats'>[]
  fromBankSummary: TxnSummaryRow[]
  toBankSummary: TxnSummaryRow[]
  latestBankRecordingTime: string | null
  activeUserManaStats?: ActiveUserManaStats[]
  topMarketsYesterday?: TopMarketsYesterdayData
  shopStats?: ShopStats
  idenfyStats?: IdenfyStats
}) {
  const {
    stats,
    manaSupplyOverTime,
    fromBankSummary,
    toBankSummary,
    latestBankRecordingTime,
    activeUserManaStats,
    topMarketsYesterday,
    shopStats,
    idenfyStats,
  } = props
  const [localStats, setLocalStats] = useState(stats)

  return (
    <StatsTimeProvider>
      <Col className="px-4 sm:pl-6 sm:pr-16">
        {/* One time range and comparison for every chart on the page. */}
        <StatsTimeControls className="bg-canvas-0 sticky top-0 z-20 -mx-4 px-4 py-2 sm:mx-0 sm:px-0" />
        <QueryUncontrolledTabs
          className="mb-4"
          defaultIndex={0}
          tabs={[
            {
              title: 'Activity',
              queryString: 'activity',
              content: (
                <ActivityTab
                  stats={localStats}
                  setStats={setLocalStats}
                  topMarketsYesterday={topMarketsYesterday}
                  idenfyStats={idenfyStats}
                />
              ),
            },
            {
              title: 'Mana Supply',
              queryString: 'mana-supply',
              content: (
                <ManaSupplyTab
                  manaSupplyOverTime={manaSupplyOverTime}
                  fromBankSummary={fromBankSummary}
                  toBankSummary={toBankSummary}
                  latestBankRecordingTime={latestBankRecordingTime}
                  activeUserManaStats={activeUserManaStats ?? []}
                />
              ),
            },
            {
              title: 'Mana Sales',
              queryString: 'mana-sales',
              content: <ManaSalesTab stats={localStats} />,
            },
            {
              title: 'Purchases',
              queryString: 'purchases',
              content: <PurchasesTab shopStats={shopStats} />,
            },
          ]}
        />
      </Col>
    </StatsTimeProvider>
  )
}
