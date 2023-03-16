import clsx from 'clsx'

export function GradientContainer(props: {
  children: React.ReactNode
  className?: string
}) {
  const { children, className } = props
  return (
    <div
      className={clsx(
        'to-primary-400 relative rounded-lg bg-gradient-to-r from-pink-300 via-purple-300 p-4 py-4',
        className
      )}
    >
      <div className="bg-canvas-0 w-full rounded px-4 py-4 md:px-6 md:py-8">
        {children}
      </div>
    </div>
  )
}
