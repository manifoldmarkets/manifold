import { Group, TOPIC_KEY } from 'common/group'
import { Title } from 'web/components/widgets/title'
import { PlusCircleIcon } from '@heroicons/react/outline'
import { CopyLinkOrShareButton } from 'web/components/buttons/copy-link-button'
import { DOMAIN } from 'common/envs/constants'
import { Button } from 'web/components/buttons/button'
import { AddContractToGroupModal } from 'web/components/topics/add-contract-to-group-modal'
import { followTopic } from 'web/components/topics/topics-button'
import { Row } from 'web/components/layout/row'
import { useRealtimeMemberGroups } from 'web/hooks/use-group-supabase'
import { User } from 'common/user'
import { useState } from 'react'

export const QuestionsTopicTitle = (props: {
  currentTopic: Group | undefined
  topicSlug: string | undefined
  user: User | null | undefined
}) => {
  const { currentTopic, user, topicSlug } = props
  const yourGroups = useRealtimeMemberGroups(user?.id)
  const yourGroupIds = yourGroups?.map((g) => g.id)
  const [showAddContract, setShowAddContract] = useState(false)
  const [loading, setLoading] = useState(false)

  return (
    <Row className={'mb-3 hidden items-center lg:flex'}>
      <Title className="relative !mb-1 mr-6">
        {currentTopic?.name ??
          (topicSlug === 'for-you' ? '⭐️ For you' : 'Questions')}
      </Title>
      {currentTopic && (
        <>
          <CopyLinkOrShareButton
            url={`https://${DOMAIN}/questions?${TOPIC_KEY}=${
              currentTopic?.slug ?? ''
            }`}
            className={'gap-1'}
            eventTrackingName={'copy questions page link'}
          >
            Share
          </CopyLinkOrShareButton>
          {(yourGroupIds ?? []).includes(currentTopic.id) ? (
            <>
              <Button
                color={'gray-white'}
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
              loading={loading}
              onClick={() => {
                setLoading(true)
                followTopic(user, currentTopic).finally(() => setLoading(false))
              }}
            >
              {!loading && <PlusCircleIcon className={'mx-1 h-5 w-5'} />}
              Follow
            </Button>
          )}
        </>
      )}
    </Row>
  )
}
