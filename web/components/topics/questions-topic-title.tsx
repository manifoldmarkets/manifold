import { Group, TOPIC_KEY } from 'common/group'
import { Title } from 'web/components/widgets/title'
import { BookmarkIcon, PlusCircleIcon } from '@heroicons/react/outline'
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
import { ForYouDropdown } from 'web/components/topics/for-you-dropdown'
import { useIsMobile } from 'web/hooks/use-is-mobile'

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
    return (
      <Row
        className={
          'col-span-8 my-1 flex-col px-2 sm:mb-3 sm:flex-row sm:items-center xl:col-span-7'
        }
        ref={ref}
      >
        <Row className={'items-center gap-2 sm:mr-5'}>
          <Title className="!mb-1 ">
            {currentTopic?.name ??
              (topicSlug === 'for-you' ? '⭐️ For you' : 'Browse')}
          </Title>
          {user && topicSlug === 'for-you' && (
            <ForYouDropdown
              setCurrentTopic={setTopicSlug}
              user={user}
              yourGroups={yourGroups}
              className={'lg:hidden'}
            />
          )}
        </Row>
        {currentTopic && (
          <Row className="grow items-center">
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
                  <PlusCircleIcon className={'mx-1 h-5 w-5'} />
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
                {!loading && <BookmarkIcon className={'mx-1 h-5 w-5'} />}
                Follow
              </Button>
            )}
            <div className="grow" />
            <TopicOptionsButton
              group={currentTopic}
              yourGroupIds={yourGroupIds}
              user={user}
            />
          </Row>
        )}
      </Row>
    )
  }
)
