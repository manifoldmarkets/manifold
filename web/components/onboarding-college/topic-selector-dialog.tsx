import { useEffect, useState } from 'react'
import { noop, uniq } from 'lodash'
import { getGroupBySlug } from 'web/lib/supabase/groups'
import { Col } from 'web/components/layout/col'
import { useUser } from 'web/hooks/use-user'
import { Modal } from 'web/components/layout/modal'
import { PillButton } from 'web/components/buttons/pill-button'
import { Button } from 'web/components/buttons/button'
import {
  getSubtopics,
  removeEmojis,
  TOPICS_TO_SUBTOPICS,
} from './topics-college'
import {
  NewContractPanel,
  NewQuestionParams,
} from 'web/components/new-contract-college/new-contract-panel'
import { followTopic, updateUserEmbedding } from 'web/lib/firebase/api'
import { Group } from 'common/group'
import { Row } from 'web/components/layout/row'
import { updateUser } from 'web/lib/firebase/users'
import { unfollowTopic } from 'web/lib/supabase/groups'

export function TopicSelectorDialog(props: {
  skippable: boolean
  onClose?: () => void
}) {
  const { skippable, onClose } = props

  const user = useUser()

  const [userSelectedTopics, setUserSelectedTopics] = useState<
    string[] | undefined
  >()

  const topics = Object.keys(TOPICS_TO_SUBTOPICS)

  const selectTopic = (groupId: string) => {
    if (selectedTopics.includes(groupId)) {
      if (user) unfollowTopic(groupId, user.id)
      setUserSelectedTopics((tops) => (tops ?? []).filter((t) => t !== groupId))
    } else {
      setUserSelectedTopics((tops) => uniq([...(tops ?? []), groupId]))
      if (user) followTopic({ groupId })
    }
  }

  const [isLoading, setIsLoading] = useState(false)

  const closeDialog = async (skipUpdate: boolean) => {
    setIsLoading(true)

    if (user && !skipUpdate) await updateUserEmbedding()

    if (user) await updateUser(user.id, { shouldShowWelcome: false })

    onClose?.()

    window.location.reload()
    // setOpen(false)
  }
  const selectedTopics: string[] = userSelectedTopics ?? []

  const pillButton = (
    topicWithEmoji: string,
    topicName: string,
    groupId: string
  ) => (
    <PillButton
      key={topicName}
      selected={selectedTopics.includes(groupId)}
      onSelect={() => selectTopic(groupId)}
    >
      {topicWithEmoji}
    </PillButton>
  )

  return (
    <Modal
      open
      setOpen={skippable ? closeDialog : noop}
      className="bg-canvas-0 overflow-hidden rounded-md"
      size={'lg'}
    >
      <Col className="h-[32rem] overflow-y-auto">
        <div className="bg-canvas-0 sticky top-0 px-5 py-4">
          <p className="text-primary-700 mb-2 text-2xl">
            Which topics interest you?
          </p>
          <p>Select 3 or more topics to personalize your experience</p>
        </div>
        <Col className={'mb-4 px-5'}></Col>

        {topics.map((topic) => (
          <div className="mb-4 px-5" key={topic + '-section'}>
            <div className="text-primary-700 text-sm">{topic.slice(3)}</div>
            <Row className="flex flex-wrap gap-x-1 gap-y-1.5">
              {getSubtopics(topic)
                .filter(([_, __, groupId]) => !!groupId)
                .map(([subtopicWithEmoji, subtopic, groupId]) => {
                  return pillButton(subtopicWithEmoji, subtopic, groupId)
                })}
            </Row>
          </div>
        ))}

        <div className="from-canvas-0 pointer-events-none sticky bottom-0 bg-gradient-to-t to-transparent text-right">
          <span className="pointer-events-auto inline-flex gap-2 p-6 pt-2">
            {skippable && (
              <Button
                onClick={() => closeDialog(true)}
                color="gray-white"
                className="bg-canvas-50 text-ink"
              >
                Skip
              </Button>
            )}
            <Button
              onClick={() => closeDialog(false)}
              disabled={(userSelectedTopics ?? []).length <= 2}
              loading={isLoading}
            >
              Done
            </Button>
          </span>
        </div>
      </Col>
    </Modal>
  )
}
