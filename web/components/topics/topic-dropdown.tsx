import { PrivateUser, User } from 'common/user'
import { Modal, SCROLLABLE_MODAL_CLASS } from 'web/components/layout/modal'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Button } from 'web/components/buttons/button'
import { TopicSelector } from 'web/components/topics/topic-selector'
import { useState } from 'react'
import { usePrivateUser } from 'web/hooks/use-user'
import { DotsVerticalIcon, MinusCircleIcon } from '@heroicons/react/solid'
import { PencilIcon, PlusCircleIcon } from '@heroicons/react/outline'
import { HiNoSymbol } from 'react-icons/hi2'
import DropdownMenu, {
  DropdownItem,
} from 'web/components/comments/dropdown-menu'
import { CreateTopicModal } from 'web/components/topics/create-topic-modal'
import { useListGroupsBySlug } from 'web/hooks/use-group-supabase'
import { updatePrivateUser } from 'web/lib/firebase/users'
import { useRouter } from 'next/router'

export const TopicDropdown = (props: {
  setCurrentTopic: (topicSlug: string) => void
  user: User
  className?: string
}) => {
  const { user, setCurrentTopic, className } = props
  const [showEditingBlockedTopics, setShowEditingBlockedTopics] =
    useState(false)
  const [showCreateGroup, setShowCreateGroup] = useState(false)

  const router = useRouter()

  const privateUser = usePrivateUser()
  const groupOptionItems = [
    {
      name: 'Create new topic',
      icon: <PlusCircleIcon className="h-5 w-5" />,
      onClick: () => setShowCreateGroup(true),
    },
    {
      name: 'Followed topics',
      icon: <PencilIcon className="h-5 w-5" />,
      onClick: () =>
        router.replace({ query: { ...router.query, t: 'Topics', q: '' } }),
    },
    {
      name: 'Blocked topics',
      icon: <HiNoSymbol className="h-5 w-5" />,
      onClick: () => setShowEditingBlockedTopics(true),
    },
  ] as DropdownItem[]

  return (
    <>
      <DropdownMenu
        items={groupOptionItems}
        menuWidth={'w-50'}
        icon={<DotsVerticalIcon className="h-5 w-5" aria-hidden="true" />}
        withinOverflowContainer={true}
        className={className}
        closeOnClick
      />
      {showCreateGroup && (
        <CreateTopicModal
          user={user}
          open={showCreateGroup}
          setOpen={setShowCreateGroup}
          onCreate={(group) => {
            setCurrentTopic(group.slug)
          }}
        />
      )}
      {privateUser && showEditingBlockedTopics && (
        <BlockedTopicsModal
          privateUser={privateUser}
          setShowEditingBlockedTopics={setShowEditingBlockedTopics}
          show={showEditingBlockedTopics}
        />
      )}
    </>
  )
}

export const blockGroup = async (
  privateUser: PrivateUser,
  groupSlug: string
) => {
  await updatePrivateUser(privateUser.id, {
    blockedGroupSlugs: [...(privateUser.blockedGroupSlugs ?? []), groupSlug],
  })
}

export const unBlockGroup = async (
  privateUser: PrivateUser,
  groupSlug: string
) => {
  await updatePrivateUser(privateUser.id, {
    blockedGroupSlugs:
      privateUser.blockedGroupSlugs?.filter((id) => id !== groupSlug) ?? [],
  })
}

const BlockedTopicsModal = (props: {
  privateUser: PrivateUser
  setShowEditingBlockedTopics: (show: boolean) => void
  show: boolean
}) => {
  const { privateUser, show, setShowEditingBlockedTopics } = props
  const groups = useListGroupsBySlug(privateUser.blockedGroupSlugs ?? [])

  return (
    <Modal
      open={show}
      setOpen={setShowEditingBlockedTopics}
      className={SCROLLABLE_MODAL_CLASS}
    >
      <Col className={'bg-canvas-50 min-h-[25rem] rounded-md p-4'}>
        {groups?.length ? (
          <span className={'text-primary-700 text-lg'}>Blocked Topics</span>
        ) : null}
        {(groups ?? []).map((group) => (
          <Row
            key={group.id}
            className={'mt-2 w-full items-center justify-between'}
          >
            <span>{group.name}</span>
            <Button
              size={'xs'}
              color={'gray'}
              onClick={() => unBlockGroup(privateUser, group.slug)}
            >
              <MinusCircleIcon className="h-5 w-5" />
            </Button>
          </Row>
        ))}
        <span className={'text-primary-700 mt-2 text-lg'}>
          Block more topics
        </span>
        <TopicSelector
          setSelectedGroup={(group) => blockGroup(privateUser, group.slug)}
        />
        <div className={'mb-[10rem]'} />
      </Col>
    </Modal>
  )
}
