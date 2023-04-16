import React, { useEffect, useState } from 'react'
import { noop, uniq } from 'lodash'

import { Col } from 'web/components/layout/col'
import { joinGroup, leaveGroup } from 'web/lib/firebase/groups'
import { useUser } from 'web/hooks/use-user'
import { Modal } from 'web/components/layout/modal'
import { PillButton } from 'web/components/buttons/pill-button'
import { Button } from 'web/components/buttons/button'
import { getSubtopics, TOPICS_TO_SUBTOPICS } from 'common/topics'
import { db } from 'web/lib/supabase/db'
import { updateUserEmbedding } from 'web/lib/firebase/api'

export function TopicSelectorDialog() {
  const user = useUser()

  const [selectedTopics, setSelectedTopics] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (user && selectedTopics.length > 0) {
      db.rpc('save_user_topics', {
        p_user_id: user.id,
        p_topics: selectedTopics,
      }).then(() => {
        console.log('saved user topics')
      })
    }
  }, [selectedTopics])

  const recomputeEmbeddingsAndReload = () => {
    if (user) {
      setIsLoading(true)
      updateUserEmbedding({ userId: user.id }).then(() => {
        // Reload to recompute feed!
        window.location.reload()
      })
    }
  }

  return (
    <Modal
      open={true}
      setOpen={noop}
      className="bg-canvas-0 overflow-hidden rounded-md"
    >
      <Col className="h-[32rem] overflow-y-auto">
        <div className="bg-canvas-0 sticky top-0 py-4 px-6">
          <p className="text-primary-700 mb-2 text-2xl">What interests you?</p>
          <p>Select a few topics to personalize your feed</p>
        </div>

        {Object.keys(TOPICS_TO_SUBTOPICS).map((topic) => (
          <div className="mb-4 px-5" key={topic + '-section'}>
            <div className="text-primary-700 mb-2 ml-1 text-lg">{topic}</div>

            <div className="flex flex-wrap gap-x-1 gap-y-2">
              {getSubtopics(topic).map(
                ([subtopicWithEmoji, subtopic, groupId]) => (
                  <PillButton
                    key={subtopic}
                    selected={selectedTopics.includes(subtopic)}
                    onSelect={() => {
                      if (selectedTopics.includes(subtopic)) {
                        setSelectedTopics(
                          selectedTopics.filter((t) => t !== subtopic)
                        )
                        if (topic === '👥 Communities' && groupId && user)
                          leaveGroup(groupId, user.id)
                      } else {
                        setSelectedTopics(uniq([...selectedTopics, subtopic]))
                        if (topic === '👥 Communities' && groupId && user)
                          joinGroup(groupId, user.id)
                      }
                    }}
                  >
                    {subtopicWithEmoji}
                  </PillButton>
                )
              )}
            </div>
          </div>
        ))}

        <div className="from-canvas-0 pointer-events-none sticky bottom-0 bg-gradient-to-t to-transparent text-right">
          <span className="pointer-events-auto ml-auto inline-flex p-6 pt-2">
            <Button onClick={recomputeEmbeddingsAndReload} loading={isLoading}>
              Done
            </Button>
          </span>
        </div>
      </Col>
    </Modal>
  )
}
