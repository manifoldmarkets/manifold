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
  labelClassName?: string
  onClick?: (tabTitle: string, index: number) => void
}) {
  const { tabs, defaultIndex, labelClassName, onClick } = props
  const [activeIndex, setActiveIndex] = useState(defaultIndex ?? 0)
  const activeTab = tabs[activeIndex] as Tab | undefined // can be undefined in weird case

  return (
    <>
      <div className="border-b border-gray-200">
        <nav className="-mb-px mb-4 flex space-x-8" aria-label="Tabs">
          {tabs.map((tab, i) => (
            <Link href={tab.href ?? '#'} key={tab.title} shallow={!!tab.href}>
              <a
                id={`tab-${i}`}
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
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700',
                  'cursor-pointer whitespace-nowrap border-b-2 py-3 px-1 text-sm font-medium',
                  labelClassName
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

      {activeTab?.content}
    </>
  )
}
