import { Switch } from '@headlessui/react'
import clsx from 'clsx'
import React from 'react'
import { Tooltip } from 'web/components/widgets/tooltip'

export const SwitchSetting = (props: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  disabled: boolean
}) => {
  const { checked, onChange, label, disabled } = props
  return (
    <Switch.Group as="div" className="flex items-center">
      <Tooltip
        text={
          disabled
            ? `You are opted out of all ${label} notifications. Go to the Opt Out section to undo this setting.`
            : ''
        }
      >
        <Switch
          checked={checked}
          onChange={onChange}
          className={clsx(
            checked ? 'bg-indigo-600' : 'bg-gray-200',
            'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2',
            disabled ? 'cursor-not-allowed opacity-50' : ''
          )}
          disabled={disabled}
        >
          <span
            aria-hidden="true"
            className={clsx(
              checked ? 'translate-x-5' : 'translate-x-0',
              'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out'
            )}
          />
        </Switch>
      </Tooltip>
      <Switch.Label as="span" className="ml-3">
        <span
          className={clsx(
            'text-sm font-medium text-gray-900',
            disabled ? 'cursor-not-allowed opacity-50' : ''
          )}
        >
          {label}
        </span>
      </Switch.Label>
    </Switch.Group>
  )
}
