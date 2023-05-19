import clsx from 'clsx'
export type SpinnerSize = 'sm' | 'mdsm' | 'md' | 'lg'

function getSizeClass(size: SpinnerSize) {
  switch (size) {
    case 'sm':
      return 'h-4 w-4'
    case 'mdsm':
      return 'h-5 w-5'
    case 'md':
      return 'h-6 w-6'
    case 'lg':
    default:
      return 'h-8 w-8'
  }
}

export function LoadingIndicator(props: {
  className?: string
  spinnerClassName?: string
  size?: SpinnerSize
}) {
  const { className, spinnerClassName, size = 'lg' } = props
  return (
    <div className={clsx('flex items-center justify-center', className)}>
      <div
        className={clsx(
          'spinner-border border-primary-500 inline-block animate-spin rounded-full border-4 border-solid border-r-transparent',
          getSizeClass(size),
          spinnerClassName
        )}
        role="status"
      />
    </div>
  )
}
