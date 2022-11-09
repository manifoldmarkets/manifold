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
          'invalid:border-scarlet-500 invalid:text-scarlet-900 invalid:placeholder-scarlet-300 h-12 rounded-md border bg-white px-4 shadow-sm transition-colors focus:outline-none disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-50 disabled:text-gray-500 md:text-sm',
          error
            ? 'border-scarlet-300 text-scarlet-900 placeholder-scarlet-300 focus:border-scarlet-500 focus:ring-scarlet-500' // matches invalid: styles
            : 'border-gray-300 placeholder-gray-400 focus:border-indigo-500 focus:ring-indigo-500',
          className
        )}
        {...rest}
      />
    )
  }
)
