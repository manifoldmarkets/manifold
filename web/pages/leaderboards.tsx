import { Col } from 'web/components/layout/col'
import { Leaderboard } from 'web/components/leaderboard'
import { zip } from 'lodash'
import { Page } from 'web/components/layout/page'
import {
  getProfitRank,
  getTopCreators,
  getTopTraders,
  getTopFollowed,
  Period,
  User,
} from 'web/lib/firebase/users'
import { formatMoney } from 'common/util/format'
import { useEffect, useState } from 'react'
import { Title } from 'web/components/widgets/title'
import { Tabs } from 'web/components/layout/tabs'
import { useTracking } from 'web/hooks/use-tracking'
import { SEO } from 'web/components/SEO'
import { BETTORS } from 'common/user'
import { useUser } from 'web/hooks/use-user'

export async function getStaticProps() {
  const props = await fetchProps()

  return {
    props,
    revalidate: 60, // regenerate after a minute
  }
}

const fetchProps = async () => {
  const [allTime, monthly, weekly, daily] = await Promise.all([
    queryLeaderboardUsers('allTime'),
    queryLeaderboardUsers('monthly'),
    queryLeaderboardUsers('weekly'),
    queryLeaderboardUsers('daily'),
  ])
  const topFollowed = await getTopFollowed()

  return {
    allTime,
    monthly,
    weekly,
    daily,
    topFollowed,
  }
}

const queryLeaderboardUsers = async (period: Period) => {
  const [topTraders, topCreators] = await Promise.all([
    getTopTraders(period),
    getTopCreators(period),
  ])
  return {
    topTraders,
    topCreators,
  }
}

type leaderboard = {
  topTraders: User[]
  topCreators: User[]
}

export default function Leaderboards(_props: {
  allTime: leaderboard
  monthly: leaderboard
  weekly: leaderboard
  daily: leaderboard
  topFollowed: User[]
}) {
  const [props, setProps] = useState<Parameters<typeof Leaderboards>[0]>(_props)
  const [myRanks, setMyRanks] = useState<
    Record<Period, number | undefined> | undefined
  >()

  const user = useUser()

  useEffect(() => {
    fetchProps().then(setProps)
  }, [])

  useEffect(() => {
    if (!user?.profitCached) {
      return
    }
    const periods = ['allTime', 'monthly', 'weekly', 'daily'] as const
    Promise.all(
      periods.map((period) => {
        const myProfit = user.profitCached?.[period]
        if (myProfit == null) {
          return undefined
        } else {
          return getProfitRank(myProfit, period)
        }
      })
    ).then((results) => {
      setMyRanks(Object.fromEntries(zip(periods, results)))
    })
  }, [user?.profitCached])

  const { topFollowed } = props

  const LeaderboardWithPeriod = (period: Period, myRank?: number) => {
    const { topTraders, topCreators } = props[period]

    const user = useUser()
    const entries = topTraders.map((user, i) => ({ ...user, rank: i + 1 }))
    if (user && myRank != null && !entries.find((x) => x.id === user.id)) {
      entries.push({ ...user, rank: myRank })
    }

    return (
      <>
        <Col className="mx-4 items-center gap-10 lg:flex-row lg:items-start">
          <Leaderboard
            title={`🏅 Top ${BETTORS}`}
            entries={entries}
            columns={[
              {
                header: 'Total profit',
                renderCell: (user) => formatMoney(user.profitCached[period]),
              },
            ]}
            highlightUsername={user?.username}
          />

          <Leaderboard
            title="🏅 Top creators"
            entries={topCreators}
            columns={[
              {
                header: 'Number of traders',
                renderCell: (user) => user.creatorTraders[period],
              },
            ]}
            highlightUsername={user?.username}
          />
        </Col>
        {period === 'allTime' ? (
          <Col className="mx-4 my-10 items-center gap-10 lg:mx-0 lg:w-1/2 lg:flex-row">
            <Leaderboard
              title="🏅 Top followed"
              entries={topFollowed}
              columns={[
                {
                  header: 'Total followers',
                  renderCell: (user) => user.followerCountCached,
                },
              ]}
              highlightUsername={user?.username}
            />
          </Col>
        ) : (
          <></>
        )}
      </>
    )
  }
  useTracking('view leaderboards')

  return (
    <Page>
      <SEO
        title="Leaderboards"
        description={`Manifold's leaderboards show the top ${BETTORS} and market creators.`}
        url="/leaderboards"
      />
      <Title text={'Leaderboards'} className={'hidden md:block'} />
      <div className="mb-4 text-gray-500">Updated every 15 minutes</div>
      <Tabs
        className="mb-4"
        currentPageForAnalytics={'leaderboards'}
        defaultIndex={1}
        tabs={[
          {
            title: 'Daily',
            content: LeaderboardWithPeriod('daily', myRanks?.['daily']),
          },
          {
            title: 'Weekly',
            content: LeaderboardWithPeriod('weekly', myRanks?.['weekly']),
          },
          {
            title: 'Monthly',
            content: LeaderboardWithPeriod('monthly', myRanks?.['monthly']),
          },
          {
            title: 'All Time',
            content: LeaderboardWithPeriod('allTime', myRanks?.['allTime']),
          },
        ]}
      />
    </Page>
  )
}
