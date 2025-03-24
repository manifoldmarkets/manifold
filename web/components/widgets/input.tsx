import clsx from 'clsx'
import { forwardRef, Ref } from 'react'
import { SearchIcon } from '@heroicons/react/solid'

/** Text input. Wraps html `<input>` */
export const Input = forwardRef(
  (
    props: {
      error?: boolean
      showSearchIcon?: boolean
    } & JSX.IntrinsicElements['input'],
    ref: Ref<HTMLInputElement>
  ) => {
    const { error, className, showSearchIcon, ...rest } = props

    return (
      <>
        {/* eslint-disable-next-line react/no-unknown-property */}
        <style jsx>{`
          input::-webkit-inner-spin-button,
          input::-webkit-outer-spin-button {
            -webkit-appearance: none;
            margin: 0;
          }
          input {
            -moz-appearance: textfield;
            appearance: textfield;
          }
        `}</style>
        <div className="relative flex w-full items-center">
          {showSearchIcon && (
            <SearchIcon className="text-ink-400 absolute left-3 h-5 w-5" />
          )}
          <input
            ref={ref}
            className={clsx(
              `invalid:border-error invalid:text-error disabled:bg-canvas-50
               disabled:border-ink-200 disabled:text-ink-500 bg-canvas-0 h-12 rounded-md
                border px-4 shadow-sm transition-colors invalid:placeholder-rose-700
                focus:outline-none focus:ring-1 disabled:cursor-not-allowed md:text-sm`,
              showSearchIcon && 'pl-10',
              error
                ? 'border-error text-error focus:border-error focus:ring-error placeholder-rose-700' // matches invalid: styles
                : 'border-ink-300 placeholder-ink-400 hover:ring-primary-500 focus:ring-primary-500 focus:border-primary-500 hover:ring-1',
              className
            )}
            step={rest.step ?? 0.001} // default to 3 decimal places
            {...rest}
          />
        </div>
      </>
    )
  }
)
