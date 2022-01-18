import _ from 'lodash'
import { Row } from '../components/layout/row'
import { Spacer } from '../components/layout/spacer'
import { Page } from '../components/page'
import { SiteLink } from '../components/site-link'
import { Title } from '../components/title'
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
      <Leaderboard
        title="Top traders"
        users={topTraders}
        columns={[
          {
            header: 'Total profit',
            renderCell: (user) => formatMoney(user.totalPnLCached),
          },
        ]}
      />
      <Spacer h={4} />
      <Leaderboard
        title="Top creators"
        users={topCreators}
        columns={[
          {
            header: 'Market volume',
            renderCell: (user) => formatMoney(user.creatorVolumeCached),
          },
        ]}
      />
    </Page>
  )
}

function Leaderboard(props: {
  title: string
  users: User[]
  columns: {
    header: string
    renderCell: (user: User) => any
  }[]
}) {
  const { title, users, columns } = props
  return (
    <div className="px-1">
      <Title text={title} />
      <div className="overflow-x-auto">
        <table className="table table-zebra table-compact text-gray-500 w-full">
          <thead>
            <tr className="p-2">
              <th>#</th>
              <th>Name</th>
              {columns.map((column) => (
                <th key={column.header}>{column.header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((user, index) => (
              <tr>
                <td>{index + 1}</td>
                <td>
                  <SiteLink className="relative" href={`/${user.username}`}>
                    <Row className="items-center gap-4">
                      <img
                        className="h-8 w-8 rounded-full bg-gray-400 flex items-center justify-center ring-8 ring-gray-50"
                        src={user.avatarUrl}
                        alt=""
                      />
                      <div>{user.name}</div>
                    </Row>
                  </SiteLink>
                </td>
                {columns.map((column) => (
                  <td key={column.header}>{column.renderCell(user)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
