import clsx from 'clsx'

export function Row(props: {
  children?: any
  className?: string
  id?: string
}) {
  const { children, className, id } = props

  return (
    <div className={clsx(className, 'flex flex-row')} id={id}>
      {children}
    </div>
  )
}
