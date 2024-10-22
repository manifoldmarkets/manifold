import { useState } from 'react'
import { Contract, MAX_DESCRIPTION_LENGTH } from 'common/contract'
import { useAdmin } from 'web/hooks/use-admin'
import { useUser } from 'web/hooks/use-user'
import { Row } from '../layout/row'
import { TextEditor, useTextEditor } from 'web/components/widgets/editor'
import { Button } from '../buttons/button'
import { CollapsibleContent } from '../widgets/collapsible-content'
import { PencilIcon, PlusIcon } from '@heroicons/react/solid'
import { JSONContent } from '@tiptap/core'
import { updateMarket } from 'web/lib/api/api'
import { toast } from 'react-hot-toast'
import { LogoIcon } from '../icons/logo-icon'
import { SweepVerifySection } from '../sweeps/sweep-verify-section'
import clsx from 'clsx'

export function ContractDescription(props: {
  contract: Contract
  description: string | JSONContent
}) {
  const { contract, description } = props

  const isAdmin = useAdmin()
  const user = useUser()
  const isCreator = user?.id === contract.creatorId

  return (
    <>
      <div className="mt-6">
        {contract.token === 'CASH' && !user?.sweepstakesVerified && (
          <SweepVerifySection className="mb-4" />
        )}
        {isCreator || isAdmin ? (
          <EditableDescription contract={contract} description={description} />
        ) : (
          <CollapsibleContent
            content={description}
            stateKey={`isCollapsed-contract-${contract.id}`}
            hideCollapse={!user}
          />
        )}

        <div
          className={clsx(
            contract.token !== 'CASH' && 'invisible',
            'text-ink-600 bg-canvas-50 flex items-center justify-center space-x-2 rounded-md px-4 py-2 italic'
          )}
        >
          <LogoIcon className="h-5 w-5 text-indigo-600" />
          <span>This question is managed and resolved by Manifold.</span>
          <LogoIcon className="h-5 w-5 text-indigo-600" />
        </div>
      </div>
    </>
  )
}

function EditableDescription(props: {
  contract: Contract
  description: string | JSONContent
}) {
  const { contract, description } = props
  const [editing, setEditing] = useState(false)

  const editor = useTextEditor({
    max: MAX_DESCRIPTION_LENGTH,
    defaultValue: description,
  })

  const isDescriptionEmpty = JSONEmpty(description)
  const [saving, setSaving] = useState(false)

  async function saveDescription() {
    if (!editor) return
    setSaving(true)
    await updateMarket({
      contractId: contract.id,
      descriptionJson: JSON.stringify(editor.getJSON()),
    })
      .catch((e) => {
        console.error(e)
        toast.error('Failed to save description. Try again?')
      })
      .finally(() => setSaving(false))
  }

  return editing ? (
    <>
      <TextEditor editor={editor} />
      <Row className="my-2 justify-end gap-2">
        <Button color="gray" onClick={() => setEditing(false)}>
          Cancel
        </Button>
        <Button
          onClick={async () => {
            await saveDescription()
            setEditing(false)
          }}
          loading={saving}
          disabled={saving}
        >
          Save
        </Button>
      </Row>
    </>
  ) : (
    <>
      {!isDescriptionEmpty && (
        <CollapsibleContent
          content={description}
          stateKey={`isCollapsed-contract-${contract.id}`}
        />
      )}
      <Row className="justify-end">
        <Button
          color="gray-white"
          size="2xs"
          onClick={() => {
            setEditing(true)
            editor?.commands.focus('end')
          }}
        >
          {isDescriptionEmpty ? (
            <>
              <PlusIcon className="mr-1 inline h-4 w-4" /> Add description
            </>
          ) : (
            <>
              <PencilIcon className="mr-1 inline h-4 w-4" /> Edit description
            </>
          )}
        </Button>
      </Row>
    </>
  )
}

export function JSONEmpty(text: string | JSONContent) {
  if (!text) return true
  if (typeof text === 'string') {
    return text.trim() === ''
  } else if ('content' in text) {
    return !(
      text.content &&
      text.content.length > 0 &&
      (text.content[0].content || text.content[0].attrs)
    )
  }
  return true
}
