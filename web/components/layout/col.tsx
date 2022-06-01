import clsx from 'clsx'

export function Col(props: JSX.IntrinsicElements['div']) {
  const { children, className, ...rest } = props

  return (
    <div className={clsx(className, 'flex flex-col')} {...rest}>
      {children}
    </div>
  )
}
