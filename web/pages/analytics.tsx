import dayjs from 'dayjs'
import { zip, uniq, sumBy } from 'lodash'
import { IS_PRIVATE_MANIFOLD } from 'common/envs/constants'
import {
  DailyCountChart,
  DailyPercentChart,
} from 'web/components/analytics/charts'
import { Col } from 'web/components/layout/col'
import { Spacer } from 'web/components/layout/spacer'
import { Tabs } from 'web/components/layout/tabs'
import { Page } from 'web/components/page'
import { Title } from 'web/components/title'
import { fromPropz, usePropz } from 'web/hooks/use-propz'
import { getDailyBets } from 'web/lib/firebase/bets'
import { getDailyComments } from 'web/lib/firebase/comments'
import { getDailyContracts } from 'web/lib/firebase/contracts'
import { getDailyNewUsers } from 'web/lib/firebase/users'

export const getStaticProps = fromPropz(getStaticPropz)
export async function getStaticPropz() {
  const numberOfDays = 45
  const tomorrow = dayjs(dayjs().format('YYYY-MM-DD'))
    .add(1, 'day')
    // Convert from UTC midnight to PT midnight.
    .add(7, 'hours')

  const startDate = tomorrow.subtract(numberOfDays, 'day')

  const [dailyBets, dailyContracts, dailyComments, dailyNewUsers] =
    await Promise.all([
      getDailyBets(startDate.valueOf(), numberOfDays),
      getDailyContracts(startDate.valueOf(), numberOfDays),
      getDailyComments(startDate.valueOf(), numberOfDays),
      getDailyNewUsers(startDate.valueOf(), numberOfDays),
    ])

  const dailyBetCounts = dailyBets.map((bets) => bets.length)
  const dailyContractCounts = dailyContracts.map(
    (contracts) => contracts.length
  )
  const dailyCommentCounts = dailyComments.map((comments) => comments.length)

  const dailyUserIds = zip(dailyContracts, dailyBets, dailyComments).map(
    ([contracts, bets, comments]) => {
      const creatorIds = (contracts ?? []).map((c) => c.creatorId)
      const betUserIds = (bets ?? []).map((bet) => bet.userId)
      const commentUserIds = (comments ?? []).map((comment) => comment.userId)
      return uniq([...creatorIds, ...betUserIds, ...commentUserIds])
    }
  )

  const dailyActiveUsers = dailyUserIds.map((userIds) => userIds.length)

  const weeklyActiveUsers = dailyUserIds.map((_, i) => {
    const start = Math.max(0, i - 6)
    const end = i
    const uniques = new Set<string>()
    for (let j = start; j <= end; j++)
      dailyUserIds[j].forEach((userId) => uniques.add(userId))
    return uniques.size
  })

  const monthlyActiveUsers = dailyUserIds.map((_, i) => {
    const start = Math.max(0, i - 30)
    const end = i
    const uniques = new Set<string>()
    for (let j = start; j <= end; j++)
      dailyUserIds[j].forEach((userId) => uniques.add(userId))
    return uniques.size
  })

  const weekOnWeekRetention = dailyUserIds.map((_userId, i) => {
    const twoWeeksAgo = {
      start: Math.max(0, i - 13),
      end: Math.max(0, i - 7),
    }
    const lastWeek = {
      start: Math.max(0, i - 6),
      end: i,
    }

    const activeTwoWeeksAgo = new Set<string>()
    for (let j = twoWeeksAgo.start; j <= twoWeeksAgo.end; j++) {
      dailyUserIds[j].forEach((userId) => activeTwoWeeksAgo.add(userId))
    }
    const activeLastWeek = new Set<string>()
    for (let j = lastWeek.start; j <= lastWeek.end; j++) {
      dailyUserIds[j].forEach((userId) => activeLastWeek.add(userId))
    }
    const retainedCount = sumBy(Array.from(activeTwoWeeksAgo), (userId) =>
      activeLastWeek.has(userId) ? 1 : 0
    )
    const retainedFrac = retainedCount / activeTwoWeeksAgo.size
    return Math.round(retainedFrac * 100 * 100) / 100
  })

  const monthlyRetention = dailyUserIds.map((_userId, i) => {
    const twoMonthsAgo = {
      start: Math.max(0, i - 60),
      end: Math.max(0, i - 30),
    }
    const lastMonth = {
      start: Math.max(0, i - 30),
      end: i,
    }

    const activeTwoMonthsAgo = new Set<string>()
    for (let j = twoMonthsAgo.start; j <= twoMonthsAgo.end; j++) {
      dailyUserIds[j].forEach((userId) => activeTwoMonthsAgo.add(userId))
    }
    const activeLastMonth = new Set<string>()
    for (let j = lastMonth.start; j <= lastMonth.end; j++) {
      dailyUserIds[j].forEach((userId) => activeLastMonth.add(userId))
    }
    const retainedCount = sumBy(Array.from(activeTwoMonthsAgo), (userId) =>
      activeLastMonth.has(userId) ? 1 : 0
    )
    const retainedFrac = retainedCount / activeTwoMonthsAgo.size
    return Math.round(retainedFrac * 100 * 100) / 100
  })

  const firstBetDict: { [userId: string]: number } = {}
  for (let i = 0; i < dailyBets.length; i++) {
    const bets = dailyBets[i]
    for (const bet of bets) {
      if (bet.userId in firstBetDict) continue
      firstBetDict[bet.userId] = i
    }
  }
  const weeklyActivationRate = dailyNewUsers.map((_, i) => {
    const start = Math.max(0, i - 6)
    const end = i
    let activatedCount = 0
    let newUsers = 0
    for (let j = start; j <= end; j++) {
      const userIds = dailyNewUsers[j].map((user) => user.id)
      newUsers += userIds.length
      for (const userId of userIds) {
        const dayIndex = firstBetDict[userId]
        if (dayIndex !== undefined && dayIndex <= end) {
          activatedCount++
        }
      }
    }
    const frac = activatedCount / (newUsers || 1)
    return Math.round(frac * 100 * 100) / 100
  })
  const dailySignups = dailyNewUsers.map((users) => users.length)

  return {
    props: {
      startDate: startDate.valueOf(),
      dailyActiveUsers,
      weeklyActiveUsers,
      monthlyActiveUsers,
      dailyBetCounts,
      dailyContractCounts,
      dailyCommentCounts,
      dailySignups,
      weekOnWeekRetention,
      weeklyActivationRate,
      monthlyRetention,
    },
    revalidate: 60 * 60, // Regenerate after an hour
  }
}

export default function Analytics(props: {
  startDate: number
  dailyActiveUsers: number[]
  weeklyActiveUsers: number[]
  monthlyActiveUsers: number[]
  dailyBetCounts: number[]
  dailyContractCounts: number[]
  dailyCommentCounts: number[]
  dailySignups: number[]
  weekOnWeekRetention: number[]
  monthlyRetention: number[]
  weeklyActivationRate: number[]
}) {
  props = usePropz(props, getStaticPropz) ?? {
    startDate: 0,
    dailyActiveUsers: [],
    weeklyActiveUsers: [],
    monthlyActiveUsers: [],
    dailyBetCounts: [],
    dailyContractCounts: [],
    dailyCommentCounts: [],
    dailySignups: [],
    weekOnWeekRetention: [],
    monthlyRetention: [],
    weeklyActivationRate: [],
  }
  return (
    <Page>
      <CustomAnalytics {...props} />
      <Spacer h={8} />
      {!IS_PRIVATE_MANIFOLD && <FirebaseAnalytics />}
    </Page>
  )
}

export function CustomAnalytics(props: {
  startDate: number
  dailyActiveUsers: number[]
  weeklyActiveUsers: number[]
  monthlyActiveUsers: number[]
  dailyBetCounts: number[]
  dailyContractCounts: number[]
  dailyCommentCounts: number[]
  dailySignups: number[]
  weekOnWeekRetention: number[]
  monthlyRetention: number[]
  weeklyActivationRate: number[]
}) {
  const {
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
  } = props

  const startDate = dayjs(props.startDate).add(12, 'hours').valueOf()

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

      <Title text="Daily activity" />
      <Tabs
        defaultIndex={0}
        tabs={[
          {
            title: 'Trades',
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
    </Col>
  )
}

export function FirebaseAnalytics() {
  // Edit dashboard at https://datastudio.google.com/u/0/reporting/faeaf3a4-c8da-4275-b157-98dad017d305/page/Gg3/edit

  return (
    <>
      <Title text="Google Analytics" />
      <p className="text-gray-500">
        Less accurate; includes all viewers (not just signed-in users).
      </p>
      <Spacer h={4} />
      <iframe
        className="w-full"
        height={2200}
        src="https://datastudio.google.com/embed/reporting/faeaf3a4-c8da-4275-b157-98dad017d305/page/Gg3"
        frameBorder="0"
        style={{ border: 0 }}
        allowFullScreen
      />
    </>
  )
}
