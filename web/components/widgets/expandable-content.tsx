import { ArrowsExpandIcon } from '@heroicons/react/solid'
import { JSONContent } from '@tiptap/react'
import clsx from 'clsx'
import { MouseEventHandler, ReactNode, useRef, useState } from 'react'
import { Button } from 'web/components/buttons/button'
import { useSafeLayoutEffect } from 'web/hooks/use-safe-layout-effect'
import { Col } from '../layout/col'
import { Modal } from '../layout/modal'
import { Row } from '../layout/row'
import {
  COLLAPSIBLE_HEIGHT,
  SHOW_COLLAPSE_TRESHOLD,
} from './collapsible-content'
import { Content } from './editor'

export function ExpandButton(props: {
  onClick?: MouseEventHandler<any> | undefined
  className?: string
}) {
  const { onClick, className } = props
  return (
    <Button
      color={'indigo-text-only'}
      className={clsx('z-10 select-none bg-white text-sm', className)}
      onClick={onClick}
      size={'xs'}
    >
      <Row className="items-center gap-0.5">
        Show more
        <ArrowsExpandIcon className="h-4 w-4" />
      </Row>
    </Button>
  )
}

export function ExpandableContent(props: {
  content: JSONContent | string
  modalContent: ReactNode
}) {
  const { content, modalContent } = props
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
  console.log(shouldAllowCollapseOfContent)
  if (shouldAllowCollapseOfContent) {
    return (
      <ExpandsToModalContent content={content} modalContent={modalContent} />
    )
  }
  return (
    <div ref={contentRef}>
      <Content content={content} />
    </div>
  )
}

function ExpandsToModalContent(props: {
  content: JSONContent | string
  modalContent: ReactNode
}) {
  const { content, modalContent } = props
  const [open, setOpen] = useState(false)
  return (
    <>
      <Col className="relative gap-1">
        <div
          style={{ height: COLLAPSIBLE_HEIGHT }}
          className={clsx('relative w-full overflow-hidden')}
        >
          <Content content={content} />
        </div>
        <Row className="w-full justify-end">
          <ExpandButton
            className="bg-transparent"
            onClick={() => {
              setOpen(true)
            }}
          />
        </Row>
      </Col>
      <Modal open={open} setOpen={setOpen} size="lg" className="overflow-auto">
        {modalContent}
      </Modal>
    </>
  )
}
