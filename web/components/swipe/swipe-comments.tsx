import { useState } from 'react'
import { ChatIcon } from '@heroicons/react/outline'
import clsx from 'clsx'

import { BinaryContract } from 'common/contract'
import { Modal, MODAL_CLASS } from '../layout/modal'
import { Col } from '../layout/col'
import { useComments } from 'web/hooks/use-comments'
import { CommentsTabContent } from '../contract/contract-tabs'
import { ContractComment } from 'common/comment'
import { usePrivateUser } from 'web/hooks/use-user'
import { withTracking } from 'web/lib/service/analytics'

export function SwipeComments(props: {
  contract: BinaryContract
  setIsModalOpen: (open: boolean) => void
}) {
  const { contract, setIsModalOpen } = props
  const [open, setOpen] = useState(false)
  const setAllOpen = (open: boolean) => {
    setOpen(open)
    setIsModalOpen(open)
  }

  const comments = useComments(contract.id) ?? []

  return (
    <button
      className={clsx('text-white hover:text-gray-600 disabled:opacity-50')}
      onClick={withTracking(() => setAllOpen(true), 'view swipe comments', {
        contractId: contract.id,
      })}
    >
      <div className="relative">
        <ChatIcon className={clsx('h-12 w-12')} />
        <div
          className={clsx(
            '-mt-2 text-lg',
            'mx-auto h-6 text-white disabled:opacity-50'
          )}
        >
          {comments.length > 0 && comments.length}
        </div>
      </div>

      <CommentsDialog
        contract={contract}
        open={open}
        setOpen={setAllOpen}
        comments={comments}
      />
    </button>
  )
}

function CommentsDialog(props: {
  contract: BinaryContract
  open: boolean
  setOpen: (open: boolean) => void
  comments: ContractComment[]
}) {
  const { contract, open, setOpen, comments } = props

  const privateUser = usePrivateUser()
  const blockedUserIds = privateUser?.blockedUserIds ?? []

  return (
    <Modal
      open={open}
      setOpen={setOpen}
      className={clsx(
        MODAL_CLASS,
        'pointer-events-auto max-h-[32rem] overflow-auto'
      )}
    >
      <Col>
        <CommentsTabContent
          contract={contract}
          comments={comments}
          blockedUserIds={blockedUserIds}
        />
      </Col>
    </Modal>
  )
}
