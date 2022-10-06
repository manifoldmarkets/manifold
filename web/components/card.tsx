import clsx from 'clsx'

export function Card(props: JSX.IntrinsicElements['div']) {
  const { children, className, ...rest } = props
  return (
    <div
      className={clsx(
        'cursor-pointer rounded-lg border-2 bg-white transition-shadow hover:shadow-md focus:shadow-md',
        className
      )}
      {...rest}
    >
      {children}
    </div>
  )
}
