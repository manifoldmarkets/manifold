import { track } from '@amplitude/analytics-browser'
import {
  ArrowSmRightIcon,
  PlusCircleIcon,
  XCircleIcon,
} from '@heroicons/react/outline'

import PencilIcon from '@heroicons/react/solid/PencilIcon'

import { Contract } from 'common/contract'
import { Group } from 'common/group'
import { Post } from 'common/post'
import { useEffect, useState } from 'react'
import { ReactNode } from 'react'
import { getPost } from 'web/lib/firebase/posts'
import { ContractSearch } from '../contract-search'
import { ContractCard } from '../contract/contract-card'

import Masonry from 'react-masonry-css'

import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { SiteLink } from '../site-link'
import { GroupOverviewPost } from './group-overview-post'
import { getContractFromId } from 'web/lib/firebase/contracts'
import { groupPath, updateGroup } from 'web/lib/firebase/groups'
import { PinnedSelectModal } from '../pinned-select-modal'
import { Button } from '../button'
import { User } from 'common/user'
import { UserLink } from '../user-link'
import { EditGroupButton } from './edit-group-button'
import { JoinOrLeaveGroupButton } from './groups-button'
import { Linkify } from '../linkify'
import { ChoicesToggleGroup } from '../choices-toggle-group'
import { CopyLinkButton } from '../copy-link-button'
import { REFERRAL_AMOUNT } from 'common/economy'
import toast from 'react-hot-toast'
import { ENV_CONFIG } from 'common/envs/constants'
import { PostCard, PostCardList } from '../post-card'
import { LoadingIndicator } from '../loading-indicator'
import { useUser } from 'web/hooks/use-user'
import { CreatePost } from '../create-post'
import { Modal } from '../layout/modal'

const MAX_TRENDING_POSTS = 6

export function GroupOverview(props: {
  group: Group
  isEditable: boolean
  posts: Post[]
  aboutPost: Post | null
  creator: User
  user: User | null | undefined
  memberIds: string[]
}) {
  const { group, isEditable, posts, aboutPost, creator, user, memberIds } =
    props
  return (
    <Col className="pm:mx-10 gap-4 px-4 pb-12 pt-4 sm:pt-0">
      <GroupOverviewPinned
        group={group}
        posts={posts}
        isEditable={isEditable}
      />
      {(group.aboutPostId != null || isEditable) && (
        <>
          <SectionHeader label={'About'} href={'/post/' + group.slug} />
          <GroupOverviewPost
            group={group}
            isEditable={isEditable}
            post={aboutPost}
          />
        </>
      )}
      <SectionHeader label={'Trending'} />
      <ContractSearch
        user={user}
        defaultSort={'score'}
        noControls
        maxResults={MAX_TRENDING_POSTS}
        defaultFilter={'all'}
        additionalFilter={{ groupSlug: group.slug }}
        persistPrefix={`group-trending-${group.slug}`}
      />
      <GroupAbout
        group={group}
        creator={creator}
        isEditable={isEditable}
        user={user}
        memberIds={memberIds}
      />

      <GroupPosts group={group} posts={posts} />
    </Col>
  )
}

export function GroupPosts(props: { posts: Post[]; group: Group }) {
  const { posts, group } = props
  const [showCreatePost, setShowCreatePost] = useState(false)
  const user = useUser()

  const createPost = (
    <Modal size="xl" open={showCreatePost} setOpen={setShowCreatePost}>
      <div className="w-full bg-white py-10">
        <CreatePost group={group} />
      </div>
    </Modal>
  )

  const postList = (
    <div className=" align-start w-full items-start">
      <Row className="flex justify-between">
        <Col>
          <SectionHeader label={'Latest Posts'} />
        </Col>
        <Col>
          {user && (
            <Button
              className="btn-md"
              onClick={() => setShowCreatePost(!showCreatePost)}
            >
              Add a Post
            </Button>
          )}
        </Col>
      </Row>

      <div className="mt-2">
        <PostCardList posts={posts} />
        {posts.length === 0 && (
          <div className="text-center text-gray-500">No posts yet</div>
        )}
      </div>
    </div>
  )

  return showCreatePost ? createPost : postList
}

function GroupOverviewPinned(props: {
  group: Group
  posts: Post[]
  isEditable: boolean
}) {
  const { group, posts, isEditable } = props
  const [pinned, setPinned] = useState<JSX.Element[]>([])

  useEffect(() => {
    async function getPinned() {
      if (group.pinnedItems == null) {
        updateGroup(group, { pinnedItems: [] })
      } else {
        const itemComponents = await Promise.all(
          group.pinnedItems.map(async (element) => {
            if (element.type === 'post') {
              const post = await getPost(element.itemId)
              if (post) {
                return <PostCard post={post as Post} />
              }
            } else if (element.type === 'contract') {
              const contract = await getContractFromId(element.itemId)
              if (contract) {
                return <ContractCard contract={contract as Contract} />
              }
            }
          })
        )
        setPinned(
          itemComponents.filter(
            (element) => element != undefined
          ) as JSX.Element[]
        )
      }
    }
    getPinned()
  }, [group, group.pinnedItems])

  async function onSubmit(selectedItems: { itemId: string; type: string }[]) {
    await updateGroup(group, {
      pinnedItems: [
        ...group.pinnedItems,
        ...(selectedItems as { itemId: string; type: 'contract' | 'post' }[]),
      ],
    })
  }

  function onDeleteClicked(index: number) {
    const newPinned = group.pinnedItems.filter((item) => {
      return item.itemId !== group.pinnedItems[index].itemId
    })
    updateGroup(group, { pinnedItems: newPinned })
  }

  return isEditable || (group.pinnedItems && group.pinnedItems.length > 0) ? (
    <PinnedItems
      posts={posts}
      group={group}
      isEditable={isEditable}
      pinned={pinned}
      onDeleteClicked={onDeleteClicked}
      onSubmit={onSubmit}
      modalMessage={'Pin posts or markets to the overview of this group.'}
    />
  ) : (
    <LoadingIndicator />
  )
}

export function PinnedItems(props: {
  posts: Post[]
  isEditable: boolean
  pinned: JSX.Element[]
  onDeleteClicked: (index: number) => void
  onSubmit: (selectedItems: { itemId: string; type: string }[]) => void
  group?: Group
  modalMessage: string
}) {
  const {
    isEditable,
    pinned,
    onDeleteClicked,
    onSubmit,
    posts,
    group,
    modalMessage,
  } = props
  const [editMode, setEditMode] = useState(false)
  const [open, setOpen] = useState(false)

  return pinned.length > 0 || isEditable ? (
    <div>
      <Row className=" items-center justify-between">
        <SectionHeader label={'Featured'} href={`#`} />
        {isEditable && (
          <Button
            color="gray"
            size="xs"
            onClick={() => {
              setEditMode(!editMode)
            }}
          >
            {editMode ? (
              'Done'
            ) : (
              <>
                <PencilIcon className="inline h-4 w-4" />
                Edit
              </>
            )}
          </Button>
        )}
      </Row>
      <div>
        <Masonry
          breakpointCols={{ default: 2, 768: 1 }}
          className="-ml-4 flex w-auto"
          columnClassName="pl-4 bg-clip-padding"
        >
          {pinned.length == 0 && !editMode && (
            <div className="flex flex-col items-center justify-center">
              <p className="text-center text-gray-400">
                No pinned items yet. Click the edit button to add some!
              </p>
            </div>
          )}
          {pinned.map((element, index) => (
            <div className="relative mb-4">
              {element}

              {editMode && <CrossIcon onClick={() => onDeleteClicked(index)} />}
            </div>
          ))}
          {editMode && pinned.length < 6 && (
            <div className=" py-2">
              <Row
                className={
                  'relative gap-3 rounded-lg border-4 border-dotted p-2 hover:cursor-pointer hover:bg-gray-100'
                }
              >
                <button
                  className="flex w-full justify-center"
                  onClick={() => setOpen(true)}
                >
                  <PlusCircleIcon
                    className="h-12 w-12 text-gray-600"
                    aria-hidden="true"
                  />
                </button>
              </Row>
            </div>
          )}
        </Masonry>
      </div>
      <PinnedSelectModal
        open={open}
        group={group}
        posts={posts}
        setOpen={setOpen}
        title="Pin a post or market"
        description={
          <div className={'text-md my-4 text-gray-600'}>{modalMessage}</div>
        }
        onSubmit={onSubmit}
      />
    </div>
  ) : (
    <></>
  )
}

function SectionHeader(props: {
  label: string
  href?: string
  children?: ReactNode
}) {
  const { label, href, children } = props
  const content = (
    <>
      {label}{' '}
      <ArrowSmRightIcon
        className="mb-0.5 inline h-6 w-6 text-gray-500"
        aria-hidden="true"
      />
    </>
  )

  return (
    <Row className="mb-3 items-center justify-between">
      {href ? (
        <SiteLink
          className="text-xl"
          href={href}
          onClick={() => track('group click section header', { section: href })}
        >
          {content}
        </SiteLink>
      ) : (
        <span className="text-xl">{content}</span>
      )}
      {children}
    </Row>
  )
}

export function GroupAbout(props: {
  group: Group
  creator: User
  user: User | null | undefined
  isEditable: boolean
  memberIds: string[]
}) {
  const { group, creator, isEditable, user, memberIds } = props
  const anyoneCanJoinChoices: { [key: string]: string } = {
    Closed: 'false',
    Open: 'true',
  }
  const [anyoneCanJoin, setAnyoneCanJoin] = useState(group.anyoneCanJoin)
  function updateAnyoneCanJoin(newVal: boolean) {
    if (group.anyoneCanJoin == newVal || !isEditable) return
    setAnyoneCanJoin(newVal)
    toast.promise(updateGroup(group, { ...group, anyoneCanJoin: newVal }), {
      loading: 'Updating group...',
      success: 'Updated group!',
      error: "Couldn't update group",
    })
  }
  const postFix = user ? '?referrer=' + user.username : ''
  const shareUrl = `https://${ENV_CONFIG.domain}${groupPath(
    group.slug
  )}${postFix}`
  const isMember = user ? memberIds.includes(user.id) : false

  return (
    <>
      <Col className="gap-2 rounded-b bg-white p-2">
        <Row className={'flex-wrap justify-between'}>
          <div className={'inline-flex items-center'}>
            <div className="mr-1 text-gray-500">Created by</div>
            <UserLink
              className="text-neutral"
              name={creator.name}
              username={creator.username}
            />
          </div>
          {isEditable ? (
            <EditGroupButton className={'ml-1'} group={group} />
          ) : (
            user && (
              <Row>
                <JoinOrLeaveGroupButton
                  group={group}
                  user={user}
                  isMember={isMember}
                />
              </Row>
            )
          )}
        </Row>
        <div className={'block sm:hidden'}>
          <Linkify text={group.about} />
        </div>
        <Row className={'items-center gap-1'}>
          <span className={'text-gray-500'}>Membership</span>
          {user && user.id === creator.id ? (
            <ChoicesToggleGroup
              currentChoice={anyoneCanJoin.toString()}
              choicesMap={anyoneCanJoinChoices}
              setChoice={(choice) =>
                updateAnyoneCanJoin(choice.toString() === 'true')
              }
              toggleClassName={'h-10'}
              className={'ml-2'}
            />
          ) : (
            <span className={'text-gray-700'}>
              {anyoneCanJoin ? 'Open to all' : 'Closed (by invite only)'}
            </span>
          )}
        </Row>

        {anyoneCanJoin && user && (
          <Col className="my-4 px-2">
            <div className="text-lg">Invite</div>
            <div className={'mb-2 text-gray-500'}>
              Invite a friend to this group and get M${REFERRAL_AMOUNT} if they
              sign up!
            </div>

            <CopyLinkButton
              url={shareUrl}
              tracking="copy group share link"
              buttonClassName="btn-md rounded-l-none"
              toastClassName={'-left-28 mt-1'}
            />
          </Col>
        )}
      </Col>
    </>
  )
}

function CrossIcon(props: { onClick: () => void }) {
  const { onClick } = props

  return (
    <div>
      <button className=" text-gray-500 hover:text-gray-700" onClick={onClick}>
        <div className="absolute top-0 left-0 right-0 bottom-0 bg-gray-200 bg-opacity-50">
          <XCircleIcon className="h-12 w-12 text-gray-600" />
        </div>
      </button>
    </div>
  )
}
