import clsx from 'clsx'

export function TextButton(props: {
  onClick: () => void
  children: React.ReactNode
  className?: string
}) {
  const { onClick, children, className } = props

  return (
    <div
      className={clsx(
        className,
        'cursor-pointer gap-2 hover:underline hover:decoration-indigo-400 dark:hover:decoration-indigo-600 hover:decoration-2 focus:underline focus:decoration-indigo-400 dark:focus:decoration-indigo-600 dark:decoration-indigo-600 focus:decoration-2'
      )}
      tabIndex={0}
      onClick={onClick}
    >
      {children}
    </div>
  )
}
