import { uniq } from 'lodash'
import { cleanTopic, TOPICS_TO_SUBTOPICS } from 'common/topics'
import { Select } from './widgets/select'
import { track } from 'web/lib/service/analytics'
export const CUSTOM_TOPIC_KEY = 'user-topics'
export function TopicSelector(props: {
  topic: string | undefined
  onSetTopic: (topic: string) => void
}) {
  const { topic, onSetTopic } = props
  const subtopics = ['Any topic'].concat(
    uniq(Object.values(TOPICS_TO_SUBTOPICS).flat())
  )
  const selectTopic = (topic: string) => {
    onSetTopic(topic)
    track('select topic', { topic })
  }

  return (
    <Select
      className="!border-ink-200 text-ellipsis sm:max-w-[175px] "
      value={topic}
      onChange={(e) => {
        const { value } = e.target
        if (value === 'Any topic') return selectTopic('')
        selectTopic(value)
      }}
    >
      {subtopics.map((subtopic) => (
        <option key={'dropdown-' + subtopic} value={cleanTopic(subtopic)}>
          {subtopic}
        </option>
      ))}
    </Select>
  )
}
