import _ from 'lodash'
import { Col } from '../../../components/layout/col'
import { Leaderboard } from '../../../components/leaderboard'
import { Page } from '../../../components/page'
import { formatMoney } from '../../../lib/util/format'

export async function getStaticProps() {
  return {
    props: {},

    revalidate: 60, // regenerate after a minute
  }
}

export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}

export default function Leaderboards(props: {}) {
  return (
    <Page>
      <Col className="items-center lg:flex-row gap-10">
        <Leaderboard
          title="🏅 Top traders"
          users={[]}
          columns={[
            {
              header: 'Total profit',
              renderCell: (user) => formatMoney(user.totalPnLCached),
            },
          ]}
        />
        <Leaderboard
          title="🏅 Top creators"
          users={[]}
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
