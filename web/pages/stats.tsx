import { useEffect, useState } from 'react'
import {
  DailyCountChart,
  DailyPercentChart,
} from 'web/components/analytics/charts'
import { Col } from 'web/components/layout/col'
import { Spacer } from 'web/components/layout/spacer'
import { Tabs } from 'web/components/layout/tabs'
import { Page } from 'web/components/page'
import { Title } from 'web/components/title'
import { SiteLink } from 'web/components/site-link'
import { Linkify } from 'web/components/linkify'
import { getStats } from 'web/lib/firebase/stats'
import { Stats } from 'common/stats'
import { PAST_BETS } from 'common/user'
import { capitalize } from 'lodash'

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
          {
            title: 'Google Analytics',
            content: <FirebaseAnalytics />,
          },
        ]}
      />
    </Page>
  )
}

export function CustomAnalytics(props: Stats) {
  const {
    startDate,
    d1,
    d1Weekly,
    w1NewUsers,
    dailyActiveUsers,
    dailyBetCounts,
    dailyContractCounts,
    dailyCommentCounts,
    dailySignups,
    weeklyActiveUsers,
    monthlyActiveUsers,
    weekOnWeekRetention,
    monthlyRetention,
    weeklyActivationRate,
    topTenthActions,
    manaBet,
  } = props

  const dailyDividedByWeekly = dailyActiveUsers
    .map((dailyActive, i) =>
      Math.round((100 * dailyActive) / weeklyActiveUsers[i])
    )
    .slice(7)

  const dailyDividedByMonthly = dailyActiveUsers
    .map((dailyActive, i) =>
      Math.round((100 * dailyActive) / monthlyActiveUsers[i])
    )
    .slice(7)

  const weeklyDividedByMonthly = weeklyActiveUsers
    .map((weeklyActive, i) =>
      Math.round((100 * weeklyActive) / monthlyActiveUsers[i])
    )
    .slice(7)

  const oneWeekLaterDate = startDate + 7 * 24 * 60 * 60 * 1000

  return (
    <Col className="px-2 sm:px-0">
      <Title text="Active users" />
      <p className="text-gray-500">
        An active user is a user who has traded in, commented on, or created a
        market.
      </p>
      <Spacer h={4} />

      <Tabs
        defaultIndex={1}
        tabs={[
          {
            title: 'Daily',
            content: (
              <DailyCountChart
                dailyCounts={dailyActiveUsers}
                startDate={startDate}
                small
              />
            ),
          },
          {
            title: 'Weekly',
            content: (
              <DailyCountChart
                dailyCounts={weeklyActiveUsers}
                startDate={startDate}
                small
              />
            ),
          },
          {
            title: 'Monthly',
            content: (
              <DailyCountChart
                dailyCounts={monthlyActiveUsers}
                startDate={startDate}
                small
              />
            ),
          },
        ]}
      />
      <Spacer h={8} />

      <Title text="D1" />
      <p className="text-gray-500">
        The fraction of users that took an action yesterday that took an action
        today.
      </p>
      <Spacer h={4} />

      <Tabs
        defaultIndex={1}
        tabs={[
          {
            title: 'D1',
            content: (
              <DailyPercentChart
                dailyPercent={d1}
                startDate={startDate}
                small
              />
            ),
          },
          {
            title: 'D1 weekly average',
            content: (
              <DailyPercentChart
                dailyPercent={d1Weekly}
                startDate={startDate}
                small
              />
            ),
          },
        ]}
      />
      <Spacer h={8} />

      <Title text="W1 New users" />
      <p className="text-gray-500">
        The fraction of new users two weeks ago that took an action in the past
        week.
      </p>
      <Spacer h={4} />

      <Tabs
        defaultIndex={0}
        tabs={[
          {
            title: 'W1',
            content: (
              <DailyPercentChart
                dailyPercent={w1NewUsers}
                startDate={startDate}
                small
              />
            ),
          },
        ]}
      />
      <Spacer h={8} />

      <Title text="Daily activity" />
      <Tabs
        defaultIndex={0}
        tabs={[
          {
            title: capitalize(PAST_BETS),
            content: (
              <DailyCountChart
                dailyCounts={dailyBetCounts}
                startDate={startDate}
                small
              />
            ),
          },
          {
            title: 'Markets created',
            content: (
              <DailyCountChart
                dailyCounts={dailyContractCounts}
                startDate={startDate}
                small
              />
            ),
          },
          {
            title: 'Comments',
            content: (
              <DailyCountChart
                dailyCounts={dailyCommentCounts}
                startDate={startDate}
                small
              />
            ),
          },
          {
            title: 'Signups',
            content: (
              <DailyCountChart
                dailyCounts={dailySignups}
                startDate={startDate}
                small
              />
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
        defaultIndex={0}
        tabs={[
          {
            title: 'Weekly',
            content: (
              <DailyPercentChart
                dailyPercent={weekOnWeekRetention.slice(7)}
                startDate={oneWeekLaterDate}
                small
              />
            ),
          },
          {
            title: 'Monthly',
            content: (
              <DailyPercentChart
                dailyPercent={monthlyRetention.slice(7)}
                startDate={oneWeekLaterDate}
                small
              />
            ),
          },
        ]}
      />
      <Spacer h={8} />

      <Title text="Weekly activation rate" />
      <p className="text-gray-500">
        Out of all new users this week, how many placed at least one bet?
      </p>
      <DailyPercentChart
        dailyPercent={weeklyActivationRate.slice(7)}
        startDate={oneWeekLaterDate}
        small
      />
      <Spacer h={8} />

      <Title text="Ratio of Active Users" />
      <Tabs
        defaultIndex={1}
        tabs={[
          {
            title: 'Daily / Weekly',
            content: (
              <DailyPercentChart
                dailyPercent={dailyDividedByWeekly}
                startDate={oneWeekLaterDate}
                small
              />
            ),
          },
          {
            title: 'Daily / Monthly',
            content: (
              <DailyPercentChart
                dailyPercent={dailyDividedByMonthly}
                startDate={oneWeekLaterDate}
                small
              />
            ),
          },
          {
            title: 'Weekly / Monthly',
            content: (
              <DailyPercentChart
                dailyPercent={weeklyDividedByMonthly}
                startDate={oneWeekLaterDate}
                small
              />
            ),
          },
        ]}
      />
      <Spacer h={8} />

      <Title text="Action count of top tenth" />
      <p className="text-gray-500">
        Number of actions (bets, comments, markets created) taken by the tenth
        percentile of top users.
      </p>
      <Tabs
        defaultIndex={1}
        tabs={[
          {
            title: 'Daily',
            content: (
              <DailyCountChart
                dailyCounts={topTenthActions.daily}
                startDate={startDate}
                small
              />
            ),
          },
          {
            title: 'Weekly',
            content: (
              <DailyCountChart
                dailyCounts={topTenthActions.weekly}
                startDate={startDate}
                small
              />
            ),
          },
          {
            title: 'Monthly',
            content: (
              <DailyCountChart
                dailyCounts={topTenthActions.monthly}
                startDate={startDate}
                small
              />
            ),
          },
        ]}
      />

      <Title text="Total mana bet" />
      <p className="text-gray-500">
        Sum of bet amounts. (Divided by 100 to be more readable.)
      </p>
      <Tabs
        defaultIndex={1}
        tabs={[
          {
            title: 'Daily',
            content: (
              <DailyCountChart
                dailyCounts={manaBet.daily}
                startDate={startDate}
                small
              />
            ),
          },
          {
            title: 'Weekly',
            content: (
              <DailyCountChart
                dailyCounts={manaBet.weekly}
                startDate={startDate}
                small
              />
            ),
          },
          {
            title: 'Monthly',
            content: (
              <DailyCountChart
                dailyCounts={manaBet.monthly}
                startDate={startDate}
                small
              />
            ),
          },
        ]}
      />
    </Col>
  )
}

export function FirebaseAnalytics() {
  // Edit dashboard at https://datastudio.google.com/u/0/reporting/faeaf3a4-c8da-4275-b157-98dad017d305/page/Gg3/edit

  return (
    <>
      <p className="text-gray-500">
        Less accurate; includes all viewers (not just signed-in users).
      </p>
      <Spacer h={4} />
      <iframe
        className="w-full border-0"
        height={2200}
        src="https://datastudio.google.com/embed/reporting/faeaf3a4-c8da-4275-b157-98dad017d305/page/Gg3"
        frameBorder="0"
        allowFullScreen
      />
    </>
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
