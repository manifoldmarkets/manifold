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
          'invalid:border-scarlet-500 invalid:text-scarlet-700 invalid:dark:text-scarlet-300 invalid:placeholder-scarlet-300 disabled:bg-canvas-50 disabled:border-ink-200 disabled:text-ink-500 bg-canvas-0 h-12 rounded-md border px-4 shadow-sm transition-colors focus:outline-none focus:ring-1 disabled:cursor-not-allowed md:text-sm',
          error
            ? 'border-scarlet-300 text-scarlet-700 dark:text-scarlet-300 placeholder-scarlet-300 focus:border-scarlet-500 focus:ring-scarlet-500' // matches invalid: styles
            : 'border-ink-700 placeholder-ink-400 focus:border-primary-500 focus:ring-primary-500',
          className
        )}
        {...rest}
      />
    )
  }
)
