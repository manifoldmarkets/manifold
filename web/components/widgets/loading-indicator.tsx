import clsx from 'clsx'
export type spinnerSizes = 'md' | 'lg'

export function LoadingIndicator(props: {
  className?: string
  spinnerClassName?: string
  size?: spinnerSizes
}) {
  const { className, spinnerClassName, size = 'lg' } = props

  return (
    <div className={clsx('flex items-center justify-center', className)}>
      <div
        className={clsx(
          'spinner-border inline-block animate-spin rounded-full border-4 border-solid border-indigo-500 border-r-transparent',
          size === 'lg' ? 'h-8 w-8' : 'h-6 w-6',
          spinnerClassName
        )}
        role="status"
      />
    </div>
  )
}
