import clsx from 'clsx'

export function LoadingIndicator(props: { className?: string }) {
  const { className } = props

  return (
    <div className={clsx('flex justify-center items-center', className)}>
      <div
        className="spinner-border animate-spin inline-block w-8 h-8 border-4 rounded-full text-indigo-500"
        role="status"
      >
        <span className="visually-hidden">Loading...</span>
      </div>
    </div>
  )
}
