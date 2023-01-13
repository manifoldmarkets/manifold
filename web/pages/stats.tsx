import { useEffect, useState } from 'react'
import { DailyChart } from 'web/components/charts/stats'
import { Col } from 'web/components/layout/col'
import { Spacer } from 'web/components/layout/spacer'
import { Tabs } from 'web/components/layout/tabs'
import { Page } from 'web/components/layout/page'
import { Title } from 'web/components/widgets/title'
import { SiteLink } from 'web/components/widgets/site-link'
import { Linkify } from 'web/components/widgets/linkify'
import { getStats } from 'web/lib/firebase/stats'
import { Stats } from 'common/stats'
import { PLURAL_BETS } from 'common/user'
import { capitalize } from 'lodash'
import { formatLargeNumber } from 'common/util/format'
import { formatWithCommas } from 'common/lib/util/format'

export default function Analytics() {
  const [stats, setStats] = useState<Stats | undefined>(undefined)
  useEffect(() => {
    getStats().then(setStats)
  }, [])
  if (stats == null) {
    return <></>
  }
  return (
    <Page>
      <Tabs
        className="mb-4"
        currentPageForAnalytics={'stats'}
        tabs={[
          {
            title: 'Activity',
            content: <CustomAnalytics {...stats} />,
          },
          {
            title: 'Market Stats',
            content: <WasabiCharts />,
          },
        ]}
      />
    </Page>
  )
}

export function CustomAnalytics(props: Stats) {
  const {
    startDate,
    dailyActiveUsers,
    dailyActiveUsersWeeklyAvg,
    avgDailyUserActions,
    dailySales,
    weeklyActiveUsers,
    monthlyActiveUsers,
    d1,
    d1WeeklyAvg,
    nd1,
    nd1WeeklyAvg,
    nw1,
    dailyBetCounts,
    dailyContractCounts,
    dailyCommentCounts,
    dailySignups,
    weekOnWeekRetention,
    monthlyRetention,
    dailyActivationRate,
    dailyActivationRateWeeklyAvg,
    manaBet,
  } = props

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

  return (
    <Col className="px-2 sm:px-0">
      <Title text="Active users" />
      <p className="text-gray-500">
        An active user is a user who has traded in, commented on, or created a
        market.
      </p>
      <div className="mt-2 text-gray-500">
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

      <Title text="Average activity" />
      <p className="text-gray-500">
        Median number of DAU-qualifying actions per multi-action user per day.
      </p>

      <Spacer h={4} />

      <Tabs
        className="mb-4"
        defaultIndex={0}
        tabs={[
          {
            title: 'Daily',
            content: (
              <DailyChart
                dailyValues={avgDailyUserActions}
                startDate={startDate}
              />
            ),
          },
        ]}
      />
      <Spacer h={8} />

      <Title text="Revenue" />
      <p className="text-gray-500">
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
        ]}
      />
      <Spacer h={8} />

      <Title text="Retention" />
      <p className="text-gray-500">
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
      <Title text="New user retention" />
      <p className="text-gray-500">
        What fraction of new users are still active after the given time period?
      </p>
      <Spacer h={4} />

      <Tabs
        className="mb-4"
        defaultIndex={2}
        tabs={[
          {
            title: 'ND1',
            content: (
              <DailyChart
                dailyValues={nd1}
                startDate={startDate}
                excludeFirstDays={1}
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

      <Title text="Daily activity" />
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
            title: 'Markets created',
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
              <DailyChart dailyValues={dailySignups} startDate={startDate} />
            ),
          },
        ]}
      />

      <Spacer h={8} />

      <Title text="Activation rate" />
      <p className="text-gray-500">
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

      <Title text="Ratio of Active Users" />
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

      <Title text="Total mana bet" />
      <p className="text-gray-500">
        Sum of bet amounts. (Divided by 100 to be more readable.)
      </p>
      <Tabs
        className="mb-4"
        defaultIndex={1}
        tabs={[
          {
            title: 'Daily',
            content: (
              <DailyChart dailyValues={manaBet.daily} startDate={startDate} />
            ),
          },
          {
            title: 'Weekly',
            content: (
              <DailyChart dailyValues={manaBet.weekly} startDate={startDate} />
            ),
          },
          {
            title: 'Monthly',
            content: (
              <DailyChart dailyValues={manaBet.monthly} startDate={startDate} />
            ),
          },
        ]}
      />
      <Spacer h={8} />
    </Col>
  )
}

export function WasabiCharts() {
  return (
    <>
      <p className="text-gray-500">
        Courtesy of <Linkify text="@wasabipesto" />; originally found{' '}
        <SiteLink
          className="font-bold"
          href="https://wasabipesto.com/jupyter/manifold/"
        >
          here.
        </SiteLink>
      </p>
      <Spacer h={4} />
      <iframe
        className="w-full border-0"
        height={21000}
        src="https://wasabipesto.com/jupyter/manifold/"
        frameBorder="0"
        allowFullScreen
      />
    </>
  )
}
