import dayjs from 'dayjs'
import _ from 'lodash'
import { IS_PRIVATE_MANIFOLD } from '../../common/envs/constants'
import {
  DailyCountChart,
  DailyPercentChart,
} from '../components/analytics/charts'
import { Col } from '../components/layout/col'
import { Spacer } from '../components/layout/spacer'
import { Tabs } from '../components/layout/tabs'
import { Page } from '../components/page'
import { Title } from '../components/title'
import { fromPropz, usePropz } from '../hooks/use-propz'
import { getDailyBets } from '../lib/firebase/bets'
import { getDailyComments } from '../lib/firebase/comments'
import { getDailyContracts } from '../lib/firebase/contracts'

export const getStaticProps = fromPropz(getStaticPropz)
export async function getStaticPropz() {
  const numberOfDays = 80
  const today = dayjs(dayjs().format('YYYY-MM-DD'))
  const startDate = today.subtract(numberOfDays, 'day')

  const [dailyBets, dailyContracts, dailyComments] = await Promise.all([
    getDailyBets(startDate.valueOf(), numberOfDays),
    getDailyContracts(startDate.valueOf(), numberOfDays),
    getDailyComments(startDate.valueOf(), numberOfDays),
  ])

  const dailyBetCounts = dailyBets.map((bets) => bets.length)
  const dailyContractCounts = dailyContracts.map(
    (contracts) => contracts.length
  )
  const dailyCommentCounts = dailyComments.map((comments) => comments.length)

  const dailyUserIds = _.zip(dailyContracts, dailyBets, dailyComments).map(
    ([contracts, bets, comments]) => {
      const creatorIds = (contracts ?? []).map((c) => c.creatorId)
      const betUserIds = (bets ?? []).map((bet) => bet.userId)
      const commentUserIds = (comments ?? []).map((comment) => comment.userId)
      return _.uniq([...creatorIds, ...betUserIds, ...commentUserIds])
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
    const retainedCount = _.sumBy(Array.from(activeTwoWeeksAgo), (userId) =>
      activeLastWeek.has(userId) ? 1 : 0
    )
    const retainedFrac = retainedCount / activeTwoWeeksAgo.size
    return Math.round(retainedFrac * 100 * 100) / 100
  })

  return {
    props: {
      startDate: startDate.valueOf(),
      dailyActiveUsers,
      weeklyActiveUsers,
      monthlyActiveUsers,
      dailyBetCounts,
      dailyContractCounts,
      dailyCommentCounts,
      weekOnWeekRetention,
    },
    revalidate: 12 * 60 * 60, // regenerate after half a day
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
  weekOnWeekRetention: number[]
}) {
  props = usePropz(props, getStaticPropz) ?? {
    startDate: 0,
    dailyActiveUsers: [],
    weeklyActiveUsers: [],
    monthlyActiveUsers: [],
    dailyBetCounts: [],
    dailyContractCounts: [],
    dailyCommentCounts: [],
    weekOnWeekRetention: [],
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
  weekOnWeekRetention: number[]
}) {
  const {
    startDate,
    dailyActiveUsers,
    dailyBetCounts,
    dailyContractCounts,
    dailyCommentCounts,
    weeklyActiveUsers,
    monthlyActiveUsers,
    weekOnWeekRetention,
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
        ]}
      />

      <Spacer h={8} />

      <Title text="Week-on-week retention" />
      <p className="text-gray-500">
        Out of all active users 2 weeks ago, how many came back last week?
      </p>
      <DailyPercentChart
        dailyPercent={weekOnWeekRetention.slice(7)}
        startDate={oneWeekLaterDate}
        small
      />
      <Spacer h={8} />

      <Title text="Ratio of Active Users" />
      <Tabs
        defaultIndex={0}
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
