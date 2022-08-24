import { Col } from 'web/components/layout/col'
import { Modal } from 'web/components/layout/modal'
import React from 'react'

export const FollowMarketModal = (props: {
  open: boolean
  setOpen: (b: boolean) => void
  title?: string
}) => {
  const { open, setOpen, title } = props
  return (
    <Modal open={open} setOpen={setOpen}>
      <Col className="items-center gap-4 rounded-md bg-white px-8 py-6">
        <span className={'text-8xl'}>❤️</span>
        <span className="text-xl">{title ? title : 'Following questions'}</span>
        <Col className={'gap-2'}>
          <span className={'text-indigo-700'}>• What is following?</span>
          <span className={'ml-2'}>
            You can receive notifications on questions you're interested in by
            clicking the ❤️ button on a question.
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
