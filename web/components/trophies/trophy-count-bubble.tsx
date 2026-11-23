import clsx from 'clsx'

export function TrophyCountBubble(props: {
  count: number
  onAvatar?: boolean
}) {
  const { count, onAvatar } = props
  if (!count) return null
  return (
    <span
      className={clsx(
        'bg-primary-500 text-ink-0 min-w-[15px] rounded-full px-1 py-0.5 text-center text-[10px] leading-3',
        onAvatar && 'absolute -right-1 -top-1 z-10'
      )}
    >
      <span aria-hidden>{count}</span>
      <span className="sr-only">{trophyCountLabel(count)}</span>
    </span>
  )
}

export const trophyCountLabel = (count: number) =>
  `${count} ${count === 1 ? 'trophy' : 'trophies'} ready to claim`
