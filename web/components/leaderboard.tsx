import clsx from 'clsx'
import { range } from 'lodash'
import { ReactNode } from 'react'

import { Table } from './widgets/table'
import { Title } from './widgets/title'
import { UserAvatarAndBadge } from './widgets/user-link'
import { EmptyAvatar } from './widgets/avatar'

export interface LeaderboardEntry {
  userId: string
  score: number
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
    <div className={clsx('w-full', className)}>
      {title != undefined && <Title>{title}</Title>}
      {entries.length === 0 ? (
        <div className="text-ink-500 py-8 text-center text-sm">
          No entries yet
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table className="[&>tbody_tr:nth-child(odd)]:bg-canvas-50 [&>tbody_tr:hover]:bg-canvas-100 [&>tbody_tr]:transition-colors">
            <thead>
              <tr className="border-ink-200 border-b">
                <th className="text-ink-500 w-12 py-3 text-left text-xs font-medium uppercase tracking-wide">
                  #
                </th>
                <th className="text-ink-500 py-3 text-left text-xs font-medium uppercase tracking-wide">
                  Trader
                </th>
                {columns.map((column, index) => (
                  <th
                    key={index}
                    className="text-ink-500 py-3 text-right text-xs font-medium uppercase tracking-wide"
                  >
                    {column.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-ink-100 divide-y">
              {entries.map((entry, index) => (
                <tr
                  key={index}
                  className={clsx(
                    entry.userId === highlightUserId && 'bg-primary-50'
                  )}
                >
                  <td className="text-ink-600 py-3 text-sm font-medium tabular-nums">
                    {entry.rank ? entry.rank : index + 1}
                  </td>
                  <td className="py-3">
                    <UserAvatarAndBadge
                      className="max-[400px]:max-w-[160px] sm:max-w-[200px] xl:max-w-none"
                      user={{ id: entry.userId, ...entry }}
                      short
                      displayContext="leaderboard"
                    />
                  </td>
                  {columns.map((column, colIndex) => (
                    <td
                      key={colIndex}
                      className="text-ink-700 py-3 text-right text-sm font-medium tabular-nums"
                    >
                      {column.renderCell(entry)}
                    </td>
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
    <div className={clsx('w-full', className)}>
      <div className="overflow-x-auto">
        <Table className="[&>tbody_tr:nth-child(odd)]:bg-canvas-50">
          <thead>
            <tr className="border-ink-200 border-b">
              <th className="text-ink-500 w-12 py-3 text-left text-xs font-medium uppercase tracking-wide">
                #
              </th>
              <th className="text-ink-500 py-3 text-left text-xs font-medium uppercase tracking-wide">
                Trader
              </th>
              {columns.map((column, index) => (
                <th
                  key={index}
                  className="text-ink-500 py-3 text-right text-xs font-medium uppercase tracking-wide"
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-ink-100 divide-y">
            {range(maxToShow).map((i) => (
              <tr key={i}>
                <td className="text-ink-400 py-3 text-sm tabular-nums">
                  {i + 1}
                </td>
                <td className="py-3">
                  <div className="flex items-center gap-2">
                    <EmptyAvatar />
                    <div className="bg-ink-200 h-4 w-24 animate-pulse rounded" />
                  </div>
                </td>
                {columns.map((_, index) => (
                  <td key={index} className="py-3">
                    <div className="bg-ink-200 ml-auto h-4 w-16 animate-pulse rounded" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    </div>
  )
}
