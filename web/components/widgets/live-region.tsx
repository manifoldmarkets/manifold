import clsx from 'clsx'

export function LiveRegion(props: {
  message?: string | null
  politeness?: 'polite' | 'assertive'
  className?: string
}) {
  const { message, politeness = 'polite', className } = props

  return (
    <div
      aria-atomic="true"
      aria-live={politeness}
      role={politeness === 'assertive' ? 'alert' : 'status'}
      className={clsx('sr-only', className)}
    >
      {message ?? ''}
    </div>
  )
}
