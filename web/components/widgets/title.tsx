import clsx from 'clsx'

export function Title(props: {
  text?: string
  className?: string
  children?: any
  textColor?: string
}) {
  const { text, children, className, textColor } = props
  return (
    <h1
      className={clsx(
        'my-4 inline-block text-2xl font-normal sm:my-6 sm:text-3xl',
        className,
        textColor || 'text-indigo-700'
      )}
    >
      {text}
      {children}
    </h1>
  )
}
