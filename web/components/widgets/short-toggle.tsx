/* This example requires Tailwind CSS v2.0+ */
import { Switch } from '@headlessui/react'
import clsx from 'clsx'

export default function ShortToggle(props: {
  on: boolean
  setOn: (enabled: boolean) => void
  disabled?: boolean
  onChange?: (enabled: boolean) => void
}) {
  const { on, setOn, disabled } = props

  return (
    <Switch
      disabled={disabled}
      checked={on}
      onChange={(e: boolean) => {
        setOn(e)
        if (props.onChange) {
          props.onChange(e)
        }
      }}
      className={clsx(
        'focus:ring-primary-500 group relative inline-flex h-5 w-10 flex-shrink-0 items-center justify-center rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2',
        !disabled ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'
      )}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute h-full w-full rounded-md bg-inherit"
      />
      <span
        aria-hidden="true"
        className={clsx(
          on ? 'bg-primary-600' : 'bg-ink-200',
          'pointer-events-none absolute mx-auto h-4 w-9 rounded-full transition-colors duration-200 ease-in-out'
        )}
      />
      <span
        aria-hidden="true"
        className={clsx(
          on ? 'translate-x-5' : 'translate-x-0',
          'border-ink-200 bg-canvas-0 pointer-events-none absolute left-0 inline-block h-5 w-5 transform rounded-full border shadow ring-0 transition-transform duration-200 ease-in-out'
        )}
      />
    </Switch>
  )
}
