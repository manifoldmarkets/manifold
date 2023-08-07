import React, { useState } from 'react'
import { noop, uniq } from 'lodash'

import { Col } from 'web/components/layout/col'
import { leaveGroup } from 'web/lib/supabase/groups'
import { useUser } from 'web/hooks/use-user'
import { Modal } from 'web/components/layout/modal'
import { PillButton } from 'web/components/buttons/pill-button'
import { Button } from 'web/components/buttons/button'
import { getSubtopics, TOPICS_TO_SUBTOPICS } from 'common/topics'
import { joinGroup, updateUserEmbedding } from 'web/lib/firebase/api'

export function TopicSelectorDialog(props: {
  skippable: boolean
  opaque: boolean
}) {
  const { skippable, opaque } = props

  const user = useUser()
  const [userSelectedTopics, setUserSelectedTopics] = useState<
    string[] | undefined
  >()
  const [isLoading, setIsLoading] = useState(false)
  const [open, setOpen] = useState(true)

  const closeDialog = (skipUpdate: boolean) => {
    setIsLoading(true)

    if (user && !skipUpdate) updateUserEmbedding()

    setOpen(false)
    if (window.location.pathname !== '/questions') window.location.reload()
  }

  return (
    <Modal
      open={open}
      setOpen={skippable ? closeDialog : noop}
      className="bg-canvas-0 overflow-hidden rounded-md"
      size={'lg'}
      bgOpaque={opaque}
    >
      <Col className="h-[32rem] overflow-y-auto">
        <div className="bg-canvas-0 sticky top-0 py-4 px-5">
          <p className="text-primary-700 mb-2 text-2xl">What interests you?</p>
          <p>Select 3 or more topics to personalize your feed</p>
        </div>

        {Object.keys(TOPICS_TO_SUBTOPICS).map((topic) => (
          <div className="mb-2 px-5" key={topic + '-section'}>
            <div className="text-primary-700 text-sm">{topic.slice(3)}</div>

            <div className="flex flex-wrap gap-x-1 gap-y-1.5">
              {getSubtopics(topic).map(
                ([subtopicWithEmoji, subtopic, groupId]) => {
                  const selectedTopics: string[] = userSelectedTopics ?? []
                  return (
                    <PillButton
                      key={subtopic}
                      selected={selectedTopics.includes(subtopic)}
                      onSelect={() => {
                        if (selectedTopics.includes(subtopic)) {
                          setUserSelectedTopics(
                            selectedTopics.filter((t) => t !== subtopic)
                          )
                          if (groupId && user) leaveGroup(groupId, user.id)
                        } else {
                          setUserSelectedTopics(
                            uniq([...selectedTopics, subtopic])
                          )
                          if (groupId && user) joinGroup({ groupId })
                        }
                      }}
                    >
                      {subtopicWithEmoji}
                    </PillButton>
                  )
                }
              )}
            </div>
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
