import { useState } from 'react'
import { parseWordsAsTags } from '../../common/util/parse'
import { Contract, updateContract } from '../lib/firebase/contracts'
import { Row } from './layout/row'
import { TagsList } from './tags-list'

export function TagsInput(props: { contract: Contract }) {
  const { contract } = props
  const { tags } = contract

  const [tagText, setTagText] = useState('')
  const newTags = parseWordsAsTags(`${tags.join(' ')} ${tagText}`)

  const [isSubmitting, setIsSubmitting] = useState(false)

  const updateTags = () => {
    setIsSubmitting(true)
    updateContract(contract.id, {
      tags: newTags,
      lowercaseTags: newTags.map((tag) => tag.toLowerCase()),
    })
    setIsSubmitting(false)
    setTagText('')
  }

  return (
    <Row className="flex-wrap gap-4">
      <TagsList tags={newTags.map((tag) => `#${tag}`)} />

      <Row className="items-center gap-4">
        <input
          style={{ maxWidth: 150 }}
          placeholder="Type a tag..."
          className="input input-sm input-bordered resize-none"
          disabled={isSubmitting}
          value={tagText}
          onChange={(e) => setTagText(e.target.value || '')}
        />
        <button className="btn btn-xs btn-outline" onClick={updateTags}>
          Save tags
        </button>
      </Row>
    </Row>
  )
}
