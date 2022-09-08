/* This example requires Tailwind CSS v2.0+ */
import { Switch } from '@headlessui/react'
import clsx from 'clsx'

export default function ShortToggle(props: {
  enabled: boolean
  setEnabled: (enabled: boolean) => void
  onChange?: (enabled: boolean) => void
}) {
  const { enabled, setEnabled } = props

  return (
    <Switch
      checked={enabled}
      onChange={(e: boolean) => {
        setEnabled(e)
        if (props.onChange) {
          props.onChange(e)
        }
      }}
      className="group relative inline-flex h-5 w-10 flex-shrink-0 cursor-pointer items-center justify-center rounded-full focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
    >
      <span className="sr-only">Use setting</span>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute h-full w-full rounded-md bg-white"
      />
      <span
        aria-hidden="true"
        className={clsx(
          enabled ? 'bg-indigo-600' : 'bg-gray-200',
          'pointer-events-none absolute mx-auto h-4 w-9 rounded-full transition-colors duration-200 ease-in-out'
        )}
      />
      <span
        aria-hidden="true"
        className={clsx(
          enabled ? 'translate-x-5' : 'translate-x-0',
          'pointer-events-none absolute left-0 inline-block h-5 w-5 transform rounded-full border border-gray-200 bg-white shadow ring-0 transition-transform duration-200 ease-in-out'
        )}
      />
    </Switch>
  )
}
