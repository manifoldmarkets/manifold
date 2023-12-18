import { Group, TOPIC_KEY } from 'common/group'
import {
  ArrowLeftIcon,
  BookmarkIcon,
  PlusCircleIcon,
} from '@heroicons/react/outline'
import { CopyLinkOrShareButton } from 'web/components/buttons/copy-link-button'
import { DOMAIN } from 'common/envs/constants'
import { Button } from 'web/components/buttons/button'
import { AddContractToGroupModal } from 'web/components/topics/add-contract-to-group-modal'
import {
  internalFollowTopic,
  TopicOptionsButton,
} from 'web/components/topics/topics-button'
import { Row } from 'web/components/layout/row'
import { useRealtimeMemberGroups } from 'web/hooks/use-group-supabase'
import { User } from 'common/user'
import { forwardRef, Ref, useState } from 'react'
import { TopicDropdown } from 'web/components/topics/topic-dropdown'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { useRouter } from 'next/router'
import { TOPIC_IDS_YOU_CANT_FOLLOW } from 'common/supabase/groups'
import { Col } from 'web/components/layout/col'
import { toast } from 'react-hot-toast'

export const QuestionsTopicTitle = forwardRef(
  (
    props: {
      currentTopic: Group | undefined
      topicSlug: string | undefined
      user: User | null | undefined
      setTopicSlug: (topicSlug: string) => void
    },
    ref: Ref<HTMLDivElement>
  ) => {
    const { currentTopic, setTopicSlug, user, topicSlug } = props
    const yourGroups = useRealtimeMemberGroups(user?.id)
    const yourGroupIds = yourGroups?.map((g) => g.id)
    const [showAddContract, setShowAddContract] = useState(false)
    const [loading, setLoading] = useState(false)
    const isMobile = useIsMobile()
    const isFollowing =
      currentTopic && (yourGroupIds ?? []).includes(currentTopic.id)
    const router = useRouter()

    return (
      <Row
        className={
          'col-span-8 my-1 items-center justify-between gap-1 sm:mb-3 xl:col-span-7'
        }
        ref={ref}
      >
        <Col className={'mb-1 truncate'}>
          <Row className={'items-center gap-1'}>
            <Button size={'2xs'} color={'gray-white'} onClick={router.back}>
              <ArrowLeftIcon className={'h-5 w-5'} />
            </Button>
            <span
              className="text-primary-700 !mb-0 truncate text-2xl"
              onClick={() =>
                currentTopic ? toast(`Questions in ${currentTopic.name}`) : null
              }
            >
              {currentTopic?.name ??
                (topicSlug === 'for-you'
                  ? '⭐️ For you'
                  : topicSlug === 'recent'
                  ? '⏳ Your recents'
                  : 'Browse')}
            </span>
          </Row>
        </Col>
        <Row className="items-center px-2">
          {currentTopic && (
            <>
              <CopyLinkOrShareButton
                url={`https://${DOMAIN}/browse?${TOPIC_KEY}=${
                  currentTopic?.slug ?? ''
                }`}
                className={'gap-1 whitespace-nowrap'}
                eventTrackingName={'copy questions page link'}
                size={isMobile ? 'sm' : 'md'}
              >
                Share
              </CopyLinkOrShareButton>
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
                      group={currentTopic}
                      open={showAddContract}
                      setOpen={setShowAddContract}
                      user={user}
                    />
                  )}
                </>
              ) : (
                !isFollowing &&
                !TOPIC_IDS_YOU_CANT_FOLLOW.includes(currentTopic.id) &&
                user && (
                  <Button
                    color={'gray-white'}
                    className={'whitespace-nowrap'}
                    loading={loading}
                    size={isMobile ? 'sm' : 'md'}
                    onClick={() => {
                      setLoading(true)
                      internalFollowTopic(user, currentTopic).finally(() =>
                        setLoading(false)
                      )
                    }}
                  >
                    {!loading && <BookmarkIcon className={'mr-1 h-5 w-5'} />}
                    Follow
                  </Button>
                )
              )}
            </>
          )}
          {currentTopic ? (
            <TopicOptionsButton
              group={currentTopic}
              yourGroupIds={yourGroupIds}
              user={user}
            />
          ) : user ? (
            <TopicDropdown
              setCurrentTopic={setTopicSlug}
              user={user}
              className={'md:hidden'}
            />
          ) : null}
        </Row>
      </Row>
    )
  }
)
