import clsx from 'clsx'
import { CSSProperties } from 'react'

export function Col(props: {
  children?: any
  className?: string
  style?: CSSProperties
}) {
  const { children, className, style } = props

  return (
    <div className={clsx(className, 'flex flex-col')} style={style}>
      {children}
    </div>
  )
}
