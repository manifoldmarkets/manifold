import _ from 'lodash'

import { Col } from '../components/layout/col'
import { Leaderboard } from '../components/leaderboard'
import { Page } from '../components/page'
import { getTopCreators, getTopTraders, User } from '../lib/firebase/users'
import { formatMoney } from '../../common/util/format'
import { fromPropz, usePropz } from '../hooks/use-propz'
import { Manaboard } from '../components/manaboard'
import { Title } from '../components/title'

export const getStaticProps = fromPropz(getStaticPropz)
export async function getStaticPropz() {
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

function Leaderboards(props: { topTraders: User[]; topCreators: User[] }) {
  props = usePropz(props, getStaticPropz) ?? {
    topTraders: [],
    topCreators: [],
  }
  const { topTraders, topCreators } = props

  return (
    <Page margin>
      <Col className="items-center gap-10 lg:flex-row">
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

function Explanation() {
  return (
    <div className="prose mt-8 text-gray-600">
      <h3 id="how-this-works">How this works</h3>
      <ol>
        <li>
          Every slot has an &quot;assessed value&quot;: what the current holder
          thinks the slot is worth.
        </li>
        <li>Slot holders pay a 10% per hour tax to Manafold on the value.</li>
        <li>
          At any time, you can buy a leaderboard slot from the current holder
          for its value.
        </li>
        <li>Then, you can reassess it to a new value!</li>
      </ol>
      <p>
        <em>
          Note: this mechanism is known as a{' '}
          <a href="https://medium.com/@simondlr/what-is-harberger-tax-where-does-the-blockchain-fit-in-1329046922c6">
            Harberger Tax
          </a>
          !
        </em>
      </p>
    </div>
  )
}

export default function Manaboards(props: {
  topTraders: User[]
  topCreators: User[]
}) {
  props = usePropz(props, getStaticPropz) ?? {
    topTraders: [],
    topCreators: [],
  }
  const { topTraders, topCreators } = props

  return (
    <Page margin rightSidebar={<Explanation />}>
      <Title text={'Leaderboards (FOR SALE!)'} />
      <div className="prose mb-8 text-gray-600">
        <p>
          Manafold Markets is running low on mana, so we&#39;re selling our
          leaderboard slots to make up the deficit. Buy one now for ephemeral
          glory, and help keep Manafold afloat!
        </p>
      </div>

      <Col className="mt-6 items-center gap-10">
        <Manaboard title="🏅 Top traders" users={topTraders} />
        <Manaboard title="🏅 Top creators" users={topCreators} />
      </Col>
    </Page>
  )
}
