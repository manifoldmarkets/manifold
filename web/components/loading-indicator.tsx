import clsx from 'clsx'

export function LoadingIndicator(props: { className?: string }) {
  const { className } = props

  return (
    <div className={clsx('flex justify-center items-center', className)}>
      <div
        className="spinner-border animate-spin inline-block w-8 h-8 border-4 border-solid border-r-transparent rounded-full border-indigo-500"
        role="status"
      />
    </div>
  )
}
