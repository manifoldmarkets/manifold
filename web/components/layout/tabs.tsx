import clsx from 'clsx'
import {
  useRouter,
  usePathname,
  ReadonlyURLSearchParams,
} from 'next/navigation'

import { ReactNode, useEffect, useRef } from 'react'
import { track } from 'web/lib/service/analytics'
import { Col } from './col'
import { Tooltip } from 'web/components/widgets/tooltip'
import { Row } from 'web/components/layout/row'
import { Carousel } from 'web/components/widgets/carousel'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { useDefinedSearchParams } from 'web/hooks/use-defined-search-params'

export type Tab = {
  title: string
  content: ReactNode
  stackedTabIcon?: ReactNode
  inlineTabIcon?: ReactNode
  tooltip?: string
  className?: string
  queryString?: string
}

type TabProps = {
  tabs: Tab[]
  labelClassName?: string
  onClick?: (tabTitleOrQueryTitle: string, index: number) => void
  className?: string
  labelsParentClassName?: string
  trackingName?: string
  // Default is to lazy render tabs as they are selected. If true, it will render all tabs at once.
  renderAllTabs?: boolean
}

export function ControlledTabs(props: TabProps & { activeIndex: number }) {
  const {
    tabs,
    activeIndex,
    labelClassName,
    onClick,
    className,
    renderAllTabs,
    labelsParentClassName,
    trackingName,
  } = props

  const hasRenderedIndexRef = useRef(new Set<number>())
  hasRenderedIndexRef.current.add(activeIndex)

  return (
    <>
      <Carousel
        className={clsx('border-ink-200 border-b', className)}
        labelsParentClassName={labelsParentClassName}
        aria-label="Tabs"
      >
        {tabs.map((tab, i) => (
          <a
            href="#"
            key={tab.queryString ?? tab.title}
            onClick={(e) => {
              e.preventDefault()

              onClick?.(
                tab.queryString?.toLowerCase() ?? tab.title.toLowerCase(),
                i
              )

              if (trackingName) {
                track(trackingName, {
                  tab: tab.title,
                })
              }
            }}
            className={clsx(
              activeIndex === i
                ? 'border-primary-500 text-primary-600'
                : 'text-ink-500 hover:border-ink-300 hover:text-ink-700 border-transparent',
              'mr-4 inline-flex cursor-pointer flex-row gap-1 whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium ',
              labelClassName,
              'flex-shrink-0'
            )}
            aria-current={activeIndex === i ? 'page' : undefined}
          >
            <Col>
              <Tooltip text={tab.tooltip}>
                {tab.stackedTabIcon && (
                  <Row className="justify-center">{tab.stackedTabIcon}</Row>
                )}
                <Row className={'items-center'}>
                  {tab.title}
                  {tab.inlineTabIcon}
                </Row>
              </Tooltip>
            </Col>
          </a>
        ))}
      </Carousel>
      {tabs
        .map((tab, i) => ({ tab, i }))
        .filter(({ i }) => renderAllTabs || hasRenderedIndexRef.current.has(i))
        .map(({ tab, i }) => (
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
  const [activeIndex, setActiveIndex] = usePersistentInMemoryState(
    defaultIndex ?? 0,
    `tab-${props.trackingName}-${props.tabs[0]?.title}`
  )
  return (
    <ControlledTabs
      {...rest}
      activeIndex={activeIndex}
      onClick={(titleOrQueryTitle, i) => {
        setActiveIndex(i)
        onClick?.(titleOrQueryTitle, i)
      }}
    />
  )
}

const isTabSelected = (
  params: ReadonlyURLSearchParams,
  queryParam: string,
  tab: Tab
) => {
  const selected = params.get(queryParam)
  if (typeof selected === 'string') {
    return (
      (tab.queryString?.toLowerCase() ?? tab.title.toLowerCase()) === selected
    )
  } else {
    return false
  }
}

export function QueryUncontrolledTabs(
  props: TabProps & { defaultIndex?: number; scrollToTop?: boolean }
) {
  const { tabs, defaultIndex, onClick, scrollToTop, ...rest } = props
  const router = useRouter()
  const pathName = usePathname()
  const { searchParams, createQueryString } = useDefinedSearchParams()
  const selectedIdx = tabs.findIndex((t) =>
    isTabSelected(searchParams, 'tab', t)
  )
  const activeIndex = selectedIdx !== -1 ? selectedIdx : defaultIndex ?? 0

  useEffect(() => {
    if (onClick) {
      onClick(
        tabs[activeIndex].queryString ?? tabs[activeIndex].title,
        activeIndex
      )
    }
  }, [activeIndex])

  return (
    <ControlledTabs
      {...rest}
      tabs={tabs}
      activeIndex={activeIndex}
      onClick={(title) => {
        if (scrollToTop) window.scrollTo({ top: 0 })
        router.replace(pathName + '?' + createQueryString('tab', title))
      }}
    />
  )
}

// legacy code that didn't know about any other kind of tabs imports this
export const Tabs = UncontrolledTabs
