import clsx from 'clsx'
import dayjs from 'dayjs'
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
import {
  TextEditor,
  editorExtensions,
  useTextEditor,
} from 'web/components/widgets/editor'
import { Button } from '../buttons/button'
import { Spacer } from '../layout/spacer'
import { Editor, Content as ContentType } from '@tiptap/react'
import { insertContent } from '../editor/utils'
import { ExpandingInput } from '../widgets/expanding-input'
import { CollapsibleContent } from '../widgets/collapsible-content'
import { NumericResolutionPanel } from '../numeric-resolution-panel'
import { ResolutionPanel } from '../resolution-panel'
import { User } from 'common/user'

export function ContractDescriptionAndResolution(props: {
  contract: Contract
  className?: string
}) {
  const { contract, className } = props
  const isAdmin = useAdmin()
  const user = useUser()
  const isCreator = user?.id === contract.creatorId

  return (
    <div className={clsx('text-gray-700', className)}>
      {user && (isCreator || isAdmin) && !contract.isResolved ? (
        <ContractActions
          contract={contract}
          isAdmin={isAdmin && !isCreator}
          user={user}
        />
      ) : (
        <CollapsibleContent
          content={contract.description}
          contractId={contract.id}
        />
      )}
    </div>
  )
}

function editTimestamp() {
  return `${dayjs().format('MMM D, h:mma')}: `
}

function ContractActions(props: {
  contract: Contract
  isAdmin?: boolean
  user: User
}) {
  const { contract, isAdmin, user } = props
  const { outcomeType, closeTime } = contract
  const isClosed = (closeTime ?? 0) < Date.now()
  const isBinaryOrNumeric =
    outcomeType === 'BINARY' || outcomeType === 'PSEUDO_NUMERIC'

  const [showResolver, setShowResolver] = useState(
    isClosed && isBinaryOrNumeric
  )

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        contractId={contract.id}
      />
      <Spacer h={4} />
      <Row className="my-4 items-center gap-2 text-xs">
        {isAdmin && 'Admin '}
        {isBinaryOrNumeric && !isClosed && (
          <Button
            color={'gray'}
            size={'2xs'}
            onClick={() => setShowResolver(!showResolver)}
          >
            Resolve
          </Button>
        )}
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
      </Row>
      <EditQuestion
        contract={contract}
        editing={editingQ}
        setEditing={setEditingQ}
      />
      {showResolver &&
        (outcomeType === 'NUMERIC' || outcomeType === 'PSEUDO_NUMERIC' ? (
          <NumericResolutionPanel
            isAdmin={!!isAdmin}
            creator={user}
            isCreator={!isAdmin}
            contract={contract}
          />
        ) : (
          outcomeType === 'BINARY' && (
            <ResolutionPanel
              isAdmin={!!isAdmin}
              creator={user}
              isCreator={!isAdmin}
              contract={contract}
            />
          )
        ))}
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

  function questionChanged(oldQ: string, newQ: string) {
    return `<p>${editTimestamp()}<s>${oldQ}</s> → ${newQ}</p>`
  }

  function joinContent(oldContent: ContentType, newContent: string) {
    const editor = new Editor({
      content: oldContent,
      extensions: editorExtensions(),
    })
    editor.commands.focus('end')
    insertContent(editor, newContent)
    return editor.getJSON()
  }

  const onSave = async (newText: string) => {
    setEditing(false)
    await updateContract(contract.id, {
      question: newText,
      description: joinContent(
        contract.description,
        questionChanged(contract.question, newText)
      ),
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
