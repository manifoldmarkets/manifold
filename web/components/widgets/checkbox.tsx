import clsx from 'clsx'

export function Checkbox(props: {
  label: string
  checked: boolean
  toggle: (checked: boolean) => void
  className?: string
  disabled?: boolean
}) {
  const { label, checked, toggle, className, disabled } = props

  return (
    <div className={clsx(className, 'space-y-5')}>
      <div className="relative flex items-center">
        <div className="flex h-6 items-center">
          <input
            id={label}
            type="checkbox"
            className="border-ink-300 bg-canvas-0 dark:border-ink-500 text-primary-600 focus:ring-primary-500 h-5 w-5 rounded"
            checked={checked}
            onChange={(e) => toggle(e.target.checked)}
            disabled={disabled}
          />
        </div>
        <div className="ml-3">
          <label
            htmlFor={label}
            className={clsx(
              'whitespace-nowrap font-medium',
              disabled ? 'text-ink-300' : 'text-ink-700'
            )}
          >
            {label}
          </label>
        </div>
      </div>
    </div>
  )
}
