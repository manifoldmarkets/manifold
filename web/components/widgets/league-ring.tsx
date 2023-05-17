import clsx from 'clsx'

export function LeagueRing(props: {
  children: React.ReactNode
  size: number
  league: string
  className?: string
}) {
  const { children, size, league, className } = props

  return (
    <div
      style={{ height: `${size}px`, width: `${size}px` }}
      className={clsx(
        league == 'Platinum'
          ? 'bg-gradient-to-br from-blue-900 via-blue-100 to-blue-900'
          : league == 'Gold'
          ? 'bg-gradient-to-br from-yellow-500 via-yellow-100 to-yellow-500'
          : league == 'Silver'
          ? 'bg-gradient-to-br from-stone-500 via-stone-400 to-stone-500'
          : league == 'Bronze'
          ? 'bg-gradient-to-br from-amber-800 via-amber-700 to-amber-800'
          : 'bg-ink-200',
        `relative flex flex-shrink-0 self-start rounded-full`,
        className
      )}
    >
      <div className={clsx(`my-auto mx-auto`)}>{children}</div>
    </div>
  )
}
