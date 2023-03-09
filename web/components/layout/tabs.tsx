import clsx from 'clsx'
import { useRouter, NextRouter } from 'next/router'
import { ReactNode, useState } from 'react'
import { track } from 'web/lib/service/analytics'
import { Col } from './col'
import { Tooltip } from 'web/components/widgets/tooltip'
import { Row } from 'web/components/layout/row'

type Tab = {
  title: string
  content: ReactNode
  stackedTabIcon?: ReactNode
  inlineTabIcon?: ReactNode
  tooltip?: string
  className?: string
}

type TabProps = {
  tabs: Tab[]
  labelClassName?: string
  onClick?: (tabTitle: string, index: number) => void
  className?: string
  currentPageForAnalytics?: string
}

export function ControlledTabs(props: TabProps & { activeIndex: number }) {
  const {
    tabs,
    activeIndex,
    labelClassName,
    onClick,
    className,
    currentPageForAnalytics,
  } = props
  return (
    <>
      <nav
        className={clsx('border-ink-200 space-x-8 border-b', className)}
        aria-label="Tabs"
      >
        {tabs.map((tab, i) => (
          <a
            href="#"
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
                ? 'border-primary-500 text-primary-600'
                : 'text-ink-500 hover:border-ink-300 hover:text-ink-700 border-transparent',
              'inline-flex cursor-pointer flex-row gap-1 whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium',
              labelClassName
            )}
            aria-current={activeIndex === i ? 'page' : undefined}
          >
            <Col>
              <Tooltip text={tab.tooltip}>
                {tab.stackedTabIcon && (
                  <Row className="justify-center">{tab.stackedTabIcon}</Row>
                )}
                <Row className={'gap-1 '}>
                  {tab.title}
                  {tab.inlineTabIcon}
                </Row>
              </Tooltip>
            </Col>
          </a>
        ))}
      </nav>
      {tabs.map((tab, i) => (
        <div
          key={i}
          className={clsx(
            i === activeIndex ? 'contents' : 'hidden',
            tab.className
          )}
        >
          {tab.content}
        </div>
      ))}
    </>
  )
}

export function UncontrolledTabs(props: TabProps & { defaultIndex?: number }) {
  const { defaultIndex, onClick, ...rest } = props
  const [activeIndex, setActiveIndex] = useState(defaultIndex ?? 0)
  return (
    <ControlledTabs
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

export function QueryUncontrolledTabs(
  props: TabProps & { defaultIndex?: number }
) {
  const { tabs, defaultIndex, onClick, ...rest } = props
  const router = useRouter()
  const selectedIdx = tabs.findIndex((t) => isTabSelected(router, 'tab', t))
  const activeIndex = selectedIdx !== -1 ? selectedIdx : defaultIndex ?? 0
  return (
    <ControlledTabs
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
export const Tabs = UncontrolledTabs
