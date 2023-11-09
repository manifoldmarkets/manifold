import clsx from 'clsx'
import { Switch } from '@headlessui/react'

export type ToggleColorMode = 'primary' | 'warning'

export default function ShortToggle(props: {
  on: boolean
  setOn: (enabled: boolean) => void
  disabled?: boolean
  className?: string
  colorMode?: ToggleColorMode
}) {
  const { on, setOn, disabled, className, colorMode = 'primary' } = props

  const toggleBaseClasses =
    'group relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent ring-offset-2 transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2'
  const toggleColorClasses = clsx({
    'ring-primary-500 ring-offset-canvas-50 bg-primary-500':
      on && colorMode === 'primary',
    'ring-amber-500 ring-offset-canvas-50 bg-amber-500':
      on && colorMode === 'warning',
    'bg-ink-300': !on,
  })
  const toggleEnabledClasses = !disabled
    ? 'cursor-pointer'
    : 'cursor-not-allowed opacity-50'

  const knobBaseClasses =
    'bg-canvas-0 pointer-events-none inline-block h-5 w-5 rounded-full ring-0 transition duration-200 ease-in-out'
  const knobColorClasses = clsx({
    'dark:bg-primary-50 translate-x-5': on && colorMode === 'primary',
    'dark:bg-amber-50 translate-x-5': on && colorMode === 'warning',
    'dark:bg-ink-600 translate-x-0': !on,
  })

  return (
    <Switch
      disabled={disabled}
      checked={on}
      onChange={setOn}
      className={clsx(
        toggleBaseClasses,
        toggleColorClasses,
        toggleEnabledClasses,
        className
      )}
    >
      <span
        aria-hidden="true"
        className={clsx(knobBaseClasses, knobColorClasses)}
      />
    </Switch>
  )
}
