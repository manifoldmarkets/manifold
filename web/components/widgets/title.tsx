import clsx from 'clsx'

export function Title(props: {
  text?: string
  className?: string
  children?: any
}) {
  const { text, children, className } = props
  return (
    <h1
      className={clsx(
        'my-4 inline-block text-2xl font-normal text-indigo-700 sm:my-6 sm:text-3xl',
        className
      )}
    >
      {text}
      {children}
    </h1>
  )
}
