import clsx from 'clsx'
import { createContext, useContext } from 'react'

import { EsportsGame, EsportsTeamRef } from 'common/esports/types'
import { esportsGameInfo, esportsGameLabel } from './esports-games'
import { teamCode } from './team-codes'

/**
 * The plate codes of the tournament on screen, by team id (`plateCodes`), so
 * two of its teams never share one. A team not in it gets its own code.
 */
export const PlateCodes = createContext<Record<number, string>>({})

/** A team's code on a plate. No logos: codes are how esports names a team on screen. */
export function TeamPlate(props: {
  /** Null for a slot nobody has reached yet. */
  team: EsportsTeamRef | null
  size?: 'xs' | 'md' | 'lg'
  muted?: boolean
  className?: string
}) {
  const { team, size = 'md', muted, className } = props
  const codes = useContext(PlateCodes)
  return (
    <span
      title={team?.name ?? 'To be decided'}
      className={clsx(
        'inline-flex shrink-0 items-center justify-center rounded-md font-black uppercase tabular-nums leading-none tracking-tight',
        !team
          ? 'border-ink-300 text-ink-400 border border-dashed'
          : muted
          ? 'bg-ink-200 text-ink-500'
          : 'bg-ink-900 text-ink-0',
        size === 'xs' && 'h-5 min-w-[2.25rem] px-1 text-[9px]',
        size === 'md' && 'h-8 min-w-[3rem] px-1.5 text-xs',
        size === 'lg' && 'h-11 min-w-[4rem] px-2 text-base',
        className
      )}
    >
      {team ? codes[team.id] ?? teamCode(team) : 'TBD'}
    </span>
  )
}

/** A game's mark: its letters on the theme colour, where a sport has an emoji. */
export function GameMark(props: { game: EsportsGame; className?: string }) {
  const { game, className } = props
  return (
    <span
      aria-hidden
      title={esportsGameLabel(game)}
      className={clsx(
        'bg-primary-600 text-ink-0 inline-flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-[5px] px-1 text-[9px] font-black leading-none tracking-tighter',
        className
      )}
    >
      {esportsGameInfo(game).mark}
    </span>
  )
}
