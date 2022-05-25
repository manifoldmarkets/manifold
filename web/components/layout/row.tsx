import clsx from 'clsx'
import {ReactNode} from 'react'

export function Row(props: {
  children?: ReactNode
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
