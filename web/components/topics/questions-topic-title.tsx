import { Group } from 'common/group'
import { BookmarkIcon, PlusCircleIcon } from '@heroicons/react/outline'
import { BookmarkIcon as FilledBookmark } from '@heroicons/react/solid'
import { CopyLinkOrShareButton } from 'web/components/buttons/copy-link-button'
import { Button } from 'web/components/buttons/button'
import { AddContractToGroupModal } from 'web/components/topics/add-contract-to-group-modal'
import {
  internalFollowTopic,
  internalUnfollowTopic,
} from 'web/components/topics/topics-button'
import { TopicOptions } from 'web/components/topics/topic-options'
import { Row } from 'web/components/layout/row'
import { Col } from 'web/components/layout/col'
import { useIsFollowingTopic } from 'web/hooks/use-group-supabase'
import { forwardRef, Ref, useState } from 'react'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { TOPIC_IDS_YOU_CANT_FOLLOW } from 'common/supabase/groups'
import { getTopicShareUrl } from 'common/util/share'
import { useUser } from 'web/hooks/use-user'

export const QuestionsTopicTitle = forwardRef(
  (props: { topic: Group; addAbout: () => void }, ref: Ref<HTMLDivElement>) => {
    const { topic, addAbout } = props
    const { isFollowing, setIsFollowing } = useIsFollowingTopic(topic.slug)
    const [showAddContract, setShowAddContract] = useState(false)
    const [loading, setLoading] = useState(false)
    const user = useUser()
    const isMobile = useIsMobile()

    return (
      <Col className="mb-4 gap-4" ref={ref}>
        {/* Topic name */}
        <h1 className="text-ink-900 text-2xl font-semibold tracking-tight sm:text-3xl">
          {topic.name}
        </h1>

        {/* Action buttons */}
        <Row className="flex-wrap gap-2">
          <CopyLinkOrShareButton
            url={getTopicShareUrl(topic.slug, user?.username)}
            className="border-ink-200 bg-canvas-0 hover:bg-canvas-50 text-ink-600 gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium shadow-sm transition-colors"
            eventTrackingName={'copy questions page link'}
            size="sm"
          >
            Share
          </CopyLinkOrShareButton>

          {!TOPIC_IDS_YOU_CANT_FOLLOW.includes(topic.id) && (
            <Button
              color={isFollowing ? 'indigo' : 'indigo-outline'}
              className="gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium shadow-sm"
              loading={loading}
              disabled={loading || !user || isFollowing === undefined}
              size="sm"
              onClick={async () => {
                setLoading(true)
                if (isFollowing) {
                  await internalUnfollowTopic(user, topic)
                  setIsFollowing(false)
                } else {
                  await internalFollowTopic(user, topic)
                  setIsFollowing(true)
                }
                setLoading(false)
              }}
            >
              {loading ? null : isFollowing ? (
                <FilledBookmark className="h-4 w-4" />
              ) : (
                <BookmarkIcon className="h-4 w-4" />
              )}
              {isFollowing ? 'Following' : 'Follow'}
            </Button>
          )}

          {isFollowing && !isMobile && user && (
            <>
              <Button
                color="gray-outline"
                size="sm"
                className="gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium shadow-sm"
                onClick={() => setShowAddContract(true)}
              >
                <PlusCircleIcon className="h-4 w-4" />
                Add questions
              </Button>
              {showAddContract && (
                <AddContractToGroupModal
                  group={topic}
                  open={showAddContract}
                  setOpen={setShowAddContract}
                  user={user}
                />
              )}
            </>
          )}

          <TopicOptions
            group={topic}
            isMember={!!isFollowing}
            unfollow={() => {
              setIsFollowing(false)
              internalUnfollowTopic(user, topic).catch(() =>
                setIsFollowing(true)
              )
            }}
            addAbout={addAbout}
            user={user}
            className="flex [&_*]:flex [&_button]:pr-2"
          />
        </Row>
      </Col>
    )
  }
)
