import clsx from 'clsx'
import { ReactNode } from 'react'

export function Title(props: {
  className?: string
  children?: ReactNode
  textColor?: string
}) {
  const { children, className, textColor } = props
  return (
    <h1
      className={clsx(
        'my-4 inline-block text-2xl font-normal sm:my-6 sm:text-3xl',
        className,
        textColor || 'text-indigo-700'
      )}
    >
      {children}
    </h1>
  )
}
