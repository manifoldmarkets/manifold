import clsx from 'clsx'
import { CSSProperties, Ref, ReactNode } from 'react'

export function Col(props: {
  children?: ReactNode
  className?: string
  style?: CSSProperties
  ref?: Ref<HTMLDivElement>
}) {
  const { children, className, style, ref } = props

  return (
    <div className={clsx(className, 'flex flex-col')} style={style} ref={ref}>
      {children}
    </div>
  )
}
