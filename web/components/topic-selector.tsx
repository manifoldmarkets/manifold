import { uniq } from 'lodash'
import { cleanTopic, TOPICS_TO_SUBTOPICS } from 'common/topics'
import { Select } from './widgets/select'
import { track } from 'web/lib/service/analytics'
import { useState } from 'react'
import { TopicSelectorDialog } from 'web/components/onboarding/topic-selector-dialog'
export const CUSTOM_TOPIC_KEY = 'user-topics'
export function TopicSelector(props: {
  topic: string | undefined
  onSetTopic: (topic: string) => void
}) {
  const { topic, onSetTopic } = props
  const subtopics = uniq(Object.values(TOPICS_TO_SUBTOPICS).flat())
  const [open, setOpen] = useState(false)

  const selectTopic = (topic: string) => {
    onSetTopic(topic)
    track('select topic', { topic })
  }
  const closeCustomTopics = (open: boolean) => {
    if (open) return
    setOpen(false)
    selectTopic(CUSTOM_TOPIC_KEY)
    onSetTopic(CUSTOM_TOPIC_KEY)
  }

  return (
    <>
      <Select
        className="!border-ink-200"
        value={topic}
        onChange={(e) => {
          const { value } = e.target
          if (value === CUSTOM_TOPIC_KEY) {
            setOpen(true)
          } else {
            selectTopic(value)
          }
        }}
      >
        <option value={CUSTOM_TOPIC_KEY} onClick={() => setOpen(true)}>
          ⚙️ Customize Your Topics
        </option>
        <option value="">🖤 For you</option>
        {subtopics.map((subtopic) => (
          <option key={subtopic} value={cleanTopic(subtopic)}>
            {subtopic}
          </option>
        ))}
      </Select>
      <TopicSelectorDialog setOpen={closeCustomTopics} open={open} />
    </>
  )
}
