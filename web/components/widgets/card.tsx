import clsx from 'clsx'
import React from 'react'

export const Card = React.forwardRef(function Card(
  props: JSX.IntrinsicElements['div'],
  ref: React.Ref<HTMLDivElement>
) {
  const { children, className, ...rest } = props
  return (
    <div
      className={clsx(
        'cursor-pointer rounded-lg border bg-white transition-shadow hover:shadow-md focus:shadow-md',
        className
      )}
      ref={ref}
      {...rest}
    >
      {children}
    </div>
  )
})
