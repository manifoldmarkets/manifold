import clsx from 'clsx'

export function Checkbox(props: {
  label: string
  checked: boolean
  toggle: (checked: boolean) => void
  className?: string
}) {
  const { label, checked, toggle, className } = props

  return (
    <div className={clsx(className, 'space-y-5')}>
      <div className="relative flex items-start">
        <div className="flex h-6 items-center">
          <input
            id={label}
            type="checkbox"
            className="h-5 w-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            checked={checked}
            onChange={(e) => toggle(!e.target.checked)}
          />
        </div>
        <div className="ml-3">
          <label htmlFor={label} className="font-medium text-gray-700">
            {label}
          </label>
        </div>
      </div>
    </div>
  )
}
