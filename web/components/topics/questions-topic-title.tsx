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
import { useIsFollowingTopic } from 'web/hooks/use-group-supabase'
import { forwardRef, Ref, useState } from 'react'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { TOPIC_IDS_YOU_CANT_FOLLOW } from 'common/supabase/groups'
import { getTopicShareUrl } from 'common/util/share'
import { useUser } from 'web/hooks/use-user'
import { Tooltip } from '../widgets/tooltip'

export const QuestionsTopicTitle = forwardRef(
  (props: { topic: Group; addAbout: () => void }, ref: Ref<HTMLDivElement>) => {
    const { topic, addAbout } = props
    const { isFollowing, setIsFollowing } = useIsFollowingTopic(topic.slug)
    const [showAddContract, setShowAddContract] = useState(false)
    const [loading, setLoading] = useState(false)
    const user = useUser()
    const isMobile = useIsMobile()

    return (
      <Row
        className={
          'col-span-8 h-11 justify-between gap-1 sm:mb-1 xl:col-span-7'
        }
        ref={ref}
      >
        <h1 className="text-primary-700 self-center truncate text-2xl">
          <Tooltip text={topic.name}>{topic.name}</Tooltip>
        </h1>
        <Row>
          <CopyLinkOrShareButton
            url={getTopicShareUrl(topic.slug, user?.username)}
            className={'gap-1 whitespace-nowrap'}
            eventTrackingName={'copy questions page link'}
            size={isMobile ? 'sm' : 'md'}
          >
            Share
          </CopyLinkOrShareButton>
          {!TOPIC_IDS_YOU_CANT_FOLLOW.includes(topic.id) && (
            <Button
              color={'gray-white'}
              className={'whitespace-nowrap'}
              loading={loading}
              disabled={loading || !user || isFollowing === undefined}
              size={isMobile ? 'sm' : 'md'}
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
                <FilledBookmark className={'mr-1 h-5 w-5'} />
              ) : (
                <BookmarkIcon className={'mr-1 h-5 w-5'} />
              )}
              {isFollowing ? 'Following' : 'Follow'}
            </Button>
          )}
          {isFollowing && !isMobile && user ? (
            <>
              <Button
                color={'gray-white'}
                size={isMobile ? 'sm' : 'md'}
                className={'whitespace-nowrap'}
                onClick={() => setShowAddContract(true)}
              >
                <Row>
                  <PlusCircleIcon className={'mr-1 h-5 w-5'} />
                  Add questions
                </Row>
              </Button>
              {showAddContract && user && (
                <AddContractToGroupModal
                  group={topic}
                  open={showAddContract}
                  setOpen={setShowAddContract}
                  user={user}
                />
              )}
            </>
          ) : null}

          <TopicOptions
            group={topic}
            isMember={!!isFollowing}
            unfollow={() => {
              setIsFollowing(false)
              internalUnfollowTopic(user, topic).catch(() =>
                // undo optimistic update
                setIsFollowing(true)
              )
            }}
            addAbout={addAbout}
            user={user}
            className={'flex [&_*]:flex [&_button]:pr-2'}
          />
        </Row>
      </Row>
    )
  }
)
