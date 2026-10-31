import clsx from 'clsx'
import { EsportsTitle, TeamRef } from 'common/esports'

/** A game's mark: its letters on its brand colour, like a sport's emoji. */
export function TitleMark(props: {
  title: Pick<EsportsTitle, 'mark' | 'color' | 'name'>
  size?: 'sm' | 'md'
  className?: string
}) {
  const { title, size = 'sm', className } = props
  return (
    <span
      aria-hidden
      title={title.name}
      className={clsx(
        'inline-flex shrink-0 items-center justify-center rounded-[5px] font-black leading-none tracking-tighter text-white shadow-[inset_0_-1px_0_rgba(0,0,0,0.25)]',
        size === 'sm'
          ? 'h-[18px] min-w-[18px] px-0.5 text-[8px]'
          : 'h-6 min-w-[24px] px-1 text-[10px]',
        className
      )}
      style={{ backgroundColor: title.color }}
    >
      {title.mark}
    </span>
  )
}

/**
 * A team's broadcast code on a plate. No logos: tricodes are how esports
 * shows a team on screen, and every team has one.
 */
export function TeamPlate(props: {
  team: Pick<TeamRef, 'code' | 'name'>
  size?: 'xs' | 'sm' | 'md' | 'lg'
  muted?: boolean
  className?: string
}) {
  const { team, size = 'md', muted, className } = props
  return (
    <span
      title={team.name}
      className={clsx(
        'inline-flex shrink-0 items-center justify-center rounded-md font-black uppercase tabular-nums leading-none tracking-tight',
        muted ? 'bg-ink-200 text-ink-500' : 'bg-ink-900 text-ink-0',
        size === 'xs' && 'h-5 min-w-[2rem] px-1 text-[9px]',
        size === 'sm' && 'h-6 min-w-[2.5rem] px-1.5 text-[10px]',
        size === 'md' && 'h-8 min-w-[3rem] px-1.5 text-xs',
        size === 'lg' && 'h-11 min-w-[4rem] px-2 text-base',
        className
      )}
    >
      {team.code}
    </span>
  )
}
