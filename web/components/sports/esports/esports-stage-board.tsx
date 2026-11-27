import { EsportsStageResult, StageView } from 'common/esports/types'
import { Col } from 'web/components/layout/col'
import { EsportsMarkets } from 'web/hooks/use-esports-tournaments'
import { BracketBoard } from './bracket-board'
import { hasBoard } from './esports-stage'
import { GroupTable } from './group-table'
import { GslGroup } from './gsl-group'
import { SwissBoard } from './swiss-board'

const TITLE: Record<Exclude<StageView['kind'], 'list'>, string> = {
  swiss: 'Swiss board',
  'group-table': 'Standings',
  'group-gsl': 'Group',
  'single-elim': 'Bracket',
  'double-elim': 'Bracket',
}

/**
 * The board for a stage's layout: Swiss records, a group table, a GSL group
 * or a bracket. A stage laid out as a plain list has none, and neither has
 * one with nothing to put on it yet.
 */
export function EsportsStageBoard(props: {
  stage: EsportsStageResult
  markets: EsportsMarkets
}) {
  const { markets } = props
  const { view } = props.stage
  if (view.kind === 'list' || !hasBoard(view)) return null
  const unplaced = 'unplaced' in view ? view.unplaced?.length ?? 0 : 0
  return (
    <Col className="border-ink-200 min-w-0 gap-2 rounded-xl border p-3">
      <h3 className="text-ink-900 text-xs font-black uppercase tracking-wider">
        {TITLE[view.kind]}
      </h3>
      {view.kind === 'swiss' ? (
        <SwissBoard view={view} />
      ) : view.kind === 'group-table' ? (
        <GroupTable view={view} />
      ) : view.kind === 'group-gsl' ? (
        <GslGroup view={view} markets={markets} />
      ) : (
        <BracketBoard view={view} markets={markets} />
      )}
      {unplaced > 0 && (
        <p className="text-ink-500 text-[11px]">
          {unplaced} series {unplaced === 1 ? "isn't" : "aren't"} on the board
          yet: the data feed names a series' round once it starts. Every series
          still to finish is listed below.
        </p>
      )}
      {view.problems.length > 0 && (
        <p className="text-ink-500 text-[11px]">
          Some series couldn't be placed, so this board may be missing a result.
        </p>
      )}
    </Col>
  )
}
