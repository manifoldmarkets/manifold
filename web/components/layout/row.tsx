import clsx from 'clsx'

export function Row(props: { children?: any; className?: string }) {
  const { children, className } = props

  return <div className={clsx(className, 'flex flex-row')}>{children}</div>
}
