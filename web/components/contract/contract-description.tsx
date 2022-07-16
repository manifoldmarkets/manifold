import clsx from 'clsx'
import dayjs from 'dayjs'
import { useState } from 'react'
import Textarea from 'react-expanding-textarea'
import { CATEGORY_LIST } from '../../../common/categories'

import { Contract, MAX_DESCRIPTION_LENGTH } from 'common/contract'
import { parseTags } from 'common/util/parse'
import { useAdmin } from 'web/hooks/use-admin'
import { updateContract } from 'web/lib/firebase/contracts'
import { Row } from '../layout/row'
import { TagsList } from '../tags-list'
import { Content } from '../editor'
import { TextEditor, useTextEditor } from 'web/components/editor'
import { Button } from '../button'
import { Spacer } from '../layout/spacer'

export function ContractDescription(props: {
  contract: Contract
  isCreator: boolean
  className?: string
}) {
  const { contract, isCreator, className } = props
  const isAdmin = useAdmin()

  const { tags } = contract
  const categories = tags.filter((tag) =>
    CATEGORY_LIST.includes(tag.toLowerCase())
  )

  return (
    <div className={clsx('mt-2 text-gray-700', className)}>
      {categories.length > 0 && (
        <div className="mt-4">
          <TagsList tags={categories} noLabel />
        </div>
      )}

      {isCreator ? (
        <RichEditContract contract={contract} />
      ) : (
        <Content content={contract.description} />
      )}
      {isAdmin && (
        <EditContract
          text={contract.question}
          onSave={(question) => updateContract(contract.id, { question })}
          buttonText="ADMIN: Edit question"
        />
      )}
    </div>
  )
}

function RichEditContract(props: { contract: Contract }) {
  const { contract } = props
  const [editing, setEditing] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const descriptionTimestamp = () => `${dayjs().format('MMM D, h:mma')}: `

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
      <Button
        color="gray"
        onClick={() => {
          setEditing(true)
          // Add a newline and a timestamp to the bottom of the description
          editor
            ?.chain()
            .setContent(contract.description)
            .focus('end')
            .insertContent('<br />')
            .insertContent(descriptionTimestamp())
            .run()
        }}
      >
        Edit description
      </Button>
    </>
  )
}

function EditContract(props: {
  text: string
  onSave: (newText: string) => void
  buttonText: string
}) {
  const [text, setText] = useState(props.text)
  const [editing, setEditing] = useState(false)
  const onSave = (newText: string) => {
    setEditing(false)
    setText(props.text) // Reset to original text
    props.onSave(newText)
  }

  return editing ? (
    <div className="mt-4">
      <Textarea
        className="textarea textarea-bordered mb-1 h-24 w-full resize-none"
        rows={3}
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
        <button
          className="btn btn-neutral btn-outline btn-sm"
          onClick={() => onSave(text)}
        >
          Save
        </button>
        <button
          className="btn btn-error btn-outline btn-sm"
          onClick={() => setEditing(false)}
        >
          Cancel
        </button>
      </Row>
    </div>
  ) : (
    <Row className="mt-2">
      <Button onClick={() => setEditing(true)}>{props.buttonText}</Button>
    </Row>
  )
}
