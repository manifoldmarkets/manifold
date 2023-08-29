import clsx from 'clsx'
import { forwardRef, Ref } from 'react'
import { IconButton } from 'web/components/buttons/button'
import { XIcon } from '@heroicons/react/outline'

/** Text input. Wraps html `<input>` */
export const Input = forwardRef(
  (
    props: {
      error?: boolean
      showClearButton?: boolean
    } & JSX.IntrinsicElements['input'],
    ref: Ref<HTMLInputElement>
  ) => {
    const { error, showClearButton, className, ...rest } = props

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
        <input
          ref={ref}
          className={clsx(
            'invalid:border-scarlet-500 invalid:text-scarlet-700 invalid:dark:text-scarlet-300 invalid:placeholder-scarlet-300 disabled:bg-canvas-50 disabled:border-ink-200 disabled:text-ink-500 bg-canvas-0 h-12 rounded-md border px-4 shadow-sm transition-colors focus:outline-none focus:ring-1 disabled:cursor-not-allowed md:text-sm',
            error
              ? 'border-scarlet-300 text-scarlet-700 dark:text-scarlet-300 placeholder-scarlet-300 focus:border-scarlet-500 focus:ring-scarlet-500' // matches invalid: styles
              : 'border-ink-300 placeholder-ink-400 focus:ring-primary-500 focus:border-primary-500',
            className
          )}
          {...rest}
        />
        {showClearButton && (
          <IconButton
            className={'absolute right-0 top-2'}
            size={'sm'}
            onClick={() => {
              if (rest.onChange) rest.onChange({ target: { value: '' } } as any)
            }}
          >
            <XIcon className={'h-5 w-5'} />
          </IconButton>
        )}
      </>
    )
  }
)
