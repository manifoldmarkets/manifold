import _ from 'lodash'
import { Col } from '../components/layout/col'
import { Leaderboard } from '../components/leaderboard'
import { Page } from '../components/page'
import { getTopCreators, getTopTraders, User } from '../lib/firebase/users'
import { formatMoney } from '../lib/util/format'

export async function getStaticProps() {
  const [topTraders, topCreators] = await Promise.all([
    getTopTraders().catch((_) => {}),
    getTopCreators().catch((_) => {}),
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
  const { topTraders, topCreators } = props

  return (
    <Page>
      <Col className="items-center lg:flex-row gap-10">
        <Leaderboard
          title="🏅 Top traders"
          users={topTraders}
          columns={[
            {
              header: 'Total profit',
              renderCell: (user) => formatMoney(user.totalPnLCached),
            },
          ]}
        />
        <Leaderboard
          title="🏅 Top creators"
          users={topCreators}
          columns={[
            {
              header: 'Market volume',
              renderCell: (user) => formatMoney(user.creatorVolumeCached),
            },
          ]}
        />
      </Col>
    </Page>
  )
}
