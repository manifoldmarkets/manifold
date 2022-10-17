import clsx from 'clsx'
import { forwardRef, Ref } from 'react'

/** Text input. Wraps html `<input>` */
export const Input = forwardRef(
  (
    props: { error?: boolean } & JSX.IntrinsicElements['input'],
    ref: Ref<HTMLInputElement>
  ) => {
    const { error, className, ...rest } = props

    return (
      <input
        ref={ref}
        className={clsx(
          'h-12 rounded-md border bg-white px-4 shadow-sm transition-colors invalid:border-red-600 invalid:text-red-900 invalid:placeholder-red-300 focus:outline-none disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-50 disabled:text-gray-500 md:text-sm',
          error
            ? 'border-red-300 text-red-900 placeholder-red-300 focus:border-red-600 focus:ring-red-500' // matches invalid: styles
            : 'placeholder-greyscale-4 border-gray-300 focus:border-indigo-500 focus:ring-indigo-500',
          className
        )}
        {...rest}
      />
    )
  }
)
