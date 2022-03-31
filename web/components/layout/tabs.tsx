import clsx from 'clsx'
import { useState } from 'react'

type Tab = {
  title: string
  tabIcon?: JSX.Element
  content: JSX.Element
}

export function Tabs(props: { tabs: Tab[]; defaultIndex?: number }) {
  const { tabs, defaultIndex } = props
  const [activeIndex, setActiveIndex] = useState(defaultIndex ?? 0)
  const activeTab = tabs[activeIndex]

  return (
    <div>
      <nav className="flex space-x-4" aria-label="Tabs">
        {tabs.map((tab, i) => (
          <a
            key={tab.title}
            href="#"
            className={clsx(
              tab.title === activeTab.title
                ? 'bg-gray-200 text-gray-700'
                : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700',
              'rounded-md px-3 py-2 text-sm font-medium'
            )}
            aria-current={tab.title === activeTab.title ? 'page' : undefined}
            onClick={(e) => {
              e.preventDefault()
              setActiveIndex(i)
            }}
          >
            {tab.tabIcon ? <span className="mr-2">{tab.tabIcon}</span> : null}
            {tab.title}
          </a>
        ))}
      </nav>

      <div className="mt-4">{activeTab.content}</div>
    </div>
  )
}
