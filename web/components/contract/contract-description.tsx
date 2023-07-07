import clsx from 'clsx'
import { useState } from 'react'

import { Contract, MAX_DESCRIPTION_LENGTH } from 'common/contract'
import { useAdmin } from 'web/hooks/use-admin'
import { useUser } from 'web/hooks/use-user'
import { updateContract } from 'web/lib/firebase/contracts'
import { Row } from '../layout/row'
import { TextEditor, useTextEditor } from 'web/components/widgets/editor'
import { Button } from '../buttons/button'
import { Spacer } from '../layout/spacer'
import { CollapsibleContent } from '../widgets/collapsible-content'
import { isTrustworthy } from 'common/envs/constants'
import { ContractEditHistoryButton } from 'web/components/contract/contract-edit-history-button'
import { PencilIcon } from '@heroicons/react/solid'

export function ContractDescription(props: {
  contract: Contract
  highlightResolver?: boolean
  toggleResolver?: () => void
  className?: string
  showEditHistory?: boolean
  defaultCollapse?: boolean
}) {
  const {
    contract,
    className,
    defaultCollapse,
    highlightResolver,
    toggleResolver,
    showEditHistory,
  } = props
  const { creatorId, closeTime } = contract

  const isAdmin = useAdmin()
  const user = useUser()
  const isCreator = user?.id === creatorId
  const isClosed = !!(closeTime && closeTime < Date.now())
  const trustworthy = isTrustworthy(user?.username) && isClosed

  const showContractActions =
    user &&
    (isCreator || isAdmin || trustworthy) &&
    !contract.isResolved &&
    toggleResolver

  return (
    <div className={clsx('text-ink-700', className)}>
      {showContractActions ? (
        <ContractActions
          contract={contract}
          isOnlyAdmin={isAdmin && !isCreator}
          isOnlyTrustworthy={trustworthy && !isCreator}
          highlightResolver={highlightResolver}
          toggleResolver={toggleResolver}
        />
      ) : (
        <>
          <CollapsibleContent
            content={contract.description}
            stateKey={`isCollapsed-contract-${contract.id}`}
            defaultCollapse={defaultCollapse}
            hideButton={!user}
          />
          {showEditHistory && !!user && (
            <ContractEditHistoryButton contract={contract} />
          )}
        </>
      )}
    </div>
  )
}

function ContractActions(props: {
  contract: Contract
  isOnlyAdmin?: boolean
  isOnlyTrustworthy?: boolean
  highlightResolver?: boolean
  toggleResolver: () => void
}) {
  const {
    contract,
    isOnlyAdmin,
    isOnlyTrustworthy,
    highlightResolver,
    toggleResolver,
  } = props
  const [editing, setEditing] = useState(false)

  const editor = useTextEditor({
    max: MAX_DESCRIPTION_LENGTH,
    defaultValue: contract.description,
  })

  async function saveDescription() {
    if (!editor) return
    await updateContract(contract.id, { description: editor.getJSON() })
  }

  return editing ? (
    <>
      <TextEditor editor={editor} />
      <Spacer h={2} />
      <Row className="gap-2">
        <Button
          onClick={async () => {
            await saveDescription()
            setEditing(false)
          }}
        >
          Save
        </Button>
        <Button color="gray" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </Row>
    </>
  ) : (
    <>
      <CollapsibleContent
        content={contract.description}
        stateKey={`isCollapsed-contract-${contract.id}`}
      >
        {!isOnlyTrustworthy && (
          <Button
            color="gray-white"
            size="xs"
            onClick={() => {
              setEditing(true)
              editor?.commands.focus('end')
            }}
          >
            Edit description <PencilIcon className="ml-1 inline h-4 w-4" />
          </Button>
        )}
      </CollapsibleContent>
      <Row className="items-center gap-2 text-xs">
        {isOnlyAdmin && 'Admin '}
        {contract.outcomeType !== 'STONK' && contract.mechanism !== 'none' && (
          <Button
            color={highlightResolver ? 'red' : 'gray'}
            size="2xs"
            className="relative my-4"
            onClick={toggleResolver}
          >
            Resolve
          </Button>
        )}
        <ContractEditHistoryButton contract={contract} className="my-4" />
      </Row>
    </>
  )
}
