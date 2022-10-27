import {
  ChevronDoubleDownIcon,
  ChevronDoubleUpIcon,
} from '@heroicons/react/solid'
import { JSONContent } from '@tiptap/react'
import clsx from 'clsx'
import { useLayoutEffect, useRef, useState } from 'react'
import { Row } from '../layout/row'
import { Content } from './editor'
import { Button } from 'web/components/buttons/button'

export const COLLAPSIBLE_HEIGHT = 104

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
      <Row className="items-center gap-0.5 text-indigo-700">
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

export function CollapsibleContent(props: { content: JSONContent | string }) {
  const { content } = props
  const [shouldTruncate, setShouldTruncate] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (contentRef.current) {
      if (contentRef.current.offsetHeight > COLLAPSIBLE_HEIGHT) {
        setShouldTruncate(true)
      }
    }
  }, [contentRef.current?.offsetHeight])
  const [isCollapsed, setIsCollapsed] = useState(true)

  if (shouldTruncate) {
    return (
      <div
        className={clsx(
          'transition-height relative w-full overflow-hidden',
          isCollapsed ? `h-[104px]` : 'h-full'
        )}
      >
        <div ref={contentRef}>
          <Content content={content} />
        </div>
        {isCollapsed && (
          <>
            <div className="absolute bottom-0 w-full">
              <div className="h-2 bg-gradient-to-t from-white" />
              <div className="h-8 bg-white" />
            </div>
            <ShowMoreLessButton
              className="absolute right-0 bottom-0"
              onClick={() => setIsCollapsed(false)}
              isCollapsed={isCollapsed}
            />
          </>
        )}
        {!isCollapsed && (
          <Row className="w-full justify-end">
            <ShowMoreLessButton
              className="flex"
              onClick={() => {
                setIsCollapsed(true)
                window.scrollTo({
                  top: 0,
                  behavior: 'smooth',
                })
              }}
              isCollapsed={isCollapsed}
            />
          </Row>
        )}
      </div>
    )
  }
  return (
    <div ref={contentRef}>
      <Content content={content} />
    </div>
  )
}
