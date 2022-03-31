import clsx from 'clsx'
import Link from 'next/link'
import { useState } from 'react'

type Tab = {
  title: string
  tabIcon?: JSX.Element
  content: JSX.Element
  // If set, change the url to this href when the tab is selected
  href?: string
}

export function Tabs(props: { tabs: Tab[]; defaultIndex?: number }) {
  const { tabs, defaultIndex } = props
  const [activeIndex, setActiveIndex] = useState(defaultIndex ?? 0)
  const activeTab = tabs[activeIndex]

  return (
    <div>
      <nav className="flex space-x-4" aria-label="Tabs">
        {tabs.map((tab, i) => (
          <Link href={tab.href ?? '#'} key={tab.title} shallow={!!tab.href}>
            <a
              key={tab.title}
              className={clsx(
                tab.title === activeTab.title
                  ? 'bg-gray-200 text-gray-700'
                  : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700',
                'rounded-md px-3 py-2 text-sm font-medium'
              )}
              aria-current={tab.title === activeTab.title ? 'page' : undefined}
              onClick={(e) => {
                if (!tab.href) {
                  e.preventDefault()
                }
                setActiveIndex(i)
              }}
            >
              {tab.tabIcon ? <span className="mr-2">{tab.tabIcon}</span> : null}
              {tab.title}
            </a>
          </Link>
        ))}
      </nav>

      <div className="mt-4">{activeTab.content}</div>
    </div>
  )
}
