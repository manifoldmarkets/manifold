import { Col } from 'web/components/layout/col'
import { Leaderboard } from 'web/components/leaderboard'
import { zip } from 'lodash'
import { Page } from 'web/components/layout/page'
import {
  getCreatorRank,
  getProfitRank,
  getTopCreators,
  getTopFollowed,
  getTopTraders,
  Period,
  User,
} from 'web/lib/firebase/users'
import { formatMoney, formatWithCommas } from 'common/util/format'
import { useEffect, useState } from 'react'
import { Title } from 'web/components/widgets/title'
import { Tabs } from 'web/components/layout/tabs'
import { useTracking } from 'web/hooks/use-tracking'
import { SEO } from 'web/components/SEO'
import { BETTORS } from 'common/user'
import { useUser } from 'web/hooks/use-user'
import { InfoTooltip } from 'web/components/widgets/info-tooltip'

export async function getStaticProps() {
  const [allTime, monthly, weekly, daily] = await Promise.all([
    queryLeaderboardUsers('allTime'),
    queryLeaderboardUsers('monthly'),
    queryLeaderboardUsers('weekly'),
    queryLeaderboardUsers('daily'),
  ])
  const topFollowed = await getTopFollowed()
  return {
    props: {
      allTime,
      monthly,
      weekly,
      daily,
      topFollowed,
    },
    revalidate: 60, // regenerate after a minute
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
type ranking = {
  profit: number
  traders: number
}
export default function Leaderboards(props: {
  allTime: leaderboard
  monthly: leaderboard
  weekly: leaderboard
  daily: leaderboard
  topFollowed: User[]
}) {
  const [myRanks, setMyRanks] = useState<
    Record<Period, ranking | undefined> | undefined
  >()

  const user = useUser()

  useEffect(() => {
    if (!user?.profitCached) {
      return
    }
    const periods = ['allTime', 'monthly', 'weekly', 'daily'] as const
    Promise.all(
      periods.map(async (period) => {
        const rankings = {} as ranking
        const myProfit = user.profitCached?.[period]
        if (myProfit != null) {
          rankings.profit = await getProfitRank(myProfit, period)
        }
        const myTraders = user.creatorTraders?.[period]
        if (myTraders != null) {
          rankings.traders = await getCreatorRank(myTraders, period)
        }
        return rankings
      })
    ).then((results) => {
      setMyRanks(Object.fromEntries(zip(periods, results)))
    })
  }, [user?.creatorTraders, user?.profitCached])

  const { topFollowed } = props

  const LeaderboardWithPeriod = (period: Period, myRank?: ranking) => {
    const { topTraders, topCreators } = props[period]

    const user = useUser()
    const topTraderEntries = topTraders.map((user, i) => ({
      ...user,
      rank: i + 1,
    }))
    const topCreatorEntries = topCreators.map((user, i) => ({
      ...user,
      rank: i + 1,
    }))
    if (user && myRank != null) {
      if (
        myRank.profit != null &&
        !topTraderEntries.find((x) => x.id === user.id)
      ) {
        topTraderEntries.push({ ...user, rank: myRank.profit })
      }
      if (
        myRank.traders != null &&
        !topCreatorEntries.find((x) => x.id === user.id)
      ) {
        topCreatorEntries.push({ ...user, rank: myRank.traders })
      }
    }

    return (
      <>
        <Col className="items-center gap-10 lg:flex-row lg:items-start">
          <Leaderboard
            title={`🏅 Top ${BETTORS}`}
            entries={topTraderEntries}
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
            entries={topCreatorEntries}
            columns={[
              {
                header: 'Traders',
                renderCell: (user) =>
                  formatWithCommas(user.creatorTraders[period]),
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
      <Col className="mb-4 p-2">
        <Title className={'hidden md:block'}>
          Leaderboards <InfoTooltip text="Updated every 15 minutes" />
        </Title>

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
      </Col>
    </Page>
  )
}
