import clsx from 'clsx'
import { ReactNode } from 'react'

export function Title(props: { className?: string; children?: ReactNode }) {
  const { children, className } = props
  return (
    <h1
      className={clsx(
        'my-4 inline-block text-2xl font-normal text-indigo-700 sm:my-6 sm:text-3xl',
        className
      )}
    >
      {children}
    </h1>
  )
}
