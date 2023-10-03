import { PrivateUser, User } from 'common/user'
import { Group, TOPIC_KEY } from 'common/group'
import { Modal, SCROLLABLE_MODAL_CLASS } from 'web/components/layout/modal'
import { Col } from 'web/components/layout/col'
import clsx from 'clsx'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { Row } from 'web/components/layout/row'
import { Button } from 'web/components/buttons/button'
import { leaveGroup } from 'web/lib/supabase/groups'
import { track } from 'web/lib/service/analytics'
import { BsFillPersonDashFill } from 'react-icons/bs'
import { TopicSelector } from 'web/components/topics/topic-selector'
import { joinGroup } from 'web/lib/firebase/api'
import { useState } from 'react'
import { usePrivateUser } from 'web/hooks/use-user'
import { buildArray } from 'common/util/array'
import {
  DotsVerticalIcon,
  MinusCircleIcon,
  PlusCircleIcon,
} from '@heroicons/react/solid'
import { PencilIcon } from '@heroicons/react/outline'
import { HiNoSymbol } from 'react-icons/hi2'
import DropdownMenu, {
  DropdownItem,
} from 'web/components/comments/dropdown-menu'
import { CreateTopicModal } from 'web/components/topics/create-topic-modal'
import { useListGroupsBySlug } from 'web/hooks/use-group-supabase'
import { updatePrivateUser } from 'web/lib/firebase/users'
import router from 'next/router'

export const ForYouDropdown = (props: {
  setCurrentTopic: (topicSlug: string) => void
  user: User
  yourGroups: Group[] | undefined
  className?: string
}) => {
  const { yourGroups, user, setCurrentTopic, className } = props
  const [showEditingBlockedTopics, setShowEditingBlockedTopics] =
    useState(false)
  const [showCreateGroup, setShowCreateGroup] = useState(false)
  const [showFollowedTopics, setShowFollowedTopics] = useState(false)
  const privateUser = usePrivateUser()
  const groupOptionItems = buildArray(
    {
      name: 'Create new topic',
      icon: <PlusCircleIcon className="h-5 w-5" />,
      onClick: () => setShowCreateGroup(true),
    },
    {
      name: 'Followed topics',
      icon: <PencilIcon className="h-5 w-5" />,
      onClick: () => setShowFollowedTopics(true),
    },
    {
      name: 'Blocked topics',
      icon: <HiNoSymbol className="h-5 w-5" />,
      onClick: () => setShowEditingBlockedTopics(true),
    }
  ) as DropdownItem[]
  return (
    <>
      <DropdownMenu
        items={groupOptionItems}
        menuWidth={'w-50'}
        icon={<DotsVerticalIcon className="h-5 w-5" aria-hidden="true" />}
        withinOverflowContainer={true}
        className={className}
      />
      {showCreateGroup && (
        <CreateTopicModal
          user={user}
          open={showCreateGroup}
          setOpen={setShowCreateGroup}
          onCreate={(group) => {
            router.push(`questions?${TOPIC_KEY}=${group.slug}`)
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
      {showFollowedTopics && user && (
        <FollowedTopicsModal
          user={user}
          setShow={setShowFollowedTopics}
          show={showFollowedTopics}
          setCurrentCategory={setCurrentTopic}
          groups={yourGroups}
        />
      )}
    </>
  )
}
const BlockedTopicsModal = (props: {
  privateUser: PrivateUser
  setShowEditingBlockedTopics: (show: boolean) => void
  show: boolean
}) => {
  const { privateUser, show, setShowEditingBlockedTopics } = props
  const groups = useListGroupsBySlug(privateUser.blockedGroupSlugs ?? [])
  const unBlockGroup = async (groupSlug: string) => {
    await updatePrivateUser(privateUser.id, {
      blockedGroupSlugs:
        privateUser.blockedGroupSlugs?.filter((id) => id !== groupSlug) ?? [],
    })
  }
  const blockGroup = async (groupSlug: string) => {
    await updatePrivateUser(privateUser.id, {
      blockedGroupSlugs: [...(privateUser.blockedGroupSlugs ?? []), groupSlug],
    })
  }

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
              onClick={() => unBlockGroup(group.slug)}
            >
              <MinusCircleIcon className="h-5 w-5" />
            </Button>
          </Row>
        ))}
        <span className={'text-primary-700 mt-2 text-lg'}>
          Block more topics
        </span>
        <TopicSelector setSelectedGroup={(group) => blockGroup(group.slug)} />
        <div className={'mb-[10rem]'} />
      </Col>
    </Modal>
  )
}
const FollowedTopicsModal = (props: {
  user: User
  setShow: (show: boolean) => void
  show: boolean
  setCurrentCategory: (categorySlug: string) => void
  groups: Group[] | undefined
}) => {
  const { user, show, groups, setCurrentCategory, setShow } = props

  return (
    <Modal open={show} setOpen={setShow} className={SCROLLABLE_MODAL_CLASS}>
      <Col className={clsx('bg-canvas-50 min-h-[25rem] rounded-md p-4')}>
        <span className={'text-primary-700 text-lg'}>Followed Topics</span>

        {!groups ? (
          <LoadingIndicator />
        ) : (
          groups.map((group) => (
            <Row
              key={group.id + 'followed-topic'}
              className={'mt-2 w-full items-center justify-between'}
            >
              <button
                onClick={() => {
                  setCurrentCategory(group.slug)
                  setShow(false)
                }}
              >
                {group.name}
              </button>
              <Button
                size={'xs'}
                color={'gray'}
                onClick={() => {
                  console.log('leave group', group.id, user.id)
                  leaveGroup(group.id, user.id)
                  track('leave group', { slug: group.slug })
                }}
              >
                <BsFillPersonDashFill className="h-5 w-5" />
              </Button>
            </Row>
          ))
        )}
        <span className={'text-primary-700 mt-2 text-lg'}>
          Follow more topics
        </span>
        <TopicSelector
          setSelectedGroup={(group) => {
            joinGroup({ groupId: group.id })
            track('join group', { slug: group.slug })
          }}
          ignoreGroupIds={groups?.map((g) => g.id)}
        />
        <div className={'mb-[10rem]'} />
      </Col>
    </Modal>
  )
}
