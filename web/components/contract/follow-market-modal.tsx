import { Col } from 'web/components/layout/col'
import { Modal } from 'web/components/layout/modal'
import { EyeIcon } from '@heroicons/react/outline'
import React from 'react'
import clsx from 'clsx'

export const FollowMarketModal = (props: {
  open: boolean
  setOpen: (b: boolean) => void
  title?: string
}) => {
  const { open, setOpen, title } = props
  return (
    <Modal open={open} setOpen={setOpen}>
      <Col className="items-center gap-4 rounded-md bg-white px-8 py-6">
        <EyeIcon className={clsx('h-20 w-20')} aria-hidden="true" />
        <span className="text-xl">{title ? title : 'Watching questions'}</span>
        <Col className={'gap-2'}>
          <span className={'text-indigo-700'}>• What is watching?</span>
          <span className={'ml-2'}>
            You can receive notifications on questions you're interested in by
            clicking the
            <EyeIcon
              className={clsx('ml-1 inline h-6 w-6 align-top')}
              aria-hidden="true"
            />
            ️ button on a question.
          </span>
          <span className={'text-indigo-700'}>
            • What types of notifications will I receive?
          </span>
          <span className={'ml-2'}>
            You'll receive in-app notifications for new comments, answers, and
            updates to the question.
          </span>
        </Col>
      </Col>
    </Modal>
  )
}
