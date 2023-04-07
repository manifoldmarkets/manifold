import React, { useEffect, useState } from 'react'
import { uniq } from 'lodash'

import { Col } from 'web/components/layout/col'
import { joinGroup, leaveGroup } from 'web/lib/firebase/groups'
import { useUser } from 'web/hooks/use-user'
import { Modal } from 'web/components/layout/modal'
import { PillButton } from 'web/components/buttons/pill-button'
import { Button } from 'web/components/buttons/button'
import { Row } from 'web/components/layout/row'
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
    <Modal open={true} setOpen={() => {}}>
      <Col className="bg-canvas-0 h-[42rem] rounded-md px-8 py-6 text-sm md:text-base">
        <span
          className={'text-primary-700 mb-2 text-2xl'}
          children="What interests you?"
        />
        <p className="mb-4">
          Select a few topics you're interested in to personalize your Manifold
          experience.
        </p>

        <div className="scrollbar-hide h-full items-start overflow-x-auto">
          {Object.keys(TOPICS_TO_SUBTOPICS).map((topic) => (
            <Col className="mb-4" key={topic + '-section'}>
              <span className={'text-primary-700 mb-2 text-lg'}>{topic}</span>

              <div className="ml-4">
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
                      className="bg-ink-100 mr-1 mb-2 max-w-[16rem] truncate"
                    >
                      {subtopicWithEmoji}
                    </PillButton>
                  )
                )}
              </div>
            </Col>
          ))}
        </div>

        <Row className={'justify-end'}>
          <Button onClick={recomputeEmbeddingsAndReload} loading={isLoading}>
            Done
          </Button>
        </Row>
      </Col>
    </Modal>
  )
}
