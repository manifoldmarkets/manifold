import { DocumentTextIcon } from '@heroicons/react/outline'
import { JSONContent } from '@tiptap/react'
import clsx from 'clsx'
import { MouseEventHandler, ReactNode, useRef, useState } from 'react'
import { Button } from 'web/components/buttons/button'
import { useSafeLayoutEffect } from 'web/hooks/use-safe-layout-effect'
import { Col } from '../layout/col'
import { Modal } from '../layout/modal'
import { Row } from '../layout/row'
import { SHOW_COLLAPSE_TRESHOLD } from './collapsible-content'
import { Content } from './editor'

export function ExpandButton(props: {
  onClick?: MouseEventHandler<any> | undefined
  className?: string
  whatToRead?: string
}) {
  const { onClick, className, whatToRead } = props
  return (
    <Button
      color="override"
      className={clsx(
        'text-primary-500 hover:text-primary-700 z-10 select-none bg-inherit text-sm shadow-none',
        className
      )}
      onClick={onClick}
      size={'xs'}
    >
      <Row className="items-center gap-1">
        <DocumentTextIcon className="h-4 w-4" />
        Read more{whatToRead ? ` ${whatToRead}` : ''}
      </Row>
    </Button>
  )
}

export function ExpandableContent(props: {
  content: JSONContent | string
  modalContent: ReactNode
  whatToRead?: string
  className?: string
}) {
  const { content, modalContent, whatToRead, className } = props
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
      <div className={className}>
        <ExpandsToModalContent
          content={content}
          modalContent={modalContent}
          whatToRead={whatToRead}
        />
      </div>
    )
  }
  return (
    <div ref={contentRef} className={className}>
      <Content content={content} />
    </div>
  )
}

function ExpandsToModalContent(props: {
  content: JSONContent | string
  modalContent: ReactNode
  whatToRead?: string
}) {
  const { content, modalContent, whatToRead } = props
  const [open, setOpen] = useState(false)
  return (
    <>
      <Col className="relative gap-1">
        <div className={clsx('line-clamp-2 relative w-full overflow-hidden')}>
          <Content content={content} />
        </div>
        <Row className="w-full justify-end">
          <ExpandButton
            className="bg-transparent"
            onClick={() => {
              setOpen(true)
            }}
            whatToRead={whatToRead}
          />
        </Row>
      </Col>
      <Modal open={open} setOpen={setOpen} size="lg">
        {modalContent}
      </Modal>
    </>
  )
}
