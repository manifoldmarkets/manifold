import clsx from 'clsx'
import Link from 'next/link'

import { formatOdds } from 'web/components/usa-map/election-display'
import { DEM_COLOR, REP_COLOR } from 'web/components/usa-map/state-election-map'
import { placeName } from 'web/lib/politics/official-markets'
import {
  EARLY_STATES,
  PrimaryCell,
  PrimaryRow,
} from 'web/lib/politics/primaries'

// State by state, who leads (or won) each party's primary, early states
// first. Presidential primaries in one table, Senate and governor primaries
// in another once their markets exist. Every cell links to its market.

const cellUrl = (cell: PrimaryCell) =>
  `/${cell.u ?? 'ManifoldPolitics'}/${cell.s}`

export function PrimariesBoard(props: { rows: PrimaryRow[] }) {
  const presidential = props.rows.filter((r) => r.o === 'P')
  const downBallot = props.rows.filter((r) => r.o !== 'P')
  return (
    <div className="flex flex-col gap-4">
      {presidential.length > 0 && (
        <PrimaryTable
          caption="Presidential primaries and caucuses"
          rows={presidential}
          showOffice={false}
        />
      )}
      {downBallot.length > 0 && (
        <PrimaryTable
          caption="Senate and governor primaries"
          rows={downBallot}
          showOffice
        />
      )}
    </div>
  )
}

function PrimaryTable(props: {
  caption: string
  rows: PrimaryRow[]
  showOffice: boolean
}) {
  const { caption, rows, showOffice } = props
  return (
    <div className="bg-canvas-0 border-ink-200 overflow-hidden rounded-xl border">
      <table className="w-full table-fixed border-collapse text-sm">
        <caption className="text-ink-900 px-3 pb-1 pt-3 text-left text-base font-semibold sm:px-4">
          {caption}
        </caption>
        <thead>
          <tr className="text-ink-600 border-ink-200 border-b text-left text-xs">
            <th scope="col" className="w-[30%] px-3 py-2 font-medium sm:px-4">
              {showOffice ? 'Race' : 'State'}
            </th>
            <th scope="col" className="px-2 py-2 font-medium">
              <PartyHead party="D" />
            </th>
            <th scope="col" className="px-2 py-2 font-medium">
              <PartyHead party="R" />
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const early = row.o === 'P' && EARLY_STATES.includes(row.st)
            const lastEarly =
              early && !EARLY_STATES.includes(rows[i + 1]?.st ?? '')
            return (
              <tr
                key={row.k}
                className={clsx(
                  'border-ink-100 border-b last:border-0',
                  lastEarly && 'border-ink-300 border-b-2'
                )}
              >
                <th
                  scope="row"
                  className="text-ink-1000 px-3 py-1.5 text-left font-medium sm:px-4"
                >
                  <span className="block truncate">
                    {placeName(row.st)}
                    {showOffice && (
                      <span className="text-ink-600 font-normal">
                        {' '}
                        · {row.o === 'S' ? 'Senate' : 'Governor'}
                        {row.sp ? ' (special)' : ''}
                      </span>
                    )}
                  </span>
                  {early && (
                    <span className="text-ink-500 block text-xs font-normal">
                      Early state
                    </span>
                  )}
                </th>
                {row.A ? (
                  <td colSpan={2} className="px-2 py-1.5">
                    <Cell cell={row.A} note="All parties, one primary" />
                  </td>
                ) : (
                  <>
                    <td className="px-2 py-1.5">
                      {row.D ? <Cell cell={row.D} /> : <Empty />}
                    </td>
                    <td className="px-2 py-1.5">
                      {row.R ? <Cell cell={row.R} /> : <Empty />}
                    </td>
                  </>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function PartyHead(props: { party: 'D' | 'R' }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden
        className="inline-block h-2.5 w-2.5 rounded-full"
        style={{ backgroundColor: props.party === 'D' ? DEM_COLOR : REP_COLOR }}
      />
      {props.party === 'D' ? 'Democrats' : 'Republicans'}
    </span>
  )
}

function Cell(props: { cell: PrimaryCell; note?: string }) {
  const { cell, note } = props
  return (
    <Link
      href={cellUrl(cell)}
      className="hover:bg-canvas-50 -mx-1 flex min-h-[1.75rem] items-center gap-1.5 rounded px-1"
    >
      {cell.l ? (
        <>
          <span
            className={clsx(
              'text-ink-1000 min-w-0 truncate',
              cell.won && 'font-semibold'
            )}
          >
            {cell.won ? '✓ ' : ''}
            {cell.l}
          </span>
          {!cell.won && cell.p !== undefined && (
            <span className="text-ink-600 shrink-0 tabular-nums">
              {formatOdds(cell.p)}
            </span>
          )}
        </>
      ) : (
        <span className="text-ink-600">Open field</span>
      )}
      {note && (
        <span className="text-ink-500 hidden text-xs sm:inline">· {note}</span>
      )}
    </Link>
  )
}

const Empty = () => <span className="text-ink-400">—</span>
