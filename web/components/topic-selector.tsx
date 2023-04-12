import { uniq } from 'lodash'
import { cleanTopic, TOPICS_TO_SUBTOPICS } from 'common/topics'
import { Select } from './widgets/select'

export function TopicSelector(props: {
  topic: string | undefined
  onSetTopic: (topic: string) => void
}) {
  const { topic, onSetTopic } = props
  const subtopics = uniq(Object.values(TOPICS_TO_SUBTOPICS).flat())

  return (
    <Select
      className="!border-ink-200"
      value={topic}
      onChange={(e) => onSetTopic(e.target.value)}
    >
      <option value="">🖤 For you</option>
      {subtopics.map((subtopic) => (
        <option key={subtopic} value={cleanTopic(subtopic)}>
          {subtopic}
        </option>
      ))}
    </Select>
  )
}
