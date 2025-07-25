import { ChatIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import { Contract } from 'common/contract'
import { User } from 'common/user'
import { useState } from 'react'
import { Button } from 'web/components/buttons/button'
import { CommentsTabContent } from 'web/components/contract/comments-tab-content'
import {
  useCommentsOnContract,
  useNumContractComments,
} from 'web/hooks/use-comments'
import { usePrivateUser } from 'web/hooks/use-user'
import { track } from 'web/lib/service/analytics'
import { Col } from '../layout/col'
import { Modal, SCROLLABLE_MODAL_CLASS } from '../layout/modal'
import { Row } from '../layout/row'
import { Tooltip } from '../widgets/tooltip'

export function CommentsButton(props: {
  contract: Contract
  user: User | null | undefined
  className?: string
  highlightCommentId?: string
}) {
  const { contract, highlightCommentId, user, className } = props

  const [open, setOpen] = useState(false)
  const totalComments = useNumContractComments(contract.id)

  return (
    <Button
      color={'gray-white'}
      size={'2xs'}
      disabled={totalComments === 0 && !user}
      className={clsx(className)}
      onClick={(e) => {
        e.stopPropagation()
        e.preventDefault()
        setOpen(true)
        track('click feed card comments button', { contractId: contract.id })
      }}
    >
      <Tooltip text={`Comments`} placement="top" noTap>
        <Row className={'items-center gap-1.5'}>
          <ChatIcon className="stroke-ink-500 h-6 w-6" />
          {totalComments > 0 && (
            <div className=" h-5 align-middle text-sm disabled:opacity-50">
              {totalComments}
            </div>
          )}
          {open && (
            <CommentsDialog
              highlightCommentId={highlightCommentId}
              contract={contract}
              open={open}
              setOpen={setOpen}
              totalComments={totalComments}
            />
          )}
        </Row>
      </Tooltip>
    </Button>
  )
}

function CommentsDialog(props: {
  contract: Contract
  open: boolean
  setOpen: (open: boolean) => void
  highlightCommentId?: string
  totalComments: number
}) {
  const { contract, highlightCommentId, open, setOpen, totalComments } = props
  const comments = useCommentsOnContract(contract.id) ?? []

  const privateUser = usePrivateUser()
  const blockedUserIds = privateUser?.blockedUserIds ?? []

  return (
    <Modal
      open={open}
      setOpen={setOpen}
      className={'bg-canvas-0 w-full rounded-lg pl-2 pr-4 pt-4'}
      size={'lg'}
    >
      <div className="mb-2 ml-2">
        Comments on <span className="font-bold">{contract.question}</span>
      </div>
      <Col className={clsx(SCROLLABLE_MODAL_CLASS, 'scrollbar-hide')}>
        <CommentsTabContent
          // TODO: fix
          staticContract={contract}
          liveContract={contract}
          comments={comments}
          blockedUserIds={blockedUserIds}
          highlightCommentId={highlightCommentId}
          pinnedComments={[]}
          totalComments={totalComments}
        />
      </Col>
    </Modal>
  )
}
