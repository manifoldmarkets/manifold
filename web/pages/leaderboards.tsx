import { Col } from 'web/components/layout/col'
import { Leaderboard } from 'web/components/leaderboard'
import { Page } from 'web/components/layout/page'
import {
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
  const user = useUser()
  useEffect(() => {
    fetchProps().then((props) => {
      if (!user || !user.profitRankCached) {
        setProps(props)
        return
      }
      const { allTime, monthly, weekly, daily, topFollowed } = props
      let leaderboards = [allTime, monthly, weekly, daily]
      leaderboards = leaderboards.map((leaderboard) => {
        const { topTraders, topCreators } = leaderboard
        // We're only caching users' profits for now
        if (!topTraders.find((u) => u.id === user?.id)) {
          topTraders.push(user)
        }
        return { topTraders, topCreators }
      })
      setProps({
        allTime: leaderboards[0],
        monthly: leaderboards[1],
        weekly: leaderboards[2],
        daily: leaderboards[3],
        topFollowed,
      })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    user?.profitRankCached?.allTime,
    user?.profitRankCached?.monthly,
    user?.profitRankCached?.weekly,
    user?.profitRankCached?.daily,
  ])

  const { topFollowed } = props

  const LeaderboardWithPeriod = (period: Period) => {
    const { topTraders, topCreators } = props[period]
    const user = useUser()

    return (
      <>
        <Col className="mx-4 items-center gap-10 lg:flex-row">
          <Leaderboard
            title={`🏅 Top ${BETTORS}`}
            // We're only caching profitRank for now
            entries={topTraders.map((user) => ({
              ...user,
              rank: user.profitRankCached?.[period],
            }))}
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
                header: 'Total bet',
                renderCell: (user) =>
                  formatMoney(user.creatorVolumeCached[period]),
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
      <div className="text-gray-500 mb-4">Updated every 15 minutes</div>
      <Tabs
        className="mb-4"
        currentPageForAnalytics={'leaderboards'}
        defaultIndex={1}
        tabs={[
          {
            title: 'Daily',
            content: LeaderboardWithPeriod('daily'),
          },
          {
            title: 'Weekly',
            content: LeaderboardWithPeriod('weekly'),
          },
          {
            title: 'Monthly',
            content: LeaderboardWithPeriod('monthly'),
          },
          {
            title: 'All Time',
            content: LeaderboardWithPeriod('allTime'),
          },
        ]}
      />
    </Page>
  )
}
