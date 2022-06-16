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
import { Spacer } from 'web/components/layout/spacer'
import { Title } from 'web/components/title'

export const getStaticProps = fromPropz(getStaticPropz)
export async function getStaticPropz() {
  return queryTopCreators('weekly')
}
const queryTopCreators = async (period: LeaderboardPeriod) => {
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
  const [period, setPeriod] = useState<LeaderboardPeriod>('weekly')

  useEffect(() => {
    setLoading(true)
    queryTopCreators(period).then((res) => {
      setTopTraders(res.props.topTraders as User[])
      setTopCreators(res.props.topCreators as User[])
      setLoading(false)
    })
  }, [period])

  return (
    <Page margin>
      <Title text={'Leaderboards'} className={'hidden md:block'} />
      <Col className="gap-4 text-center">
        <select
          onChange={async (e) => {
            setPeriod(e.target.value as LeaderboardPeriod)
          }}
          value={period}
          className="!select !select-bordered max-w-xs"
        >
          <option value="allTime">All Time</option>
          <option value="monthly">Monthly</option>
          <option value="weekly">Weekly</option>
          <option value="daily">Daily</option>
        </select>
      </Col>
      <Spacer h={4} />

      <Col className="items-center gap-10 lg:flex-row">
        {!isLoading ? (
          <>
            <Leaderboard
              title="🏅 Top bettors"
              users={topTradersState}
              columns={[
                {
                  header: 'Total profit',
                  renderCell: (user) =>
                    formatMoney(user.totalPnLCached[period]),
                },
              ]}
            />
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
    </Page>
  )
}
