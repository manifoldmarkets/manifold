import clsx from 'clsx'
import { Avatar } from './widgets/avatar'
import { Row } from './layout/row'
import { SiteLink } from './widgets/site-link'
import { Table } from './widgets/table'
import { Title } from './widgets/title'
import { sortBy } from 'lodash'
import { BotBadge } from './widgets/user-link'
import { BOT_USERNAMES } from 'common/envs/constants'

interface LeaderboardEntry {
  username: string
  name: string
  avatarUrl?: string
  rank?: number
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
  highlightUsername?: string
}) {
  // TODO: Ideally, highlight your own entry on the leaderboard
  const { title, columns, className, highlightUsername } = props
  const maxToShow = props.maxToShow ?? props.entries.length
  const entries = sortBy(
    props.entries.slice(0, maxToShow),
    (entry) => entry.rank
  )
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
                <tr
                  key={index}
                  className={
                    entry.username === highlightUsername ? '!bg-amber-100' : ''
                  }
                >
                  <td>{entry.rank ? entry.rank : index + 1}</td>
                  <td className="max-w-[190px]">
                    <SiteLink className="relative" href={`/${entry.username}`}>
                      <Row className="items-center gap-4">
                        <Avatar avatarUrl={entry.avatarUrl} size={8} />
                        <div className="truncate">
                          {entry.name}{' '}
                          {BOT_USERNAMES.includes(entry.username) && (
                            <BotBadge />
                          )}
                        </div>
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
