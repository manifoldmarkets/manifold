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
  followTopic,
  TopicOptionsButton,
} from 'web/components/topics/topics-button'
import { Row } from 'web/components/layout/row'
import { useRealtimeMemberGroups } from 'web/hooks/use-group-supabase'
import { User } from 'common/user'
import { forwardRef, Ref, useState } from 'react'
import { TopicDropdown } from 'web/components/topics/topic-dropdown'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { useRouter } from 'next/router'

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
          'col-span-8 my-1 flex-col gap-1 px-2 sm:mb-3 sm:flex-row sm:items-center xl:col-span-7'
        }
        ref={ref}
      >
        <Row className={'items-center justify-between gap-2'}>
          <Row className={'mb-1 items-center gap-1'}>
            <Button size={'sm'} color={'gray-white'} onClick={router.back}>
              <ArrowLeftIcon className={'h-5 w-5'} />
            </Button>
            <span className="text-primary-700 !mb-0 line-clamp-1 text-2xl">
              {currentTopic?.name ??
                (topicSlug === 'for-you' ? '⭐️ For you' : 'Browse')}
            </span>
          </Row>
          {currentTopic ? (
            <TopicOptionsButton
              group={currentTopic}
              yourGroupIds={yourGroupIds}
              user={user}
              className={'sm:hidden'}
            />
          ) : user ? (
            <TopicDropdown
              setCurrentTopic={setTopicSlug}
              user={user}
              className={'sm:hidden'}
            />
          ) : null}
        </Row>
        {/* {topicSlug === 'for-you' && (
          <Button
            size={'sm'}
            color={'gray-white'}
            onClick={() => setShowFollowedTopics(true)}
          >
            <Row className={'items-center gap-1'}>
              <PencilIcon className={'h-5 w-5'} />
              Followed topics
            </Row>
          </Button>
        )} */}
        {currentTopic && (
          <Row className="items-center">
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
            {isFollowing ? (
              <>
                <Button
                  color={'gray-white'}
                  size={isMobile ? 'sm' : 'md'}
                  className={'whitespace-nowrap'}
                  onClick={() => setShowAddContract(true)}
                >
                  <PlusCircleIcon className={'mr-1 h-5 w-5'} />
                  Add questions
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
              <Button
                color={'gray-white'}
                className={'whitespace-nowrap'}
                loading={loading}
                size={isMobile ? 'sm' : 'md'}
                onClick={() => {
                  setLoading(true)
                  followTopic(user, currentTopic).finally(() =>
                    setLoading(false)
                  )
                }}
              >
                {!loading && <BookmarkIcon className={'mr-1 h-5 w-5'} />}
                Follow
              </Button>
            )}
          </Row>
        )}
        {currentTopic ? (
          <TopicOptionsButton
            group={currentTopic}
            yourGroupIds={yourGroupIds}
            user={user}
            className={'hidden sm:block'}
          />
        ) : user ? (
          <TopicDropdown
            setCurrentTopic={setTopicSlug}
            user={user}
            className={'hidden sm:block md:hidden'}
          />
        ) : null}
      </Row>
    )
  }
)
