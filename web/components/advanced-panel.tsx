import clsx from 'clsx'
import { useState, ReactNode } from 'react'

export function AdvancedPanel(props: { children: ReactNode }) {
  const { children } = props
  const [collapsed, setCollapsed] = useState(true)

  return (
    <div
      tabIndex={0}
      className={clsx(
        'collapse collapse-arrow relative',
        collapsed ? 'collapse-close' : 'collapse-open'
      )}
    >
      <div
        onClick={() => setCollapsed((collapsed) => !collapsed)}
        className="cursor-pointer"
      >
        <div className="mt-4 mr-6 text-right text-sm text-gray-500">
          Advanced
        </div>
        <div
          className="collapse-title absolute h-0 min-h-0 w-0 p-0"
          style={{
            top: -2,
            right: -15,
            color: '#6a7280' /* gray-500 */,
          }}
        />
      </div>

      <div className="collapse-content m-0 !bg-transparent !p-0">
        {children}
      </div>
    </div>
  )
}
