import { uniq } from 'lodash'
import {
  cleanTopic,
  getEmojiFromTopic,
  TOPICS_TO_SUBTOPICS,
} from 'common/topics'
import { Select } from './widgets/select'
import { track } from 'web/lib/service/analytics'
import { useEffect, useState } from 'react'
import { TopicSelectorDialog } from 'web/components/onboarding/topic-selector-dialog'
import { getUserInterestTopics } from 'web/lib/supabase/user'
import { useUser } from 'web/hooks/use-user'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
export const CUSTOM_TOPIC_KEY = 'user-topics'
const CUSTOMIZE_TOPIC_KEY = 'customize-topics'
export function TopicSelector(props: {
  topic: string | undefined
  onSetTopic: (topic: string) => void
}) {
  const { topic, onSetTopic } = props
  const user = useUser()
  const subtopics = uniq(Object.values(TOPICS_TO_SUBTOPICS).flat())
  const [open, setOpen] = useState(false)
  const [userSelectedTopics, setUserSelectedTopics] = usePersistentLocalState<
    string[] | undefined
  >(undefined, 'user-selected-topics')
  const customTopicKey = (topics: string[]) =>
    CUSTOM_TOPIC_KEY + topics.join(',')

  useEffect(() => {
    if (!user || userSelectedTopics !== undefined) return
    getUserInterestTopics(user.id).then((topics) => {
      setUserSelectedTopics(topics)
    })
  }, [user, userSelectedTopics])

  const selectTopic = (topic: string) => {
    onSetTopic(topic)
    track('select topic', { topic })
  }

  return (
    <>
      <Select
        className="!border-ink-200"
        value={topic}
        onChange={(e) => {
          const { value } = e.target
          if (value === CUSTOMIZE_TOPIC_KEY) {
            setOpen(true)
            return
          }
          selectTopic(value)
        }}
      >
        <option value={CUSTOMIZE_TOPIC_KEY} onClick={() => setOpen(true)}>
          ⚙️ Customize Your Topics
        </option>
        <option value={customTopicKey(userSelectedTopics ?? [])}>
          {userSelectedTopics && userSelectedTopics.length > 0
            ? userSelectedTopics
                .slice(0, 4)
                .map((topic) => getEmojiFromTopic(topic))
            : '🔲'}{' '}
          Just Your Topics
        </option>
        <option value="">🖤 For you</option>
        {subtopics.map((subtopic) => (
          <option key={subtopic} value={cleanTopic(subtopic)}>
            {subtopic}
          </option>
        ))}
      </Select>
      <TopicSelectorDialog
        setOpen={setOpen}
        open={open}
        onFinishSelectingTopics={(topics) => {
          setUserSelectedTopics(topics)
          selectTopic(customTopicKey(topics))
        }}
      />
    </>
  )
}
