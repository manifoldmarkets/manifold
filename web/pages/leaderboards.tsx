import _ from 'lodash'

import { Col } from '../components/layout/col'
import { Leaderboard } from '../components/leaderboard'
import { Page } from '../components/page'
import { getTopCreators, getTopTraders, User } from '../lib/firebase/users'
import { formatMoney } from '../../common/util/format'
import { fromPropz, usePropz } from '../hooks/use-propz'
import { Manaboard } from '../components/manaboard'
import { Title } from '../components/title'
import { useTransactions } from '../hooks/use-transactions'
import { SlotData, Transaction } from '../lib/firebase/transactions'

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
          thinks their slot is worth.
        </li>
        <li>Slot holders pay a continuous fee of 10% per hour to Manafold.</li>
        <li>
          At any time, you can pay the assessed value of a slot to buy it from
          the current holder.
        </li>
        <li>
          The slot is now yours! You can customize the message, or reassess it
          to a new value.
        </li>
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
// TODOs
// [ ] Correctly calculate tax
// [ ] List history of purchases at the bottom
// [ ] Restrict to at most buying one slot per user?
// [ ] Deduct amount from user's balance, either in UX or for real
export default function Manaboards(props: {
  topTraders: User[]
  topCreators: User[]
}) {
  props = usePropz(props, getStaticPropz) ?? {
    topTraders: [],
    topCreators: [],
  }
  const { topTraders, topCreators } = props

  const values = Array.from(Array(topTraders.length).keys())
    .map((i) => i + 1)
    .reverse()

  // Find the most recent purchases of each slot, and replace the entries in topTraders
  const transactions = useTransactions() ?? []
  // Iterate from oldest to newest transactions, so recent purchases overwrite older ones
  const sortedTxns = _.sortBy(transactions, 'createdTime')
  for (const txn of sortedTxns) {
    if (txn.category === 'BUY_LEADERBOARD_SLOT') {
      const buyer = userFromBuy(txn)
      const data = txn.data as SlotData
      const slot = data.slot
      topTraders[slot - 1] = buyer
      values[slot - 1] = data.newValue
    }
  }

  function userFromBuy(txn: Transaction): User {
    return {
      id: txn.fromId,
      // @ts-ignore
      name: txn.data?.message ?? txn.fromName,
      username: txn.fromUsername,
      avatarUrl: txn.fromAvatarUrl,

      // Dummy data which shouldn't be relied on
      createdTime: 0,
      creatorVolumeCached: 0,
      totalPnLCached: 0,
      balance: 0,
      totalDeposits: 0,
    }
  }

  return (
    <Page margin rightSidebar={<Explanation />}>
      <Title text={'🏅 Leaderboards'} />
      {/* <div className="absolute right-[700px] top-8">
        <img
          className="h-18 mx-auto w-24 object-cover transition hover:rotate-12"
          src="https://i.etsystatic.com/8800089/r/il/b79fe6/1591362635/il_fullxfull.1591362635_4523.jpg"
        />
      </div> */}
      <div className="prose mb-8 text-gray-600">
        <p>
          Manafold Markets is running low on mana, so we&#39;re selling our
          leaderboard slots to make up the deficit. Buy one now for ephemeral
          glory, and help keep Manafold afloat!
        </p>
      </div>

      <Col className="mt-6 items-center gap-10">
        <Manaboard title="" users={topTraders} values={values} />
        {/* <Manaboard title="🏅 Top creators" users={topCreators} /> */}
      </Col>
    </Page>
  )
}
