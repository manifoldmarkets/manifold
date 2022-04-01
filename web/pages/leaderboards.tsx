import _ from 'lodash'

import { Col } from '../components/layout/col'
import { Leaderboard } from '../components/leaderboard'
import { Page } from '../components/page'
import { getTopCreators, getTopTraders, User } from '../lib/firebase/users'
import { formatMoney } from '../../common/util/format'
import { fromPropz, usePropz } from '../hooks/use-propz'
import { Manaboard } from '../components/manaboard'
import { Title } from '../components/title'
import { saveFakeBalance, useTransactions } from '../hooks/use-transactions'
import { SlotData, Transaction } from '../lib/firebase/transactions'

import { Grid, _ as r } from 'gridjs-react'
import 'gridjs/dist/theme/mermaid.css'
import { html } from 'gridjs'
import dayjs from 'dayjs'
import { useUser } from '../hooks/use-user'

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
        <li>Slot holders pay a continuous fee of 25% per hour to Manafold.</li>
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

      <h3 id="where-did-manafold-s-mana-go-">
        Where did Manafold&#39;s mana go?
      </h3>
      <p>
        Honestly, we&#39;re as puzzled as you are. Leading theories include:
      </p>
      <ul>
        <li>Leaky abstractions in our manabase</li>
        <li>One too many floating-point rounding errors</li>
        <li>
          Our newest user <code>Robert&#39;);DROP TABLE Balances;--</code>
        </li>
      </ul>
      <p>
        We&#39;d be happy to pay a bounty to anyone who can help us solve this
        riddle... oh wait.
      </p>
    </div>
  )
}

// TODOs
// [ ] Expandable text for explainer
// [ ] Draw attention to leaderboard
// [ ] Show total returned to Manifold
// [ ] Restrict buying to your fake balance
// [ ] Restrict to at most buying one slot per user?
export default function Manaboards(props: {
  topTraders: User[]
  topCreators: User[]
}) {
  props = usePropz(props, getStaticPropz) ?? {
    topTraders: [],
    topCreators: [],
  }
  const { topTraders, topCreators } = props
  const user = useUser()

  const values = Array.from(Array(topTraders.length).keys())
    .map((i) => i + 1)
    .reverse()
  const createdTimes = new Array(topTraders.length).fill(0)

  // Find the most recent purchases of each slot, and replace the entries in topTraders
  const txns = useTransactions() ?? []
  // Iterate from oldest to newest transactions, so recent purchases overwrite older ones
  const sortedTxns = _.sortBy(txns, 'createdTime')
  for (const txn of sortedTxns) {
    if (txn.category === 'BUY_LEADERBOARD_SLOT') {
      const buyer = userFromBuy(txn)
      const data = txn.data as SlotData
      const slot = data.slot
      topTraders[slot - 1] = buyer
      values[slot - 1] = data.newValue
      createdTimes[slot - 1] = txn.createdTime
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

  const MANIFOLD_ID = 'IPTOzEqrpkWmEzh6hwvAyY9PqFb2'
  if (user?.balance) {
    saveFakeBalance(userProfits(user.id, txns) + user.balance)
  }

  return (
    <Page margin rightSidebar={<Explanation />}>
      <Title text={'🏅 Leaderboard slots, for sale!'} />
      {/* <div className="absolute right-[700px] top-8">
        <img
          className="h-18 mx-auto w-24 object-cover transition hover:rotate-12"
          src="https://i.etsystatic.com/8800089/r/il/b79fe6/1591362635/il_fullxfull.1591362635_4523.jpg"
        />
      </div> */}
      <div className="prose mb-8 text-gray-600">
        <p>
          Manafold Markets is running out of mana... so we&#39;re selling our
          leaderboard slots to recoup our losses. Buy one now to earn fleeting
          glory and keep Manafold afloat!
        </p>
      </div>

      <Col className="mt-6 gap-10">
        <Manaboard
          title=""
          users={topTraders}
          values={values}
          createdTimes={createdTimes}
        />
        {/* <Manaboard title="🏅 Top creators" users={topCreators} /> */}

        <div className="text-sm">
          <Title text={'Transaction history'} />
          {user && (
            <p>Your earnings: {formatMoney(userProfits(user.id, txns))}</p>
          )}
          <p>
            Manafold's earnings: {formatMoney(userProfits(MANIFOLD_ID, txns))}
          </p>
          <TransactionsTable txns={_.reverse(sortedTxns)} />
        </div>
      </Col>
    </Page>
  )
}

function userProfits(userId: string, txns: Transaction[]) {
  const losses = txns.filter((txn) => txn.fromId === userId)
  const loss = _.sumBy(losses, (txn) => txn.amount)
  const profits = txns.filter((txn) => txn.toId === userId)
  const profit = _.sumBy(profits, (txn) => txn.amount)
  return profit - loss
}

// Cache user's transaction profits to localStorage
const FAKE_BALANCE_KEY = 'fake-balance'
export function saveFakeBalance(profit: number) {
  localStorage.setItem(FAKE_BALANCE_KEY, JSON.stringify(profit))
}

export function loadFakeBalance() {
  if (typeof window !== 'undefined') {
    const profit = localStorage.getItem(FAKE_BALANCE_KEY)
    return profit ? JSON.parse(profit) : 0
  }
  return 0
}

function TransactionsTable(props: { txns: Transaction[] }) {
  const { txns } = props
  return (
    <Grid
      data={txns}
      search={true}
      // sort={true}
      pagination={{
        enabled: true,
        limit: 25,
      }}
      columns={[
        {
          id: 'data',
          name: 'Slot',
          formatter: (cell) => (cell as SlotData).slot,
        },
        {
          id: 'category',
          name: 'Type',
          formatter: (cell) =>
            cell === 'BUY_LEADERBOARD_SLOT' ? 'Buy' : 'Tax',
        },
        {
          id: 'amount',
          name: 'Amount',
          formatter: (cell) => formatMoney(cell as number),
        },
        {
          id: 'fromUsername',
          name: 'From',
        },
        { id: 'toUsername', name: 'To' },
        {
          id: 'createdTime',
          name: 'Time',
          formatter: (cell) =>
            html(
              `<span class="whitespace-nowrap">${dayjs(cell as number).format(
                'h:mma'
              )}</span>`
            ),
        },
      ]}
    />
  )
}
