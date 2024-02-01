import { useState } from 'react'
import { ChatIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import { Contract } from 'common/contract'
import { usePrivateUser } from 'web/hooks/use-user'
import { track } from 'web/lib/service/analytics'
import { User } from 'common/user'
import {
  useCommentsOnContract,
  useNumContractComments,
} from 'web/hooks/use-comments-supabase'
import { Tooltip } from 'web/components/widgets/tooltip'
import {
  MODAL_CLASS,
  Modal,
  SCROLLABLE_MODAL_CLASS,
} from 'web/components/layout/modal'
import { Col } from 'web/components/layout/col'
import { CommentsTabContent } from 'web/components/contract/contract-tabs'
import Link from 'next/link'
import { contractPath } from 'common/contract'
import { linkClass } from 'web/components/widgets/site-link'

export function CommentsButton(props: {
  contract: Contract
  user: User | null | undefined
  className?: string
  modalHeader?: React.ReactNode
}) {
  const { contract, user, className, modalHeader } = props

  const [open, setOpen] = useState(false)
  const totalComments = useNumContractComments(contract.id)

  return (
    <Tooltip text={`Comments`} placement="top" noTap>
      <button
        disabled={totalComments === 0 && !user}
        className={clsx(
          'hover:text-ink-600 text-ink-500 flex h-full items-center gap-1.5 disabled:opacity-50',
          className
        )}
        onClick={(e) => {
          e.stopPropagation()
          e.preventDefault()
          setOpen(true)
          track('click feed card comments button', { contractId: contract.id })
        }}
      >
        <ChatIcon className="h-6 w-6" />
        {totalComments > 0 && (
          <div className="text-ink-500 h-5 align-middle text-sm disabled:opacity-50">
            {totalComments}
          </div>
        )}
        {open && (
          <CommentsDialog
            contract={contract}
            open={open}
            setOpen={setOpen}
            modalHeader={modalHeader}
          />
        )}
      </button>
    </Tooltip>
  )
}

function CommentsDialog(props: {
  contract: Contract
  open: boolean
  setOpen: (open: boolean) => void
  modalHeader: React.ReactNode
}) {
  const { contract, open, setOpen, modalHeader } = props
  const comments = useCommentsOnContract(contract.id) ?? []

  const privateUser = usePrivateUser()
  const blockedUserIds = privateUser?.blockedUserIds ?? []

  return (
    <Modal open={open} setOpen={setOpen}>
      <Col className={MODAL_CLASS}>
        {modalHeader}
        <span>
          <span className="text-ink-600">Comments on </span>
          <span className={clsx('text-primary-600', linkClass)}>
            <Link href={contractPath(contract)}>{contract.question}</Link>
          </span>
        </span>
        <Col className={clsx(SCROLLABLE_MODAL_CLASS, 'scrollbar-hide w-full')}>
          <CommentsTabContent
            contract={contract}
            comments={comments}
            blockedUserIds={blockedUserIds}
            pinnedComments={[]}
          />
        </Col>
      </Col>
    </Modal>
  )
}
