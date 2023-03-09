import clsx from 'clsx'

export function GradientContainer(props: {
  children: React.ReactNode
  className?: string
}) {
  const { children, className } = props
  return (
    <div
      className={clsx(
        'to-primary-400 relative rounded-lg bg-gradient-to-r from-pink-300 via-purple-300 p-4 py-6 sm:grid-cols-3',
        className
      )}
    >
      <div className="bg-canvas-0 w-full justify-between rounded pb-6 pt-4 pl-1 pr-2 sm:px-2 md:px-6 md:py-8">
        {children}
      </div>
    </div>
  )
}
