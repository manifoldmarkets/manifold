import clsx from 'clsx'
import { User } from '../../common/user'
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
      <Title text={title} />
      {users.length === 0 ? (
        <div className="text-gray-500 ml-2">None yet</div>
      ) : (
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
                <tr key={user.id}>
                  <td>{index + 1}</td>
                  <td>
                    <SiteLink className="relative" href={`/${user.username}`}>
                      <Row className="items-center gap-4">
                        <img
                          className="rounded-full bg-gray-400 flex-shrink-0 ring-8 ring-gray-50"
                          src={user.avatarUrl || ''}
                          alt=""
                          width={32}
                          height={32}
                        />
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
