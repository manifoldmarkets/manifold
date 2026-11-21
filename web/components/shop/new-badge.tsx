import clsx from 'clsx'

type NewBadgeProps = {
  /** 'sticker' overlaps its parent card (absolute, center-top, -50% translate).
   *  'inline' flows inline next to a heading. Both share the even-pixel box
   *  and composite-transform trick that keeps the rotated text crisp on
   *  Windows Chrome, where ClearType falls back to grayscale AA at
   *  fractional-pixel compositor layers. */
  variant: 'sticker' | 'inline'
  className?: string
}

export function NewBadge({ variant, className }: NewBadgeProps) {
  const isSticker = variant === 'sticker'
  return (
    <span
      className={clsx(
        'flex h-5 w-14 items-center justify-center rounded-full bg-amber-400 text-xs font-extrabold uppercase tracking-wider text-amber-900 antialiased',
        'ring-2 ring-amber-300/70 dark:ring-amber-500/40',
        isSticker
          ? 'pointer-events-none absolute left-1/2 top-0 z-20 shadow-md'
          : 'shadow-sm',
        className
      )}
      style={{
        transform: isSticker
          ? 'translate(-50%, -50%) rotate(-8deg)'
          : 'rotate(-8deg)',
        backfaceVisibility: 'hidden',
        willChange: 'transform',
      }}
    >
      NEW
    </span>
  )
}
