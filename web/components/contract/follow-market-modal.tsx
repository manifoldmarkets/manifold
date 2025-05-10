import { Col } from 'web/components/layout/col'
import { Modal } from 'web/components/layout/modal'
import { BookmarkIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { TRADE_TERM } from 'common/envs/constants'

export const FollowMarketModal = (props: {
  open: boolean
  setOpen: (b: boolean) => void
  title?: string
}) => {
  const { open, setOpen, title } = props
  return (
    <Modal open={open} setOpen={setOpen}>
      <Col className="bg-canvas-0 items-center gap-4 rounded-md px-8 py-6">
        <BookmarkIcon className={clsx('h-20 w-20')} aria-hidden="true" />
        <span className="text-xl">{title ? title : 'Following questions'}</span>
        <Col className={'gap-2'}>
          <span className={'text-primary-700'}>• What is following?</span>
          <span className={'ml-2'}>
            Following a question means you'll receive a notification when it
            moves by more than 10% or resolves. You automatically start
            following a question if you comment on it, {TRADE_TERM} on it, or
            click the follow button.
          </span>
        </Col>
      </Col>
    </Modal>
  )
}
