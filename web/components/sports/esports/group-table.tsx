import { GroupTableView } from 'common/esports/types'
import { TeamPlate } from './esports-marks'

/**
 * A round-robin group's standings, in the order the view ranked them: series
 * played, won and lost, and the map or game difference from reported scores.
 */
export function GroupTable(props: { view: GroupTableView }) {
  const { rows } = props.view
  const number = 'w-9 px-1 py-1.5 text-right tabular-nums'
  return (
    <table className="w-full table-fixed text-sm">
      <thead>
        <tr className="text-ink-500 text-[10px] font-bold uppercase tracking-wider">
          <th className="w-6 py-1 text-left font-bold">#</th>
          <th className="py-1 text-left font-bold">Team</th>
          <th className={number} title="Series played">
            P
          </th>
          <th className={number} title="Series won">
            W
          </th>
          <th className={number} title="Series lost">
            L
          </th>
          <th className={number} title="Map or game difference">
            +/−
          </th>
        </tr>
      </thead>
      <tbody className="divide-ink-100 divide-y">
        {rows.map((row, i) => (
          <tr key={row.team.id}>
            <td className="text-ink-500 py-1.5 tabular-nums">{i + 1}</td>
            <td className="py-1.5">
              <span className="flex min-w-0 items-center gap-2">
                <TeamPlate team={row.team} size="xs" />
                <span className="text-ink-900 truncate font-semibold">
                  {row.team.name}
                </span>
              </span>
            </td>
            <td className={number}>{row.played}</td>
            <td className={number}>{row.wins}</td>
            <td className={number}>{row.losses}</td>
            <td className={number}>
              {row.diff > 0 ? `+${row.diff}` : row.diff}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
