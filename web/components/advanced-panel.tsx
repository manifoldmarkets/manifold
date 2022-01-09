import clsx from 'clsx'
import { useState } from 'react'

export function AdvancedPanel(props: { children: any }) {
  const { children } = props
  const [collapsed, setCollapsed] = useState(true)

  return (
    <div
      tabIndex={0}
      className={clsx(
        'relative collapse collapse-arrow',
        collapsed ? 'collapse-close' : 'collapse-open'
      )}
    >
      <div
        onClick={() => setCollapsed((collapsed) => !collapsed)}
        className="cursor-pointer"
      >
        <div className="mt-4 mr-6 text-sm text-gray-500 text-right">
          Advanced
        </div>
        <div
          className="collapse-title p-0 absolute w-0 h-0 min-h-0"
          style={{
            top: -2,
            right: -15,
            color: '#6a7280' /* gray-500 */,
          }}
        />
      </div>

      <div className="collapse-content !p-0 m-0 !bg-transparent">
        {children}
      </div>
    </div>
  )
}
