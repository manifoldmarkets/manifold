import { CheckIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import dayjs from 'dayjs'
import { useMemo, useState } from 'react'

import { EsportsStageResult, EsportsTournamentView } from 'common/esports/types'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { EsportsMarkets } from 'web/hooks/use-esports-tournaments'
import { esportsGameLabel } from './esports-games'
import { GameMark, PlateCodes, TeamPlate } from './esports-marks'
import {
  isEmptyStage,
  pendingRecords,
  stageHeadline,
  stageLabel,
  stageOnNow,
  stageSeries,
  stageStartMs,
  tournamentTeams,
} from './esports-stage'
import { EsportsStageBoard } from './esports-stage-board'
import { SeriesList } from './series-list'
import { plateCodes } from './team-codes'

/**
 * A tournament the way esports follows one: where it is in its stages, the
 * stage's board, and the series still to play with each side's price.
 * Everything shown comes from series the provider reported.
 */
export function EsportsEventHero(props: {
  view: EsportsTournamentView
  markets: EsportsMarkets
}) {
  const { view, markets } = props
  const { stages, champion } = view
  // The stage being played, unless the visitor picked another from the track.
  const [picked, setPicked] = useState<number>()
  const index = picked != null && stages[picked] ? picked : stageOnNow(stages)
  const stage: EsportsStageResult | undefined = stages[index]
  const series = stage ? stageSeries(stage.view) : []
  // A bracket or a GSL group shows its own results. A plain list is all there
  // is, and a group table has no room for them, so those list every series.
  const kind = stage?.view.kind
  const listsResults = kind === 'list' || kind === 'group-table'
  // One code per team across the whole tournament, so a team's plate reads
  // the same on every stage.
  const codes = useMemo(() => plateCodes(tournamentTeams(view)), [view])

  return (
    <section className="border-ink-200 bg-canvas-0 overflow-hidden rounded-2xl border">
      <div className="bg-primary-50 border-primary-200 border-b px-4 py-3 sm:px-5">
        <Row className="items-center gap-2">
          <GameMark game={view.game} />
          <span className="text-primary-700 min-w-0 flex-1 truncate text-[11px] font-bold uppercase tracking-[0.18em]">
            {esportsGameLabel(view.game)}
          </span>
          <StatusPill status={view.status} />
        </Row>
        <h2 className="text-ink-1000 mt-2 text-2xl font-black leading-tight tracking-tight [text-wrap:balance] sm:text-3xl">
          {view.tournament.name}
        </h2>
        {stages.length > 1 && (
          <StageTrack
            stages={stages}
            eventName={view.tournament.name}
            selected={index}
            onSelect={setPicked}
          />
        )}
      </div>
      <PlateCodes.Provider value={codes}>
        <Col className="gap-4 px-3 py-4 sm:px-4">
          {champion && (
            <Row className="border-ink-200 bg-canvas-50 items-center gap-3 rounded-xl border px-3 py-2.5">
              <span aria-hidden className="text-xl leading-none">
                🏆
              </span>
              <TeamPlate team={champion} />
              <Col className="min-w-0">
                <span className="text-ink-500 text-[10px] font-bold uppercase tracking-wider">
                  Champions
                </span>
                <span className="text-ink-1000 truncate text-sm font-bold">
                  {champion.name}
                </span>
              </Col>
            </Row>
          )}
          {!stage ? (
            <p className="text-ink-500 text-sm">No series reported yet.</p>
          ) : isEmptyStage(stage.view) ? (
            <p className="text-ink-500 text-sm">{emptyStageLine(stage)}</p>
          ) : (
            <>
              <p className="text-ink-700 text-sm font-semibold">
                {stageHeadline(stage)}
              </p>
              <EsportsStageBoard stage={stage} markets={markets} />
              <SeriesList
                series={
                  listsResults
                    ? series
                    : series.filter((s) => s.status !== 'final')
                }
                markets={markets}
                records={pendingRecords(stage.view)}
              />
            </>
          )}
        </Col>
      </PlateCodes.Provider>
    </section>
  )
}

/**
 * All there is to say of a stage with no teams in it yet: when its first
 * series starts, if any of its series has a start still to come.
 */
function emptyStageLine(stage: EsportsStageResult) {
  if (stage.state !== 'next') return 'No series reported yet.'
  const start = stageStartMs(stage.view)
  return start != null && start > Date.now()
    ? `Starts ${dayjs(start).format('MMM D')}`
    : 'Not started'
}

function StatusPill(props: { status: EsportsTournamentView['status'] }) {
  const { status } = props
  return (
    <span className="border-primary-200 bg-canvas-0 text-ink-700 flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
      {status === 'in-progress' && (
        <span className="bg-primary-500 h-1.5 w-1.5 animate-pulse rounded-full" />
      )}
      {status === 'in-progress'
        ? 'In progress'
        : status === 'upcoming'
        ? 'Upcoming'
        : 'Final'}
    </span>
  )
}

/**
 * The stages in order: played ones ticked, the one in play marked. Pick one to
 * see it. The track wraps where it doesn't fit, so every stage stays in view;
 * a name too long for a line of its own is cut short.
 */
function StageTrack(props: {
  stages: EsportsStageResult[]
  eventName: string
  selected: number
  onSelect: (index: number) => void
}) {
  const { stages, eventName, selected, onSelect } = props
  return (
    <ol
      aria-label="Stages"
      className="mt-3 flex flex-wrap items-center gap-1.5"
    >
      {stages.map((stage, i) => (
        <li key={i} className="flex min-w-0 max-w-full items-center gap-1.5">
          {i > 0 && (
            <span aria-hidden className="bg-primary-200 h-px w-3 shrink-0" />
          )}
          <button
            type="button"
            onClick={() => onSelect(i)}
            aria-pressed={i === selected}
            aria-current={stage.state === 'current' ? 'step' : undefined}
            className={clsx(
              'focus-visible:ring-primary-500 flex min-w-0 items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors focus-visible:ring-2',
              i === selected
                ? 'border-ink-900 bg-ink-900 text-ink-0'
                : 'border-ink-200 bg-canvas-0 hover:border-ink-400',
              i !== selected &&
                (stage.state === 'next' ? 'text-ink-500' : 'text-ink-800')
            )}
          >
            {stage.state === 'done' && (
              <CheckIcon className="h-3 w-3 shrink-0" aria-label="played" />
            )}
            {stage.state === 'current' && (
              <span
                className="bg-primary-500 h-1.5 w-1.5 shrink-0 rounded-full"
                aria-label="in play"
              />
            )}
            <span className="truncate">{stageLabel(stage, eventName)}</span>
          </button>
        </li>
      ))}
    </ol>
  )
}
