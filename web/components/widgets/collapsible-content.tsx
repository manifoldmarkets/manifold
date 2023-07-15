import {
  ChevronDoubleDownIcon,
  ChevronDoubleUpIcon,
} from '@heroicons/react/solid'
import { JSONContent } from '@tiptap/react'
import clsx from 'clsx'
import { MouseEventHandler, useRef, useState } from 'react'
import { Button } from 'web/components/buttons/button'
import { useSafeLayoutEffect } from 'web/hooks/use-safe-layout-effect'
import { Row } from '../layout/row'
import { Content } from './editor'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'

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
  defaultCollapse?: boolean
  children?: React.ReactNode
  hideButton?: boolean
}) {
  const { content, stateKey, defaultCollapse, children, hideButton } = props
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
    return (
      <ActuallyCollapsibleContent
        content={content}
        stateKey={stateKey}
        defaultCollapse={defaultCollapse}
        hideButton={hideButton}
      >
        {children}
      </ActuallyCollapsibleContent>
    )
  }
  return (
    <div ref={contentRef}>
      <Content content={content} />
      <div className="text-right">{children}</div>
    </div>
  )
}

// Moved to its own component to reduce unnecessary isCollapsed states in local storage
function ActuallyCollapsibleContent(props: {
  content: JSONContent | string
  stateKey: string
  defaultCollapse?: boolean
  children?: React.ReactNode
  hideButton?: boolean
}) {
  const { content, stateKey, defaultCollapse, children, hideButton } = props
  const [collapsed, setCollapsed] = usePersistentLocalState<boolean>(
    defaultCollapse ?? false,
    stateKey
  )
  const [overrideCollaped, setOverrideCollaped] = useState(defaultCollapse)
  const isCollapsed = overrideCollaped ?? collapsed

  const button = (
    <ShowMoreLessButton
      className="ml-2 bg-transparent"
      onClick={() => {
        if (!isCollapsed)
          window.scrollTo({
            top: 0,
            behavior: 'smooth',
          })
        setCollapsed(!isCollapsed)
        setOverrideCollaped(!isCollapsed)
      }}
      isCollapsed={isCollapsed}
    />
  )

  return (
    <div>
      <div
        style={{ height: isCollapsed ? COLLAPSIBLE_HEIGHT : 'auto' }}
        className={clsx(
          'transition-height relative w-full overflow-hidden rounded-b-md'
        )}
      >
        <div>
          {!hideButton && <Row className="justify-end">{button}</Row>}
          <Content content={content} />
        </div>
        {isCollapsed && (
          <>
            <div className="absolute bottom-0 w-full">
              <div className="from-canvas-100 h-8 bg-gradient-to-t" />
            </div>
          </>
        )}
        {!isCollapsed && <div className="text-right">{children}</div>}
      </div>
    </div>
  )
}
