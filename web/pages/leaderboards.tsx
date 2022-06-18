import { Col } from 'web/components/layout/col'
import { Leaderboard } from 'web/components/leaderboard'
import { Page } from 'web/components/page'
import { getTopCreators, getTopTraders, User } from 'web/lib/firebase/users'
import { formatMoney } from 'common/util/format'
import { fromPropz, usePropz } from 'web/hooks/use-propz'
import { useTracking } from 'web/hooks/use-tracking'

export const getStaticProps = fromPropz(getStaticPropz)
export async function getStaticPropz() {
  const [topTraders, topCreators] = await Promise.all([
    getTopTraders().catch(() => {}),
    getTopCreators().catch(() => {}),
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
  const { topTraders, topCreators } = props

  useTracking('view leaderboards')

  return (
    <Page>
      <Col className="mx-4 items-center gap-10 lg:mx-0 lg:flex-row">
        <Leaderboard
          title="🏅 Top bettors"
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
              header: 'Total bet',
              renderCell: (user) => formatMoney(user.creatorVolumeCached),
            },
          ]}
        />
      </Col>
    </Page>
  )
}
