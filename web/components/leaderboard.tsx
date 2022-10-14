import clsx from 'clsx'
import { Avatar } from './avatar'
import { Row } from './layout/row'
import { SiteLink } from './site-link'
import { Table } from './table'
import { Title } from './title'

interface LeaderboardEntry {
  username: string
  name: string
  avatarUrl?: string
}

export function Leaderboard<T extends LeaderboardEntry>(props: {
  title: string
  entries: T[]
  columns: {
    header: string
    renderCell: (entry: T) => any
  }[]
  className?: string
  maxToShow?: number
}) {
  // TODO: Ideally, highlight your own entry on the leaderboard
  const { title, columns, className } = props
  const maxToShow = props.maxToShow ?? props.entries.length
  const entries = props.entries.slice(0, maxToShow)
  return (
    <div className={clsx('w-full px-1', className)}>
      <Title text={title} className="!mt-0" />
      {entries.length === 0 ? (
        <div className="ml-2 text-gray-500">None yet</div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <thead>
              <tr>
                <th>#</th>
                <th>Name</th>
                {columns.map((column) => (
                  <th key={column.header}>{column.header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, index) => (
                <tr key={index}>
                  <td>{index + 1}</td>
                  <td className="max-w-[190px]">
                    <SiteLink className="relative" href={`/${entry.username}`}>
                      <Row className="items-center gap-4">
                        <Avatar avatarUrl={entry.avatarUrl} size={8} />
                        <div className="truncate">{entry.name}</div>
                      </Row>
                    </SiteLink>
                  </td>
                  {columns.map((column) => (
                    <td key={column.header}>{column.renderCell(entry)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}
    </div>
  )
}
