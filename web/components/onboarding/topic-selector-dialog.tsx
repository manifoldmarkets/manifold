import React, { useEffect, useState } from 'react'
import { noop, uniq } from 'lodash'
import { Col } from 'web/components/layout/col'
import { leaveGroup } from 'web/lib/supabase/groups'
import { useUser } from 'web/hooks/use-user'
import { Modal } from 'web/components/layout/modal'
import { PillButton } from 'web/components/buttons/pill-button'
import { Button } from 'web/components/buttons/button'
import { getSubtopics, TOPICS_TO_SUBTOPICS } from 'common/topics'
import { db } from 'web/lib/supabase/db'
import { joinGroup, updateUserEmbedding } from 'web/lib/firebase/api'
import { getUserInterestTopics } from 'web/lib/supabase/user'

export function TopicSelectorDialog(props: {
  setOpen?: (open: boolean) => void
  open?: boolean
  onFinishSelectingTopics?: (topics: string[]) => void
}) {
  const { setOpen, open, onFinishSelectingTopics } = props
  const user = useUser()
  const [userSelectedTopics, setUserSelectedTopics] = useState<
    string[] | undefined
  >()
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (user && userSelectedTopics !== undefined) {
      userSelectedTopics.length > 0
        ? db
            .rpc('save_user_topics', {
              p_user_id: user.id,
              p_topics: userSelectedTopics,
            })
            .then((r) => {
              console.log('saved user topics', r)
            })
        : db
            .rpc('save_user_topics_blank', {
              p_user_id: user.id,
            })
            .then((r) => {
              console.log('saved blank user topics', r)
            })
    }
  }, [userSelectedTopics])

  useEffect(() => {
    if (!user || userSelectedTopics !== undefined || !open) return
    getUserInterestTopics(user.id).then((topics) => {
      setUserSelectedTopics(topics)
    })
  }, [user, userSelectedTopics, open])

  const closeDialog = () => {
    if (setOpen) {
      user ? updateUserEmbedding({ userId: user.id }) : noop
      onFinishSelectingTopics?.(userSelectedTopics ?? [])
      setOpen(false)
    } else if (user) {
      setIsLoading(true)
      updateUserEmbedding({ userId: user.id }).then(() => {
        // Reload to recompute feed!
        window.location.reload()
      })
    }
  }

  return (
    <Modal
      open={open !== undefined ? open : true}
      setOpen={setOpen ? closeDialog : noop}
      className="bg-canvas-0 overflow-hidden rounded-md"
      size={'lg'}
      bgOpaque={true}
    >
      <Col className="h-[32rem] overflow-y-auto">
        <div className="bg-canvas-0 sticky top-0 py-4 px-6">
          <p className="text-primary-700 mb-2 text-2xl">What interests you?</p>
          <p>Select at least 3 topics to personalize your feed</p>
        </div>

        {Object.keys(TOPICS_TO_SUBTOPICS).map((topic) => (
          <div className="mb-4 px-5" key={topic + '-section'}>
            <div className="text-primary-700 mb-2 ml-1 text-lg">{topic}</div>

            <div className="flex flex-wrap gap-x-1 gap-y-2">
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
                          if (topic === '👥 Communities' && groupId && user)
                            leaveGroup(groupId, user.id)
                        } else {
                          setUserSelectedTopics(
                            uniq([...selectedTopics, subtopic])
                          )
                          if (topic === '👥 Communities' && groupId && user)
                            joinGroup({ groupId })
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
          <span className="pointer-events-auto ml-auto inline-flex p-6 pt-2">
            <Button
              onClick={closeDialog}
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
