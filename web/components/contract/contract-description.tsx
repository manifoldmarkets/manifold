import clsx from 'clsx'
import dayjs from 'dayjs'
import { useState } from 'react'
import Textarea from 'react-expanding-textarea'
import { CATEGORY_LIST } from '../../../common/categories'

import { Contract } from 'common/contract'
import { parseTags, exhibitExts } from 'common/util/parse'
import { useAdmin } from 'web/hooks/use-admin'
import { updateContract } from 'web/lib/firebase/contracts'
import { Row } from '../layout/row'
import { TagsList } from '../tags-list'
import { Content } from '../editor'
import { Editor } from '@tiptap/react'

export function ContractDescription(props: {
  contract: Contract
  isCreator: boolean
  className?: string
}) {
  const { contract, isCreator, className } = props
  const descriptionTimestamp = () => `${dayjs().format('MMM D, h:mma')}: `
  const isAdmin = useAdmin()

  const desc = contract.description ?? ''

  // Append the new description (after a newline)
  async function saveDescription(newText: string) {
    const editor = new Editor({ content: desc, extensions: exhibitExts })
    editor
      .chain()
      .focus('end')
      .insertContent('<br /><br />')
      .insertContent(newText.trim())
      .run()

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

  if (!isCreator) return null

  const { tags } = contract
  const categories = tags.filter((tag) =>
    CATEGORY_LIST.includes(tag.toLowerCase())
  )

  return (
    <div
      className={clsx(
        'mt-2 whitespace-pre-line break-words text-gray-700',
        className
      )}
    >
      <Content content={desc} />

      {categories.length > 0 && (
        <div className="mt-4">
          <TagsList tags={categories} noLabel />
        </div>
      )}

      <br />

      {isCreator && (
        <EditContract
          // Note: Because descriptionTimestamp is called once, later edits use
          // a stale timestamp. Ideally this is a function that gets called when
          // isEditing is set to true.
          text={descriptionTimestamp()}
          onSave={saveDescription}
          buttonText="Add to description"
        />
      )}
      {isAdmin && (
        <EditContract
          text={contract.question}
          onSave={(question) => updateContract(contract.id, { question })}
          buttonText="ADMIN: Edit question"
        />
      )}
      {/* {isAdmin && (
        <EditContract
          text={contract.createdTime.toString()}
          onSave={(time) =>
            updateContract(contract.id, { createdTime: Number(time) })
          }
          buttonText="ADMIN: Edit createdTime"
        />
      )} */}
    </div>
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
    <Row>
      <button
        className="btn btn-neutral btn-outline btn-xs mt-4"
        onClick={() => setEditing(true)}
      >
        {props.buttonText}
      </button>
    </Row>
  )
}
