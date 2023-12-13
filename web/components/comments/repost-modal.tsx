import { Contract } from 'common/contract'
import { Modal } from 'web/components/layout/modal'
import { Col } from 'web/components/layout/col'
import { ContractCommentInput } from 'web/components/feed/feed-comments'
import { useState } from 'react'
import { Button } from 'web/components/buttons/button'
import clsx from 'clsx'
import { BiRepost } from 'react-icons/bi'
import { Tooltip } from 'web/components/widgets/tooltip'

export const RepostButton = (props: {
  contract: Contract
  className?: string
}) => {
  const { contract, className } = props
  const [open, setOpen] = useState(false)
  return (
    <>
      <Tooltip
        text="Repost question with comment to followers"
        placement="bottom"
        noTap
      >
        <Button
          color={'gray-white'}
          size={'xs'}
          className={clsx(
            'text-ink-500 disabled:cursor-not-allowed',
            'disabled:text-ink-500',
            className
          )}
          onClick={() => setOpen(true)}
        >
          <BiRepost className=" h-6 w-6" />
        </Button>
      </Tooltip>
      <RepostModal contract={contract} open={open} setOpen={setOpen} />
    </>
  )
}

export const RepostModal = (props: {
  contract: Contract
  open: boolean
  setOpen: (open: boolean) => void
}) => {
  const { contract, open, setOpen } = props

  return (
    <Modal
      open={open}
      setOpen={setOpen}
      className={'bg-canvas-0 text-ink-1000 gap-4 rounded-md px-4 pb-4 sm:px-6'}
    >
      <Col className={'w-full'}>
        <span className={'text-primary-700 mb-4 pt-3 text-lg'}>
          Repost question & comment to your followers
        </span>
        <ContractCommentInput
          contract={contract}
          trackingLocation={'contract page'}
          commentTypes={['repost']}
          onClearInput={() => setOpen(false)}
        />
      </Col>
    </Modal>
  )
}
