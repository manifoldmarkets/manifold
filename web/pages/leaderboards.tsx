import { Col } from 'web/components/layout/col'
import { Leaderboard } from 'web/components/leaderboard'
import { Page } from 'web/components/page'
import {
  getTopCreators,
  getTopTraders,
  LeaderboardPeriod,
  User,
} from 'web/lib/firebase/users'
import { formatMoney } from 'common/util/format'
import { fromPropz, usePropz } from 'web/hooks/use-propz'
import { useEffect, useState } from 'react'
import { LoadingIndicator } from 'web/components/loading-indicator'
import { Title } from 'web/components/title'
import { Tabs } from 'web/components/layout/tabs'
import { useTracking } from 'web/hooks/use-tracking'

export const getStaticProps = fromPropz(getStaticPropz)
export async function getStaticPropz() {
  return queryLeaderboardUsers('allTime')
}
const queryLeaderboardUsers = async (period: LeaderboardPeriod) => {
  const [topTraders, topCreators] = await Promise.all([
    getTopTraders(period).catch(() => {}),
    getTopCreators(period).catch(() => {}),
  ])
  return {
    props: {
      topTraders,
      topCreators,
    },
    revalidate: 60, // regenerate after a minute
  }
}

export default function Leaderboards(props: {
  topTraders: User[]
  topCreators: User[]
}) {
  props = usePropz(props, getStaticPropz) ?? {
    topTraders: [],
    topCreators: [],
  }

  const [topTradersState, setTopTraders] = useState(props.topTraders)
  const [topCreatorsState, setTopCreators] = useState(props.topCreators)
  const [isLoading, setLoading] = useState(false)
  const [period, setPeriod] = useState<LeaderboardPeriod>('allTime')

  useEffect(() => {
    setLoading(true)
    queryLeaderboardUsers(period).then((res) => {
      setTopTraders(res.props.topTraders as User[])
      setTopCreators(res.props.topCreators as User[])
      setLoading(false)
    })
  }, [period])

  const LeaderboardWithPeriod = (period: LeaderboardPeriod) => {
    return (
      <Col className="items-center gap-10 lg:flex-row">
        {!isLoading ? (
          <>
            {period === 'allTime' ? ( //TODO: show other periods once they're available
              <Leaderboard
                title="🏅 Top bettors"
                users={topTradersState}
                columns={[
                  {
                    header: 'Total profit',
                    renderCell: (user) =>
                      formatMoney(user.profitCached[period]),
                  },
                ]}
              />
            ) : (
              <></>
            )}

            <Leaderboard
              title="🏅 Top creators"
              users={topCreatorsState}
              columns={[
                {
                  header: 'Total bet',
                  renderCell: (user) =>
                    formatMoney(user.creatorVolumeCached[period]),
                },
              ]}
            />
          </>
        ) : (
          <LoadingIndicator spinnerClassName={'border-gray-500'} />
        )}
      </Col>
    )
  }
  useTracking('view leaderboards')

  return (
    <Page margin>
      <Title text={'Leaderboards'} className={'hidden md:block'} />
      <Tabs
        defaultIndex={0}
        onClick={(title, index) => {
          const period = ['allTime', 'monthly', 'weekly', 'daily'][index]
          setPeriod(period as LeaderboardPeriod)
        }}
        tabs={[
          {
            title: 'All Time',
            content: LeaderboardWithPeriod('allTime'),
          },
          {
            title: 'Monthly',
            content: LeaderboardWithPeriod('monthly'),
          },
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
