import { sortBy, uniq } from 'lodash'
import { cleanTopic, TOPICS_TO_SUBTOPICS } from 'common/topics'
import { Select } from './widgets/select'
import { track } from 'web/lib/service/analytics'

export function TopicSelector(props: {
  topic: string | undefined
  onSetTopic: (topic: string) => void
}) {
  const { topic, onSetTopic } = props
  const uniqueTopics = uniq(Object.values(TOPICS_TO_SUBTOPICS).flat())
  const topics = sortBy(uniqueTopics, (topic) =>
    cleanTopic(topic).toLowerCase()
  )

  const selectTopic = (topic: string) => {
    onSetTopic(topic)
    track('select topic', { topic })
  }

  return (
    <Select
      className="!border-ink-200"
      value={topic}
      onChange={(e) => selectTopic(e.target.value)}
    >
      <option value="">🖤 For you</option>
      {topics.map((subtopic) => (
        <option key={subtopic} value={cleanTopic(subtopic)}>
          {subtopic}
        </option>
      ))}
    </Select>
  )
}
