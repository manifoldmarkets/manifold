import {
  ChevronDoubleDownIcon,
  ChevronDoubleUpIcon,
} from '@heroicons/react/solid'
import { JSONContent } from '@tiptap/react'
import clsx from 'clsx'
import { useRef, useState } from 'react'
import { Row } from '../layout/row'
import { Content } from './editor'
import { Button } from 'web/components/buttons/button'
import {
  storageStore,
  usePersistentState,
} from 'web/hooks/use-persistent-state'
import { safeLocalStorage } from 'web/lib/util/local'
import { useSafeLayoutEffect } from 'web/hooks/use-safe-layout-effect'

const COLLAPSIBLE_HEIGHT = 370
const START_COLLAPSED_HEIGHT = 800

export function ShowMoreLessButton(props: {
  onClick: () => void
  isCollapsed: boolean
  className?: string
}) {
  const { onClick, isCollapsed, className } = props
  return (
    <Button
      color={'gray-white'}
      className={clsx('z-10 select-none bg-white text-sm', className)}
      onClick={onClick}
    >
      <Row className="items-center gap-0.5 text-indigo-700 drop-shadow-2xl">
        {isCollapsed ? (
          <ChevronDoubleDownIcon className="h-4 w-4" />
        ) : (
          <ChevronDoubleUpIcon className="h-4 w-4" />
        )}
        {isCollapsed ? 'Show More' : 'Show Less'}
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
    useState(true)
  const contentRef = useRef<HTMLDivElement>(null)
  useSafeLayoutEffect(() => {
    if (contentRef.current) {
      if (contentRef.current.offsetHeight > START_COLLAPSED_HEIGHT) {
        setShouldAllowCollapseOfContent(true)
      }
    }
  }, [contentRef.current?.offsetHeight])

  const [isCollapsed, setIsCollapsed] = usePersistentState<boolean>(true, {
    store: storageStore(safeLocalStorage()),
    key: `isCollapsed-contract-${contractId}`,
  })

  if (shouldAllowCollapseOfContent) {
    return (
      <div className="relative">
        <div
          style={{ height: isCollapsed ? COLLAPSIBLE_HEIGHT : 'auto' }}
          className={clsx(
            'transition-height relative w-full overflow-hidden rounded-b-md'
          )}
        >
          <div ref={contentRef}>
            <Content content={content} />
          </div>
          {isCollapsed && (
            <>
              <div className="absolute bottom-0 w-full">
                <div className="h-16 bg-gradient-to-t from-gray-100" />
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
  return (
    <div ref={contentRef}>
      <Content content={content} />
    </div>
  )
}
