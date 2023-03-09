import {
  ChevronDoubleDownIcon,
  ChevronDoubleUpIcon,
} from '@heroicons/react/solid'
import { JSONContent } from '@tiptap/react'
import clsx from 'clsx'
import { MouseEventHandler, useRef, useState } from 'react'
import { Button } from 'web/components/buttons/button'
import {
  storageStore,
  usePersistentState,
} from 'web/hooks/use-persistent-state'
import { useSafeLayoutEffect } from 'web/hooks/use-safe-layout-effect'
import { safeLocalStorage } from 'web/lib/util/local'
import { Row } from '../layout/row'
import { Content } from './editor'

export const COLLAPSIBLE_HEIGHT = 26 * 3 // line height is 26px
export const SHOW_COLLAPSE_TRESHOLD = 180

export function ShowMoreLessButton(props: {
  onClick?: MouseEventHandler<any> | undefined
  isCollapsed: boolean
  className?: string
  howManyMore?: number
  moreWhat?: string
}) {
  const { onClick, isCollapsed, className, howManyMore, moreWhat = '' } = props
  const howManyMoreText = howManyMore ? howManyMore + ' ' : ''

  return (
    <Button
      color="override"
      className={clsx(
        'bg-canvas-0 text-primary-500 hover:text-primary-700 z-10 select-none text-sm',
        className
      )}
      onClick={onClick}
      size={'xs'}
    >
      <Row className="items-center gap-0.5">
        {isCollapsed
          ? `Show ${howManyMoreText}more ${moreWhat}`
          : `Show less ${moreWhat}`}
        {isCollapsed ? (
          <ChevronDoubleDownIcon className="h-4 w-4" />
        ) : (
          <ChevronDoubleUpIcon className="h-4 w-4" />
        )}
      </Row>
    </Button>
  )
}

export function CollapsibleContent(props: {
  content: JSONContent | string
  stateKey: string
}) {
  const { content, stateKey } = props
  const [shouldAllowCollapseOfContent, setShouldAllowCollapseOfContent] =
    useState(false)
  const contentRef = useRef<HTMLDivElement>(null)

  useSafeLayoutEffect(() => {
    if (contentRef.current) {
      if (contentRef.current.offsetHeight > SHOW_COLLAPSE_TRESHOLD) {
        setShouldAllowCollapseOfContent(true)
      }
    }
  }, [contentRef.current?.offsetHeight])
  if (shouldAllowCollapseOfContent) {
    return <ActuallyCollapsibleContent content={content} stateKey={stateKey} />
  }
  return (
    <div ref={contentRef}>
      <Content content={content} />
    </div>
  )
}

// Moved to its own component to reduce unnecessary isCollapsed states in local storage
function ActuallyCollapsibleContent(props: {
  content: JSONContent | string
  stateKey: string
}) {
  const { content, stateKey } = props
  const [isCollapsed, setIsCollapsed] = usePersistentState<boolean>(false, {
    store: storageStore(safeLocalStorage),
    key: stateKey,
  })
  return (
    <div>
      <div
        style={{ height: isCollapsed ? COLLAPSIBLE_HEIGHT : 'auto' }}
        className={clsx(
          'transition-height relative w-full overflow-hidden rounded-b-md'
        )}
      >
        <div>
          <Content content={content} />
        </div>
        {isCollapsed && (
          <>
            <div className="absolute bottom-0 w-full">
              <div className="from-ink-100 h-12 bg-gradient-to-t" />
            </div>
          </>
        )}
      </div>
      <div className="text-right">
        <ShowMoreLessButton
          className="bg-transparent"
          onClick={() => {
            if (!isCollapsed)
              window.scrollTo({
                top: 0,
                behavior: 'smooth',
              })
            setIsCollapsed(!isCollapsed)
          }}
          isCollapsed={isCollapsed}
        />
      </div>
    </div>
  )
}
