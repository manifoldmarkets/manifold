import clsx from 'clsx'
import { ReactNode, useState } from 'react'

import { Contract, MAX_DESCRIPTION_LENGTH } from 'common/contract'
import { useAdmin } from 'web/hooks/use-admin'
import { useUser } from 'web/hooks/use-user'
import { updateContract } from 'web/lib/firebase/contracts'
import { Row } from '../layout/row'
import { TextEditor, useTextEditor } from 'web/components/widgets/editor'
import { Button, ColorType } from '../buttons/button'
import { Spacer } from '../layout/spacer'
import { CollapsibleContent } from '../widgets/collapsible-content'
import { isTrustworthy } from 'common/envs/constants'
import { ContractEditHistoryButton } from 'web/components/contract/contract-edit-history-button'
import { PencilIcon, PlusIcon } from '@heroicons/react/solid'
import { Editor } from '@tiptap/core'
import { CreateAnswerCpmmPanel } from '../answers/create-answer-panel'

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
            <div className="flex w-full justify-end">
              <ContractEditHistoryButton contract={contract} className="mt-1" />
            </div>
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
  const [editingAnswer, setEditingAnswer] = useState(false)

  const editor = useTextEditor({
    max: MAX_DESCRIPTION_LENGTH,
    defaultValue: contract.description,
  })

  const emptyDescription = editor?.isEmpty

  async function saveDescription() {
    if (!editor) return
    await updateContract(contract.id, { description: editor.getJSON() })
  }

  if (editingAnswer && contract.mechanism === 'cpmm-multi-1') {
    return (
      <CreateAnswerCpmmPanel
        contract={contract}
        onFinish={() => {
          setEditingAnswer(false)
        }}
      />
    )
  }

  return editing ? (
    <>
      <TextEditor editor={editor} />
      <Spacer h={2} />
      <Row className="w-full justify-end gap-2">
        <Button color="gray" onClick={() => setEditing(false)}>
          Cancel
        </Button>
        <Button
          onClick={async () => {
            await saveDescription()
            setEditing(false)
          }}
        >
          Save
        </Button>
      </Row>
      <Spacer h={2} />
    </>
  ) : (
    <>
      {!emptyDescription && (
        <CollapsibleContent
          content={contract.description}
          stateKey={`isCollapsed-contract-${contract.id}`}
        />
      )}
      <Row className="mt-2 flex-wrap items-center justify-end gap-2 text-xs">
        {isOnlyAdmin && 'Admin '}
        {!isOnlyTrustworthy &&
          contract.mechanism === 'cpmm-multi-1' &&
          contract.addAnswersMode === 'ONLY_CREATOR' && (
            <AddAnswerButton
              setEditing={setEditingAnswer}
              buttonColor={'gray'}
            />
          )}
        <ContractEditHistoryButton contract={contract} />
        {!isOnlyTrustworthy && (
          <EditDescriptionButton
            setEditing={setEditing}
            editor={editor}
            text={emptyDescription ? 'Add description' : 'Edit description'}
            icon={
              emptyDescription ? (
                <PlusIcon className="mr-1 inline h-4 w-4" />
              ) : (
                <PencilIcon className="mr-1 inline h-4 w-4" />
              )
            }
            buttonColor={'gray'}
          />
        )}
        <ContractEditHistoryButton contract={contract} className="my-2" />
        {contract.outcomeType !== 'STONK' && contract.mechanism !== 'none' && (
          <Button
            color={highlightResolver ? 'red' : 'gray'}
            size="2xs"
            onClick={toggleResolver}
          >
            Resolve
          </Button>
        )}
      </Row>
    </>
  )
}

function EditDescriptionButton(props: {
  setEditing: (editing: boolean) => void
  editor: Editor | null
  text: string
  icon: ReactNode
  buttonColor?: ColorType
}) {
  const { setEditing, editor, text, icon, buttonColor } = props
  return (
    <Button
      color={buttonColor ?? 'gray-white'}
      size="2xs"
      onClick={() => {
        setEditing(true)
        editor?.commands.focus('end')
      }}
    >
      {icon} {text}
    </Button>
  )
}

function AddAnswerButton(props: {
  setEditing: (editing: boolean) => void
  buttonColor?: ColorType
}) {
  const { buttonColor, setEditing } = props

  return (
    <Button
      color={buttonColor ?? 'gray-white'}
      size="2xs"
      onClick={() => {
        setEditing(true)
      }}
    >
      <PlusIcon className="mr-1 inline h-4 w-4" /> Add answer
    </Button>
  )
}
