import clsx from 'clsx'
import { User } from '../../common/user'
import { Avatar } from './avatar'
import { Row } from './layout/row'
import { SiteLink } from './site-link'
import { Title } from './title'

export function Leaderboard(props: {
  title: string
  users: User[]
  columns: {
    header: string
    renderCell: (user: User) => any
  }[]
  className?: string
}) {
  const { title, users, columns, className } = props
  return (
    <div className={clsx('w-full px-1', className)}>
      <Title text={title} className="!mt-0" />
      {users.length === 0 ? (
        <div className="ml-2 text-gray-500">None yet</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="table-zebra table-compact table w-full text-gray-500">
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
                <tr key={user.id}>
                  <td>{index + 1}</td>
                  <td style={{ maxWidth: 190 }}>
                    <SiteLink className="relative" href={`/${user.username}`}>
                      <Row className="items-center gap-4">
                        <Avatar avatarUrl={user.avatarUrl} size={8} />
                        <div className="truncate">{user.name}</div>
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
      )}
    </div>
  )
}
