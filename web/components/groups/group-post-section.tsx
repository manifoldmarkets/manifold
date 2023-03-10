import { PlusCircleIcon, XCircleIcon } from '@heroicons/react/outline'
import PencilIcon from '@heroicons/react/solid/PencilIcon'
import { Contract } from 'common/contract'
import { Group } from 'common/group'
import { Post } from 'common/post'
import { useEffect, useState } from 'react'
import { getPost } from 'web/lib/firebase/posts'
import { ContractCard } from '../contract/contract-card'
import Masonry from 'react-masonry-css'
import { useUser } from 'web/hooks/use-user'
import { getContractFromId } from 'web/lib/firebase/contracts'
import { updateGroup } from 'web/lib/firebase/groups'
import { Button } from '../buttons/button'
import { Col } from '../layout/col'
import { Modal } from '../layout/modal'
import { Row } from '../layout/row'
import { Spacer } from '../layout/spacer'
import { PinnedSelectModal } from '../pinned-select-modal'
import { CreatePostForm } from '../posts/create-post'
import { PostCard, PostCardList } from '../posts/post-card'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { Subtitle } from '../widgets/subtitle'

export function GroupPostSection(props: {
  group: Group
  canEdit: boolean
  // posts: Post[]
}) {
  const { group, canEdit } = props
  return (
    <Col className="pm:mx-10 gap-4 px-4 pb-12 pt-4 sm:pt-0">
      {/* <GroupFeatured group={group} posts={posts} canEdit={canEdit} />
      <GroupPosts group={group} posts={posts} /> */}
    </Col>
  )
}

export function GroupPosts(props: { posts: Post[]; group: Group }) {
  const { posts, group } = props
  const [showCreatePost, setShowCreatePost] = useState(false)
  const user = useUser()

  const createPost = (
    <Modal size="xl" open={showCreatePost} setOpen={setShowCreatePost}>
      <div className="bg-canvas-0 w-full py-10">
        <CreatePostForm group={group} />
      </div>
    </Modal>
  )

  const postList = (
    <div className=" align-start w-full items-start">
      <Row className="flex justify-between">
        <Subtitle className="!my-0">Latest Posts</Subtitle>
        {user && (
          <Button onClick={() => setShowCreatePost(!showCreatePost)}>
            Add a Post
          </Button>
        )}
      </Row>

      <div className="mt-2">
        <PostCardList posts={posts} />
        {posts.length === 0 && (
          <div className="text-ink-500 text-center">No posts yet</div>
        )}
      </div>
    </div>
  )

  return showCreatePost ? createPost : postList
}

function GroupFeatured(props: {
  group: Group
  posts: Post[]
  canEdit: boolean
}) {
  const { group, posts, canEdit } = props
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

  if (!group.pinnedItems || group.pinnedItems.length == 0) return <></>

  return canEdit || (group.pinnedItems && group?.pinnedItems.length > 0) ? (
    <div className="relative">
      {canEdit && <Spacer h={12} />}
      <PinnedItems
        posts={posts}
        group={group}
        isEditable={canEdit}
        pinned={pinned}
        onDeleteClicked={onDeleteClicked}
        onSubmit={onSubmit}
        modalMessage={'Pin posts or markets to the overview of this group.'}
      />
    </div>
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
  groups?: Group[]
  modalMessage: string
}) {
  const {
    isEditable,
    pinned,
    onDeleteClicked,
    onSubmit,
    posts,
    group,
    groups,
    modalMessage,
  } = props
  const [editMode, setEditMode] = useState(false)
  const [open, setOpen] = useState(false)

  return pinned.length > 0 || isEditable ? (
    <div>
      <div className="absolute top-0 right-0 z-20 ">
        {isEditable && (
          <Button
            className="my-2"
            color="red"
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
                ADMIN: Edit Featured
              </>
            )}
          </Button>
        )}
      </div>
      <div>
        <Masonry
          breakpointCols={{ default: 2, 768: 1 }}
          className="-ml-4 flex w-auto"
          columnClassName="pl-4 bg-clip-padding"
        >
          {pinned.map((element, index) => (
            <div className="relative mb-4" key={index}>
              {element}

              {editMode && <CrossIcon onClick={() => onDeleteClicked(index)} />}
            </div>
          ))}
          {editMode && pinned.length < 6 && (
            <div className="py-2" key="plus-circle">
              <Row
                className={
                  'hover:bg-ink-100 relative gap-3 rounded-lg border-4 border-dotted p-2 hover:cursor-pointer'
                }
              >
                <button
                  className="flex w-full justify-center"
                  onClick={() => setOpen(true)}
                >
                  <PlusCircleIcon
                    className="text-ink-600 h-12 w-12"
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
          <div className={'text-md text-ink-600 my-4'}>{modalMessage}</div>
        }
        onSubmit={onSubmit}
        groups={groups}
      />
    </div>
  ) : (
    <></>
  )
}

function CrossIcon(props: { onClick: () => void }) {
  const { onClick } = props

  return (
    <div>
      <button className=" text-ink-500 hover:text-ink-700" onClick={onClick}>
        <div className="bg-ink-200 absolute top-0 left-0 right-0 bottom-0 bg-opacity-50">
          <XCircleIcon className="text-ink-600 h-12 w-12" />
        </div>
      </button>
    </div>
  )
}
