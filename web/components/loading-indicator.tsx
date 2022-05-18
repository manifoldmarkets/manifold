import clsx from 'clsx'

export function LoadingIndicator(props: {
  className?: string
  spinnerClassName?: string
}) {
  const { className, spinnerClassName } = props

  return (
    <div className={clsx('flex items-center justify-center', className)}>
      <div
        className={clsx(
          'spinner-border inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-indigo-500 border-r-transparent',
          spinnerClassName
        )}
        role="status"
      />
    </div>
  )
}
