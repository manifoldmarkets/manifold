import clsx from 'clsx'
import Link from 'next/link'
import { useRouter, NextRouter } from 'next/router'
import { ReactNode, useState } from 'react'
import { Row } from './row'
import { track } from '@amplitude/analytics-browser'

type Tab = {
  title: string
  tabIcon?: ReactNode
  content: ReactNode
  // If set, show a badge with this content
  badge?: string
}

type TabProps = {
  tabs: Tab[]
  labelClassName?: string
  onClick?: (tabTitle: string, index: number) => void
  className?: string
  currentPageForAnalytics?: string
}

export function UncontrolledTabs(props: TabProps & { activeIndex: number }) {
  const {
    tabs,
    activeIndex,
    labelClassName,
    onClick,
    className,
    currentPageForAnalytics,
  } = props
  const activeTab = tabs[activeIndex] as Tab | undefined // can be undefined in weird case
  return (
    <>
      <div className={clsx('mb-4 border-b border-gray-200', className)}>
        <nav className="-mb-px flex space-x-8" aria-label="Tabs">
          {tabs.map((tab, i) => (
            <Link href="#" key={tab.title} shallow={false}>
              <a
                key={tab.title}
                onClick={(e) => {
                  e.preventDefault()
                  track('Clicked Tab', {
                    title: tab.title,
                    currentPage: currentPageForAnalytics,
                  })
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
                  {tab.badge ? (
                    <div className="px-0.5 font-bold">{tab.badge}</div>
                  ) : null}
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

export function ControlledTabs(props: TabProps & { defaultIndex?: number }) {
  const { defaultIndex, onClick, ...rest } = props
  const [activeIndex, setActiveIndex] = useState(defaultIndex ?? 0)
  return (
    <UncontrolledTabs
      {...rest}
      activeIndex={activeIndex}
      onClick={(title, i) => {
        setActiveIndex(i)
        onClick?.(title, i)
      }}
    />
  )
}

const isTabSelected = (router: NextRouter, queryParam: string, tab: Tab) => {
  const selected = router.query[queryParam]
  if (typeof selected === 'string') {
    return tab.title.toLowerCase() === selected
  } else {
    return false
  }
}

export function QueryControlledTabs(
  props: TabProps & { defaultIndex?: number }
) {
  const { tabs, defaultIndex, onClick, ...rest } = props
  const router = useRouter()
  const selectedIdx = tabs.findIndex((t) => isTabSelected(router, 'tab', t))
  const activeIndex = selectedIdx !== -1 ? selectedIdx : defaultIndex ?? 0
  return (
    <UncontrolledTabs
      {...rest}
      tabs={tabs}
      activeIndex={activeIndex}
      onClick={(title, i) => {
        router.replace(
          { query: { ...router.query, tab: title.toLowerCase() } },
          undefined,
          { shallow: true }
        )
        onClick?.(title, i)
      }}
    />
  )
}

// legacy code that didn't know about any other kind of tabs imports this
export const Tabs = ControlledTabs
