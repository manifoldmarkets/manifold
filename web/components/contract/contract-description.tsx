import clsx from 'clsx'
import dayjs from 'dayjs'
import { useState } from 'react'
import Textarea from 'react-expanding-textarea'

import { Contract, MAX_DESCRIPTION_LENGTH } from 'common/contract'
import { exhibitExts, parseTags } from 'common/util/parse'
import { useAdmin } from 'web/hooks/use-admin'
import { updateContract } from 'web/lib/firebase/contracts'
import { Row } from '../layout/row'
import { Content } from '../editor'
import { TextEditor, useTextEditor } from 'web/components/editor'
import { Button } from '../button'
import { Spacer } from '../layout/spacer'
import { Editor, Content as ContentType } from '@tiptap/react'

export function ContractDescription(props: {
  contract: Contract
  isCreator: boolean
  className?: string
}) {
  const { contract, isCreator, className } = props
  const isAdmin = useAdmin()
  return (
    <div className={clsx('mt-2 text-gray-700', className)}>
      {isCreator || isAdmin ? (
        <RichEditContract contract={contract} />
      ) : (
        <Content content={contract.description} />
      )}
      {isAdmin && !isCreator && (
        <div className="mt-2 text-red-400">(👆 admin powers)</div>
      )}
    </div>
  )
}

function editTimestamp() {
  return `${dayjs().format('MMM D, h:mma')}: `
}

function RichEditContract(props: { contract: Contract }) {
  const { contract } = props
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

    const tags = parseTags(
      `${editor.getText()} ${contract.tags.map((tag) => `#${tag}`).join(' ')}`
    )
    const lowercaseTags = tags.map((tag) => tag.toLowerCase())

    await updateContract(contract.id, {
      description: editor.getJSON(),
      tags,
      lowercaseTags,
    })
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
      <Row className="gap-2">
        <Button
          color="gray"
          onClick={() => {
            setEditing(true)
            editor
              ?.chain()
              .setContent(contract.description)
              .focus('end')
              .insertContent(`<p>${editTimestamp()}</p>`)
              .run()
          }}
        >
          Edit description
        </Button>
        <Button color="gray" onClick={() => setEditingQ(true)}>
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
    editor.chain().focus('end').insertContent(newContent).run()
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
      <Textarea
        className="textarea textarea-bordered mb-1 h-24 w-full resize-none"
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
