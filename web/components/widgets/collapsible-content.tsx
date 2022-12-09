import {
  ChevronDoubleDownIcon,
  ChevronDoubleUpIcon,
} from '@heroicons/react/solid'
import { JSONContent } from '@tiptap/react'
import clsx from 'clsx'
import { MouseEventHandler, useRef, useState } from 'react'
import { Row } from '../layout/row'
import { Content } from './editor'
import { Button } from 'web/components/buttons/button'
import {
  storageStore,
  usePersistentState,
} from 'web/hooks/use-persistent-state'
import { safeLocalStorage } from 'web/lib/util/local'
import { useSafeLayoutEffect } from 'web/hooks/use-safe-layout-effect'

const COLLAPSIBLE_HEIGHT = 45
const SHOW_COLLAPSE_TRESHOLD = 180

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
      color={'indigo-text-only'}
      className={clsx('z-10 select-none bg-white text-sm', className)}
      onClick={onClick}
      size={'xs'}
    >
      <Row className="items-center gap-0.5">
        {isCollapsed ? (
          <ChevronDoubleDownIcon className="h-4 w-4" />
        ) : (
          <ChevronDoubleUpIcon className="h-4 w-4" />
        )}
        {isCollapsed
          ? `Show ${howManyMoreText}More ${moreWhat}`
          : `Show Less ${moreWhat}`}
      </Row>
    </Button>
  )
}

export function CollapsibleContent(props: {
  content: JSONContent | string
  contractId: string
}) {
  const { content, contractId } = props
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
      <ActuallyCollapsibleContent content={content} contractId={contractId} />
    )
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
  contractId: string
}) {
  const { content, contractId } = props
  const [isCollapsed, setIsCollapsed] = usePersistentState<boolean>(false, {
    store: storageStore(safeLocalStorage()),
    key: `isCollapsed-contract-${contractId}`,
  })
  return (
    <div className="relative">
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
              <div className="h-12 bg-gradient-to-t from-gray-100" />
            </div>
          </>
        )}
      </div>
      <ShowMoreLessButton
        className="absolute right-0 -bottom-8 bg-transparent"
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
  )
}
