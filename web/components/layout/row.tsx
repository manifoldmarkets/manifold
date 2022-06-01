import clsx from 'clsx'

export function Row(props: JSX.IntrinsicElements['div']) {
  const { children, className, ...rest } = props

  return (
    <div className={clsx(className, 'flex flex-row')} {...rest}>
      {children}
    </div>
  )
}
