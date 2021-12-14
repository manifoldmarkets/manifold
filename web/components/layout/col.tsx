import clsx from 'clsx'

export function Col(props: { children?: any; className?: string }) {
  const { children, className } = props

  return <div className={clsx(className, 'flex flex-col')}>{children}</div>
}
