import { Col } from 'web/components/layout/col'
import { Leaderboard } from 'web/components/leaderboard'
import { Page } from 'web/components/page'
import {
  getTopCreators,
  getTopTraders,
  getTopFollowed,
  Period,
  User,
} from 'web/lib/firebase/users'
import { formatMoney } from 'common/util/format'
import { useEffect, useState } from 'react'
import { Title } from 'web/components/title'
import { Tabs } from 'web/components/layout/tabs'
import { useTracking } from 'web/hooks/use-tracking'

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
  useEffect(() => {
    fetchProps().then((props) => setProps(props))
  }, [])

  const { topFollowed } = props

  const LeaderboardWithPeriod = (period: Period) => {
    const { topTraders, topCreators } = props[period]

    return (
      <>
        <Col className="mx-4 items-center gap-10 lg:flex-row">
          <Leaderboard
            title="🏅 Top bettors"
            users={topTraders}
            columns={[
              {
                header: 'Total profit',
                renderCell: (user) => formatMoney(user.profitCached[period]),
              },
            ]}
          />

          <Leaderboard
            title="🏅 Top creators"
            users={topCreators}
            columns={[
              {
                header: 'Total bet',
                renderCell: (user) =>
                  formatMoney(user.creatorVolumeCached[period]),
              },
            ]}
          />
        </Col>
        {period === 'allTime' ? (
          <Col className="mx-4 my-10 items-center gap-10 lg:mx-0 lg:w-1/2 lg:flex-row">
            <Leaderboard
              title="🏅 Top followed"
              users={topFollowed}
              columns={[
                {
                  header: 'Total followers',
                  renderCell: (user) => user.followerCountCached,
                },
              ]}
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
      <Title text={'Leaderboards'} className={'hidden md:block'} />
      <Tabs
        currentPageForAnalytics={'leaderboards'}
        defaultIndex={1}
        tabs={[
          {
            title: 'All Time',
            content: LeaderboardWithPeriod('allTime'),
          },
          // TODO: Enable this near the end of July!
          // {
          //   title: 'Monthly',
          //   content: LeaderboardWithPeriod('monthly'),
          // },
          {
            title: 'Weekly',
            content: LeaderboardWithPeriod('weekly'),
          },
          {
            title: 'Daily',
            content: LeaderboardWithPeriod('daily'),
          },
        ]}
      />
    </Page>
  )
}
