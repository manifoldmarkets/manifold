import { CheckIcon, XIcon, PencilIcon } from '@heroicons/react/solid'
import { Contract, MAX_QUESTION_LENGTH } from 'common/contract'
import { useState } from 'react'
import { updateContract } from 'web/lib/firebase/contracts'
import { IconButton } from '../buttons/button'
import { ExpandingInput } from '../widgets/expanding-input'
import { Linkify } from '../widgets/linkify'
import { VisibilityIcon } from './contracts-table'

export const TitleOrEdit = (props: {
  contract: Contract
  canEdit?: boolean
}) => {
  const { contract, canEdit } = props

  const [isEditing, setEditing] = useState(false)
  const [text, setText] = useState(props.contract.question)

  const edit = () => {
    setEditing(true)
    setText(contract.question)
  }

  const onSave = async (newText: string) => {
    setEditing(false)
    await updateContract(contract.id, {
      question: newText,
    })
  }

  return isEditing ? (
    <div className="flex items-center gap-2">
      <ExpandingInput
        className="grow"
        rows={1}
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
      <IconButton onClick={() => onSave(text)} size="xs">
        <CheckIcon className="h-4 w-4 text-teal-600" />
      </IconButton>
      <IconButton onClick={() => setEditing(false)} size="xs">
        <XIcon className="h-4 w-4 text-red-400" />
      </IconButton>
    </div>
  ) : (
    <span className="text-xl font-medium sm:text-2xl">
      <Linkify className="" text={contract.question} />
      {canEdit && (
        <button onClick={edit} className="ml-1 p-1">
          <PencilIcon className=" text-ink-500 hover:text-ink-600 h-4 w-4" />
        </button>
      )}
    </span>
  )
}
