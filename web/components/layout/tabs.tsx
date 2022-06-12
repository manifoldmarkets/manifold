import clsx from 'clsx'
import Link from 'next/link'
import { ReactNode, useState } from 'react'
import { Row } from './row'

type Tab = {
  title: string
  tabIcon?: ReactNode
  content: ReactNode
  // If set, change the url to this href when the tab is selected
  href?: string
}

export function Tabs(props: {
  tabs: Tab[]
  defaultIndex?: number
  className?: string
  onClick?: (tabTitle: string, index: number) => void
}) {
  const { tabs, defaultIndex, className, onClick } = props
  const [activeIndex, setActiveIndex] = useState(defaultIndex ?? 0)
  const activeTab = tabs[activeIndex]

  return (
    <div>
      <div className="border-b border-gray-200 dark:border-gray-800">
        <nav className="-mb-px flex space-x-8" aria-label="Tabs">
          {tabs.map((tab, i) => (
            <Link href={tab.href ?? '#'} key={tab.title} shallow={!!tab.href}>
              <a
                key={tab.title}
                onClick={(e) => {
                  if (!tab.href) {
                    e.preventDefault()
                  }
                  setActiveIndex(i)
                  onClick?.(tab.title, i)
                }}
                className={clsx(
                  activeIndex === i
                    ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                    : 'border-transparent text-gray-500 hover:border-gray-300 dark:hover:border-gray-700 hover:text-gray-700 dark:hover:text-gray-300',
                  'cursor-pointer whitespace-nowrap border-b-2 dark:border-b-998 py-3 px-1 text-sm font-medium',
                  className
                )}
                aria-current={activeIndex === i ? 'page' : undefined}
              >
                <Row className={'items-center justify-center gap-1'}>
                  {tab.tabIcon && <span> {tab.tabIcon}</span>}
                  {tab.title}
                </Row>
              </a>
            </Link>
          ))}
        </nav>
      </div>

      <div className="mt-4">{activeTab.content}</div>
    </div>
  )
}
