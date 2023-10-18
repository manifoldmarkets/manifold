/* This example requires Tailwind CSS v2.0+ */
import { Switch } from '@headlessui/react'
import clsx from 'clsx'

export default function ShortToggle(props: {
  on: boolean
  setOn: (enabled: boolean) => void
  disabled?: boolean
  className?: string
}) {
  const { on, setOn, disabled, className } = props

  return (
    <Switch
      disabled={disabled}
      checked={on}
      onChange={setOn}
      className={clsx(
        'ring-primary-500 ring-offset-canvas-50 group relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent ring-offset-2 transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2',
        on ? 'bg-primary-500' : 'bg-ink-300',
        !disabled ? 'cursor-pointer' : 'cursor-not-allowed opacity-50',
        className
      )}
    >
      <span
        aria-hidden="true"
        className={clsx(
          on
            ? 'dark:bg-primary-50 translate-x-5'
            : 'dark:bg-ink-600 translate-x-0',
          'bg-canvas-0 pointer-events-none inline-block h-5 w-5 rounded-full ring-0 transition duration-200 ease-in-out'
        )}
      />
    </Switch>
  )
}
