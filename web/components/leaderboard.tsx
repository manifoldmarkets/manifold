import clsx from 'clsx'
import { Table } from './widgets/table'
import { Title } from './widgets/title'
import { range, sortBy } from 'lodash'
import { UserAvatarAndBadge } from './widgets/user-link'
import { ReactNode } from 'react'
import { EmptyAvatar } from './widgets/avatar'

export interface LeaderboardEntry {
  userId: string
  score?: number
  rank?: number | null
}

export interface LeaderboardColumn<
  T extends LeaderboardEntry = LeaderboardEntry
> {
  header: string | ReactNode
  renderCell: (entry: T) => any
}

export function Leaderboard<T extends LeaderboardEntry>(props: {
  title?: string
  entries: T[]
  columns: LeaderboardColumn<T>[]
  className?: string
  highlightUserId?: string
}) {
  const { title, entries, columns, className, highlightUserId } = props

  return (
    <div className={clsx('w-full px-1', className)}>
      {title != undefined && <Title>{title}</Title>}
      {entries.length === 0 ? (
        <div className="text-ink-500 ml-2">None yet</div>
      ) : (
        <div className="overflow-x-auto">
          {/* zebra stripes */}
          <Table className="[&>tbody_tr:nth-child(odd)]:bg-canvas-0">
            <thead>
              <tr>
                <th>#</th>
                <th>Name</th>
                {columns.map((column, index) => (
                  <th key={index}>{column.header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, index) => (
                <tr
                  key={index}
                  className={
                    entry.userId === highlightUserId ? '!bg-indigo-400/20' : ''
                  }
                >
                  <td className={'min-w-4 w-16'}>
                    {entry.rank ? entry.rank : index + 1}
                  </td>
                  <td>
                    <UserAvatarAndBadge
                      className="overflow-hidden max-[400px]:max-w-[160px] sm:max-w-[200px] xl:max-w-none"
                      user={{ id: entry.userId, ...entry }}
                    />
                  </td>
                  {columns.map((column, index) => (
                    <td key={index}>{column.renderCell(entry)}</td>
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

export function LoadingLeaderboard(props: {
  columns: LeaderboardColumn[]
  className?: string
  maxToShow?: number
}) {
  const { columns, className, maxToShow = 50 } = props

  return (
    <div className={clsx('w-full px-1', className)}>
      <div className="overflow-x-auto">
        <Table className="[&>tbody_tr:nth-child(odd)]:bg-canvas-0">
          <thead>
            <tr>
              <th>#</th>
              <th>Name</th>
              {columns.map((column, index) => (
                <th key={index}>{column.header}</th>
              ))}
            </tr>
          </thead>
          {range(maxToShow).map((i) => (
            <tr key={i}>
              <td className={'w-[4.5rem] min-w-[4.5rem] '}>{i + 1}</td>
              <td className="animate-pulse">
                <EmptyAvatar />
              </td>
              {columns.map((column, index) => (
                <td key={index}>
                  <div className="bg-ink-300 h-4 w-full animate-pulse rounded-full" />
                </td>
              ))}
            </tr>
          ))}
        </Table>
      </div>
    </div>
  )
}
