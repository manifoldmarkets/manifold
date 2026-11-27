import dayjs from 'dayjs'
import { min } from 'lodash'
import Link from 'next/link'
import { useId } from 'react'

import { usePersistentInMemoryState } from 'client-common/hooks/use-persistent-in-memory-state'
import { EsportsTournamentView } from 'common/esports/types'
import { Col } from 'web/components/layout/col'
import { EsportsGameKey, esportsPath } from './esports-games'
import { allStageSeries, stageLabel } from './esports-stage'

/** How many cards show before "Show all": two rows of three, three of two. */
const PREVIEW_CARDS = 6

/**
 * The game's other tournaments, a card each: where it stands, or who won it.
 * The first few show, in the order the page leads with them; the rest wait
 * behind "Show all".
 */
export function EsportsSeasonStrip(props: {
  views: EsportsTournamentView[]
  gameKey: EsportsGameKey
}) {
  const { views, gameKey } = props
  // Kept while the visitor is away at a market, so Back finds the same cards.
  const [showAll, setShowAll] = usePersistentInMemoryState(
    false,
    `esports-season-all-${gameKey}`
  )
  const listId = useId()
  if (views.length === 0) return null
  const now = Date.now()
  return (
    <Col className="gap-2">
      <h3 className="text-ink-900 px-1 text-xs font-black uppercase tracking-wider">
        This season
      </h3>
      <div id={listId} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {(showAll ? views : views.slice(0, PREVIEW_CARDS)).map((v) => (
          <Link
            key={v.tournament.id}
            href={`${esportsPath(gameKey)}?event=${v.tournament.id}`}
            className="bg-canvas-0 border-ink-200 hover:border-ink-400 flex min-w-0 flex-col gap-1 rounded-xl border p-3 transition-colors"
          >
            <span className="text-ink-500 truncate text-[10px] font-bold uppercase tracking-wider">
              {STATUS_LABEL[v.status]}
            </span>
            {/* Two lines before it is cut: on a phone one line ends before
                "Series 15" and "Series 16" do, and the cards read the same. */}
            <span
              title={v.tournament.name}
              className="text-ink-1000 line-clamp-2 break-words text-sm font-bold leading-snug"
            >
              {v.tournament.name}
            </span>
            <span className="text-ink-600 mt-auto truncate text-xs">
              {tournamentSummary(v, now)}
            </span>
          </Link>
        ))}
      </div>
      {views.length > PREVIEW_CARDS && (
        <button
          type="button"
          aria-controls={listId}
          aria-expanded={showAll}
          onClick={() => setShowAll((all) => !all)}
          className="border-ink-200 text-primary-700 hover:bg-canvas-50 min-h-[44px] rounded-lg border px-3 py-2 text-sm font-medium"
        >
          {showAll ? 'Show fewer' : `Show all ${views.length}`}
        </button>
      )}
    </Col>
  )
}

const STATUS_LABEL = {
  'in-progress': 'In progress',
  upcoming: 'Next up',
  finished: 'Final',
} as const

/**
 * One line on where a tournament stands: its champion, the stage in play, or
 * its start. "Starts" is only for a day still to come: one in progress
 * between stages reads "Started Nov 19".
 */
function tournamentSummary(view: EsportsTournamentView, now: number) {
  if (view.champion) return `🏆 ${view.champion.name}`
  if (view.status === 'finished') return 'Finished'
  const current = view.stages.find((s) => s.state === 'current')
  if (current) return stageLabel(current, view.tournament.name)
  const start = min(
    view.stages
      .flatMap((s) => allStageSeries(s.view))
      .flatMap((s) => s.startTimeMs ?? [])
  )
  if (view.status === 'in-progress')
    return start != null && start <= now
      ? `Started ${dayjs(start).format('MMM D')}`
      : 'Between stages'
  return start != null && !dayjs(start).isBefore(now, 'day')
    ? `Starts ${dayjs(start).format('MMM D')}`
    : 'Not started'
}
