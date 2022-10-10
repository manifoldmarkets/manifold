import clsx from 'clsx'
import dayjs from 'dayjs'
import { useState } from 'react'
import { Contract, MAX_DESCRIPTION_LENGTH } from 'common/contract'
import { exhibitExts } from 'common/util/parse'
import { useAdmin } from 'web/hooks/use-admin'
import { useUser } from 'web/hooks/use-user'
import { updateContract } from 'web/lib/firebase/contracts'
import { Row } from '../layout/row'
import { Content } from '../editor'
import { TextEditor, useTextEditor } from 'web/components/editor'
import { Button } from '../button'
import { Spacer } from '../layout/spacer'
import { Editor, Content as ContentType } from '@tiptap/react'
import { insertContent } from '../editor/utils'
import { ExpandingInput } from '../expanding-input'

export function ContractDescription(props: {
  contract: Contract
  className?: string
}) {
  const { contract, className } = props
  const isAdmin = useAdmin()
  const user = useUser()
  const isCreator = user?.id === contract.creatorId
  return (
    <div className={clsx('mt-2 text-gray-700', className)}>
      {isCreator || isAdmin ? (
        <RichEditContract contract={contract} isAdmin={isAdmin && !isCreator} />
      ) : (
        <Content content={contract.description} />
      )}
    </div>
  )
}

function editTimestamp() {
  return `${dayjs().format('MMM D, h:mma')}: `
}

function RichEditContract(props: { contract: Contract; isAdmin?: boolean }) {
  const { contract, isAdmin } = props
  const [editing, setEditing] = useState(false)
  const [editingQ, setEditingQ] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const { editor, upload } = useTextEditor({
    max: MAX_DESCRIPTION_LENGTH,
    defaultValue: contract.description,
    disabled: isSubmitting,
  })

  async function saveDescription() {
    if (!editor) return
    await updateContract(contract.id, { description: editor.getJSON() })
  }

  return editing ? (
    <>
      <TextEditor editor={editor} upload={upload} />
      <Spacer h={2} />
      <Row className="gap-2">
        <Button
          onClick={async () => {
            setIsSubmitting(true)
            await saveDescription()
            setEditing(false)
            setIsSubmitting(false)
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
      <Content content={contract.description} />
      <Spacer h={2} />
      <Row className="items-center gap-2">
        {isAdmin && 'Admin: '}
        <Button
          color="gray"
          size="xs"
          onClick={() => {
            setEditing(true)
            editor?.commands.focus('end')
            insertContent(editor, `<p>${editTimestamp()}</p>`)
          }}
        >
          Edit description
        </Button>
        <Button color="gray" size="xs" onClick={() => setEditingQ(true)}>
          Edit question
        </Button>
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

  function questionChanged(oldQ: string, newQ: string) {
    return `<p>${editTimestamp()}<s>${oldQ}</s> → ${newQ}</p>`
  }

  function joinContent(oldContent: ContentType, newContent: string) {
    const editor = new Editor({ content: oldContent, extensions: exhibitExts })
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
