import clsx from 'clsx'
import { useEffect, useState } from 'react'

import {
  Contract,
  MAX_DESCRIPTION_LENGTH,
  MAX_QUESTION_LENGTH,
} from 'common/contract'
import { useAdmin } from 'web/hooks/use-admin'
import { useUser } from 'web/hooks/use-user'
import { updateContract } from 'web/lib/firebase/contracts'
import { Row } from '../layout/row'
import { TextEditor, useTextEditor } from 'web/components/widgets/editor'
import { Button } from '../buttons/button'
import { Spacer } from '../layout/spacer'
import { ExpandingInput } from '../widgets/expanding-input'
import { CollapsibleContent } from '../widgets/collapsible-content'
import { isTrustworthy } from 'common/envs/constants'
import { ContractEditHistoryButton } from 'web/components/contract/contract-edit-history-button'

export function ContractDescription(props: {
  contract: Contract
  toggleResolver?: () => void
  className?: string
  showEditHistory?: boolean
  defaultCollapse?: boolean
}) {
  const {
    contract,
    className,
    defaultCollapse,
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
          toggleResolver={toggleResolver}
        />
      ) : (
        <>
          <CollapsibleContent
            content={contract.description}
            stateKey={`isCollapsed-contract-${contract.id}`}
            defaultCollapse={defaultCollapse}
          />
          {showEditHistory && <ContractEditHistoryButton contract={contract} />}
        </>
      )}
    </div>
  )
}

function ContractActions(props: {
  contract: Contract
  isOnlyAdmin?: boolean
  isOnlyTrustworthy?: boolean
  toggleResolver: () => void
}) {
  const { contract, isOnlyAdmin, isOnlyTrustworthy, toggleResolver } = props
  const [editing, setEditing] = useState(false)
  const [editingQ, setEditingQ] = useState(false)

  const editor = useTextEditor({
    max: MAX_DESCRIPTION_LENGTH,
    defaultValue: contract.description,
  })

  async function saveDescription() {
    if (!editor) return
    await updateContract(contract.id, { description: editor.getJSON() })
  }

  useEffect(() => {
    if (!editing) editor?.commands?.setContent(contract.description)
  }, [editing, contract.description])

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
      />
      <Row className="my-4 items-center gap-2 text-xs">
        {isOnlyAdmin && 'Admin '}
        {contract.outcomeType !== 'STONK' && (
          <Button color={'gray'} size={'2xs'} onClick={toggleResolver}>
            Resolve
          </Button>
        )}
        {!isOnlyTrustworthy && (
          <>
            <Button
              color="gray"
              size="2xs"
              onClick={() => {
                setEditing(true)
                editor?.commands.focus('end')
              }}
            >
              Edit description
            </Button>
            <Button color="gray" size="2xs" onClick={() => setEditingQ(true)}>
              Edit question
            </Button>
          </>
        )}
        <ContractEditHistoryButton contract={contract} />
      </Row>
      <EditQuestion
        contract={contract}
        editing={editingQ}
        setEditing={setEditingQ}
      />
    </>
  )
}

function EditQuestion(props: {
  contract: Contract
  editing: boolean
  setEditing: (editing: boolean) => void
}) {
  const { contract, editing, setEditing } = props
  const [text, setText] = useState(contract.question)

  const onSave = async (newText: string) => {
    setEditing(false)
    await updateContract(contract.id, {
      question: newText,
    })
  }

  return editing ? (
    <div className="mt-4">
      <ExpandingInput
        className="mb-1 h-24 w-full"
        rows={2}
        maxLength={MAX_QUESTION_LENGTH}
        value={text}
        onChange={(e) => setText(e.target.value || '')}
        autoFocus
        onFocus={(e) =>
          // Focus starts at end of text.
          e.target.setSelectionRange(text.length, text.length)
        }
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            onSave(text)
          }
        }}
      />
      <Row className="gap-2">
        <Button onClick={() => onSave(text)}>Save</Button>
        <Button color="gray" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </Row>
    </div>
  ) : null
}
