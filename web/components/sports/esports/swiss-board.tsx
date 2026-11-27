import { CheckIcon, XIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { useContext } from 'react'

import { SwissView } from 'common/esports/types'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { PlateCodes, TeamPlate } from './esports-marks'
import { teamCode } from './team-codes'

const PAIRING =
  'border-ink-300 hover:border-ink-500 flex items-center gap-0.5 rounded-lg border border-dashed p-0.5'

/**
 * A Swiss stage: teams by their win–loss record, best first. Every team is
 * on its own record. Two teams in a series still to finish are drawn as a
 * pair where they share a record; on different records each stays on its
 * own, marked with who it plays. A record is marked through or out only
 * where every team on it has that status from the data.
 */
export function SwissBoard(props: { view: SwissView }) {
  const { view } = props
  const codes = useContext(PlateCodes)
  const pairingOf = new Map(
    view.pending.flatMap(({ series }) =>
      [series.team1, series.team2].flatMap((t) =>
        t ? [[t.id, series] as const] : []
      )
    )
  )
  const recordOf = new Map(
    view.buckets.flatMap((b) =>
      b.teams.map((t) => [t.team.id, `${b.wins}-${b.losses}`] as const)
    )
  )
  // A pair is drawn once, on the first of its two teams.
  const paired = new Set<number>()
  return (
    <Col className="divide-ink-100 divide-y">
      {view.buckets.map((bucket) => {
        const status = bucket.teams.every(
          (t) => t.status === bucket.teams[0]?.status
        )
          ? bucket.teams[0]?.status
          : null
        return (
          <Row
            key={`${bucket.wins}-${bucket.losses}`}
            className="items-center gap-3 py-1.5"
          >
            <span
              className={clsx(
                'w-9 shrink-0 text-sm font-black tabular-nums',
                status === 'through'
                  ? 'text-teal-600'
                  : status === 'out'
                  ? 'text-ink-400'
                  : 'text-ink-900'
              )}
            >
              {bucket.wins}–{bucket.losses}
            </span>
            <Row className="min-w-0 flex-1 flex-wrap items-center gap-1">
              {bucket.teams.map(({ team, status }) => {
                const series = pairingOf.get(team.id)
                const opponent =
                  series?.team1?.id === team.id ? series.team2 : series?.team1
                if (!series || !opponent)
                  return (
                    <TeamPlate
                      key={team.id}
                      team={team}
                      size="xs"
                      muted={status === 'out'}
                    />
                  )
                const title = `${series.team1?.name} vs ${series.team2?.name}`
                if (recordOf.get(opponent.id) !== recordOf.get(team.id))
                  return (
                    <a
                      key={team.id}
                      href={`#series-${series.id}`}
                      title={title}
                      className={clsx(PAIRING, 'pr-1.5')}
                    >
                      <TeamPlate team={team} size="xs" />
                      <span className="text-ink-500 whitespace-nowrap px-0.5 text-[9px] font-bold">
                        v{' '}
                        <span className="uppercase">
                          {codes[opponent.id] ?? teamCode(opponent)}
                        </span>
                      </span>
                    </a>
                  )
                if (paired.has(series.id)) return null
                paired.add(series.id)
                return (
                  <a
                    key={team.id}
                    href={`#series-${series.id}`}
                    title={title}
                    className={PAIRING}
                  >
                    <TeamPlate team={series.team1} size="xs" />
                    <span className="text-ink-400 px-0.5 text-[9px] font-bold">
                      v
                    </span>
                    <TeamPlate team={series.team2} size="xs" />
                  </a>
                )
              })}
            </Row>
            {status === 'through' && (
              <span className="flex shrink-0 items-center gap-0.5 text-[10px] font-black uppercase tracking-wide text-teal-600">
                <CheckIcon className="h-3.5 w-3.5" aria-hidden />
                Through
              </span>
            )}
            {status === 'out' && (
              <span className="text-ink-400 flex shrink-0 items-center gap-0.5 text-[10px] font-black uppercase tracking-wide">
                <XIcon className="h-3.5 w-3.5" aria-hidden />
                Out
              </span>
            )}
          </Row>
        )
      })}
    </Col>
  )
}
