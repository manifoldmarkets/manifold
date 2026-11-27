import clsx from 'clsx'
import Link from 'next/link'

import { track } from 'web/lib/service/analytics'
import {
  ESPORTS_GAMES,
  EsportsGameKey,
  esportsGameLabel,
  esportsPath,
} from './esports-games'
import { GameMark } from './esports-marks'

/**
 * The games with tournaments, as chips like the sport rail's. They wrap
 * rather than scroll: four chips are few enough to keep all in view.
 */
export function EsportsGameChips(props: { selected?: EsportsGameKey }) {
  return (
    <nav aria-label="Esports games" className="flex flex-wrap gap-1.5">
      {ESPORTS_GAMES.map(({ key, game }) => (
        <Link
          key={key}
          href={esportsPath(key)}
          aria-current={key === props.selected ? 'page' : undefined}
          onClick={() => track('esports game select', { game: key })}
          className={clsx(
            'flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
            key === props.selected
              ? 'border-ink-900 bg-ink-900 text-ink-0'
              : 'border-ink-200 bg-canvas-0 text-ink-700 hover:border-ink-400 hover:bg-canvas-50'
          )}
        >
          <GameMark game={game} />
          <span className="sm:hidden">{esportsGameLabel(game, true)}</span>
          <span className="hidden sm:inline">{esportsGameLabel(game)}</span>
        </Link>
      ))}
    </nav>
  )
}
