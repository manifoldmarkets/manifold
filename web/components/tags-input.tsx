import clsx from 'clsx'
import { useState } from 'react'
import { parseWordsAsTags } from 'common/util/parse'
import { Contract, updateContract } from 'web/lib/firebase/contracts'
import { Col } from './layout/col'
import { Row } from './layout/row'
import { TagsList } from './tags-list'
import { MAX_TAG_LENGTH } from 'common/contract'

export function TagsInput(props: { contract: Contract; className?: string }) {
  const { contract, className } = props
  const { tags } = contract

  const [tagText, setTagText] = useState('')
  const newTags = parseWordsAsTags(`${tags.join(' ')} ${tagText}`)

  const [isSubmitting, setIsSubmitting] = useState(false)

  const updateTags = async () => {
    setIsSubmitting(true)
    await updateContract(contract.id, {
      tags: newTags,
      lowercaseTags: newTags.map((tag) => tag.toLowerCase()),
    })
    setIsSubmitting(false)
    setTagText('')
  }

  return (
    <Col className={clsx('gap-4', className)}>
      <TagsList tags={newTags} noLabel />

      <Row className="items-center gap-4">
        <input
          style={{ maxWidth: 150 }}
          placeholder="Type a tag..."
          className="input input-sm input-bordered resize-none"
          disabled={isSubmitting}
          value={tagText}
          maxLength={MAX_TAG_LENGTH}
          onChange={(e) => setTagText(e.target.value || '')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              updateTags()
            }
          }}
        />
        <button className="btn btn-xs btn-outline" onClick={updateTags}>
          Save tags
        </button>
      </Row>
    </Col>
  )
}

export function RevealableTagsInput(props: {
  contract: Contract
  className?: string
}) {
  const { contract, className } = props
  const [hidden, setHidden] = useState(true)

  if (hidden)
    return (
      <div
        className={clsx(
          'cursor-pointer text-gray-500 hover:underline hover:decoration-indigo-400 dark:hover:decoration-indigo-600 hover:decoration-2',
          className
        )}
        onClick={() => setHidden((hidden) => !hidden)}
      >
        Show tags
      </div>
    )
  return <TagsInput className={clsx('pt-2', className)} contract={contract} />
}
