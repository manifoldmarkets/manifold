import clsx from 'clsx'

export const Subtitle = (props: {
  children: React.ReactNode
  className?: string
}) => {
  const { children, className } = props

  return (
    <h2 className={clsx(className, 'text-ink-600 text-lg font-semibold')}>
      {children}
    </h2>
  )
}
