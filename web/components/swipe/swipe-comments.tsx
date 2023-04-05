import { useState } from 'react'
import { ChatIcon } from '@heroicons/react/outline'
import { ChatIcon as ChatIconSolid } from '@heroicons/react/solid'
import clsx from 'clsx'
import { Contract } from 'common/contract'
import { Modal, MODAL_CLASS } from '../layout/modal'
import { Col } from '../layout/col'
import { useComments } from 'web/hooks/use-comments'
import { CommentsTabContent } from '../contract/contract-tabs'
import { ContractComment } from 'common/comment'
import { usePrivateUser } from 'web/hooks/use-user'
import { track, withTracking } from 'web/lib/service/analytics'
import { Tooltip } from '../widgets/tooltip'
import { User } from 'common/user'

export function SwipeComments(props: {
  contract: Contract
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
      className={clsx('text-white active:text-gray-400 disabled:opacity-50')}
      onClick={withTracking(() => setAllOpen(true), 'view swipe comments', {
        contractId: contract.id,
      })}
    >
      <Col>
        <ChatIconSolid className="h-12 w-12" />
        <div className="mx-auto h-5 text-lg">
          {comments.length > 0 && comments.length}
        </div>
      </Col>

      <CommentsDialog
        contract={contract}
        open={open}
        setOpen={setAllOpen}
        comments={comments}
      />
    </button>
  )
}

export function CommentsButton(props: {
  contract: Contract
  user: User | null | undefined
}) {
  const { contract, user } = props

  const [open, setOpen] = useState(false)

  const comments = useComments(contract.id) ?? []

  return (
    <Tooltip text={`Comments`} placement="bottom" className={'z-10'}>
      <button
        disabled={comments.length === 0 && !user}
        className="hover:text-ink-600 text-ink-500 -mr-1 flex items-center gap-1.5 p-1 disabled:opacity-50"
        onClick={() => {
          setOpen(true)
          track('view comments', { contractId: contract.id })
        }}
      >
        <ChatIcon className="h-6 w-6" />
        {comments.length > 0 && (
          <div className="text-ink-500 h-5 align-middle text-sm disabled:opacity-50">
            {comments.length}
          </div>
        )}
        <CommentsDialog
          contract={contract}
          open={open}
          setOpen={setOpen}
          comments={comments}
        />
      </button>
    </Tooltip>
  )
}

function CommentsDialog(props: {
  contract: Contract
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
