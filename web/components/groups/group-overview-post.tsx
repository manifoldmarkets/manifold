import {
  DotsVerticalIcon,
  LinkIcon,
  PencilIcon,
  TrashIcon,
  UserAddIcon,
} from '@heroicons/react/solid'
import { Editor, JSONContent } from '@tiptap/core'
import clsx from 'clsx'
import { Group } from 'common/group'
import { Post } from 'common/post'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { TextEditor, useTextEditor } from 'web/components/widgets/editor'
import { createPost } from 'web/lib/firebase/api'
import { deleteFieldFromGroup, updateGroup } from 'web/lib/firebase/groups'
import { deletePost, updatePost } from 'web/lib/firebase/posts'
import { Button } from '../buttons/button'
import { Col } from '../layout/col'
import { Modal, MODAL_CLASS, SCROLLABLE_MODAL_CLASS } from '../layout/modal'
import { Row } from '../layout/row'
import { Spacer } from '../layout/spacer'
import { Content } from '../widgets/editor'
import { ExpandableContent } from '../widgets/expandable-content'

function GroupAboutModalContent(props: {
  content: JSONContent | string
  groupName: string
}) {
  const { content, groupName } = props
  return (
    <Col className={clsx(MODAL_CLASS, SCROLLABLE_MODAL_CLASS)}>
      <div className="text-xl">About {groupName}</div>
      <Content content={content} />
    </Col>
  )
}

export function GroupOverviewPost(props: {
  group: Group
  isEditable: boolean
  post: Post | null
}) {
  const { group, isEditable, post } = props
  // const post = usePost(group.aboutPostId) ?? props.post
  if (post && post.content) {
    return (
      <Col className="group gap-2 px-4 py-2 lg:px-0">
        <div className=" text-gray-500">ABOUT</div>
        {isEditable && <EditableGroupAbout group={group} post={post} />}
        {!isEditable && (
          <ExpandableContent
            content={post.content}
            modalContent={
              <GroupAboutModalContent
                content={post.content}
                groupName={group.name}
              />
            }
          />
        )}
      </Col>
    )
  }
  return <></>
}

export async function savePost(
  editor: Editor | null,
  group: Group,
  post: Post | null
) {
  if (!editor) return
  const newPost = {
    title: group.name,
    subtitle: 'About post for the group',
    content: editor.getJSON(),
    isGroupAboutPost: true,
  }

  if (post == null) {
    const result = await createPost(newPost).catch((e) => {
      console.error(e)
      return e
    })
    await updateGroup(group, {
      aboutPostId: result.post.id,
    })
  } else {
    await updatePost(post, {
      content: newPost.content,
    })
  }
}

function EditableGroupAbout(props: { group: Group; post: Post }) {
  const { group, post } = props
  const [editing, setEditing] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const editor = useTextEditor({
    key: `about ${group.id}`,
    defaultValue: post?.content,
    size: 'lg',
  })

  return editing ? (
    <>
      <TextEditor editor={editor} />
      <Spacer h={2} />
      <Row className="w-full justify-end gap-2">
        <Button color="gray" onClick={() => setEditing(false)}>
          Cancel
        </Button>
        <Button
          onClick={async () => {
            await savePost(editor, group, post)
            setEditing(false)
          }}
        >
          Save
        </Button>
      </Row>
    </>
  ) : (
    <div className="relative">
      <Row className="absolute -top-8 right-0 transition-all group-hover:visible md:invisible">
        <Button
          color="gray-white"
          size="xs"
          onClick={() => {
            setEditing(true)
            editor?.commands.focus('end')
          }}
        >
          <PencilIcon className="inline h-4 w-4" />
        </Button>
        <Button
          color="gray-white"
          size="xs"
          onClick={() => {
            setDeleteOpen(true)
          }}
        >
          <TrashIcon className="text-scarlet-500 inline h-4 w-4" />
        </Button>
      </Row>
      <ExpandableContent
        content={post.content}
        modalContent={
          <GroupAboutModalContent
            content={post.content}
            groupName={group.name}
          />
        }
        className="rounded-md bg-white px-4 py-2"
      />
      <DeleteAboutModal
        deleteOpen={deleteOpen}
        setDeleteOpen={setDeleteOpen}
        post={post}
        group={group}
      />
    </div>
  )
}

function DeleteAboutModal(props: {
  deleteOpen: boolean
  setDeleteOpen: (open: boolean) => void
  post: Post | null
  group: Group
}) {
  const { deleteOpen, setDeleteOpen, post, group } = props
  const [deleteLoading, setDeleteLoading] = useState(false)
  async function deleteGroupAboutPost() {
    if (post == null) return
    await deletePost(post)
    await deleteFieldFromGroup(group, 'aboutPostId')
  }
  return (
    <Modal open={deleteOpen} setOpen={setDeleteOpen}>
      <Col className={MODAL_CLASS}>
        <div className="text-xl">
          Are you sure you want to delete the about section for {group.name}?
        </div>
        <div>
          If you change your mind in the future, the about section can always be
          added back under the more options button{' '}
        </div>
        <Row className="w-full items-center justify-between">
          <div className="h-5 w-1/2 bg-gray-200" />
          <Row className="gap-2">
            <Row className="bg items-center gap-0.5 rounded bg-gray-200 px-2 py-1 text-xs text-white">
              <UserAddIcon className="h-4 w-4" />
              Follow
            </Row>
            <LinkIcon className={clsx('h-5 w-5 text-gray-200')} />
            <div className="relative">
              <DotsVerticalIcon className="h-6 w-6 rounded p-1 text-gray-600" />
              <div className="bg-highlight-blue absolute top-0 bottom-0 right-0 left-0 animate-pulse rounded bg-opacity-40" />
            </div>
          </Row>
        </Row>
        <Row className="w-full justify-end gap-2">
          <Button color="gray" onClick={() => setDeleteOpen(false)}>
            Cancel
          </Button>
          <Button
            color="red"
            loading={deleteLoading}
            onClick={() => {
              setDeleteLoading(true)
              deleteGroupAboutPost()
              toast('About section deleted', {
                icon: <TrashIcon className={'h-5 w-5 text-red-500'} />,
              })
              setDeleteOpen(false)
            }}
          >
            Yes, delete about section
          </Button>
        </Row>
      </Col>
    </Modal>
  )
}
// function RichEditGroupAboutPost(props: { group: Group; post: Post | null }) {
//   const { group, post } = props
//   const [editing, setEditing] = useState(false)

//   const editor = useTextEditor({
//     key: `about ${group.id}`,
//     defaultValue: post?.content,
//     size: 'lg',
//   })

//   async function savePost() {
//     if (!editor) return
//     const newPost = {
//       title: group.name,
//       subtitle: 'About post for the group',
//       content: editor.getJSON(),
//       isGroupAboutPost: true,
//     }

//     if (post == null) {
//       const result = await createPost(newPost).catch((e) => {
//         console.error(e)
//         return e
//       })
//       await updateGroup(group, {
//         aboutPostId: result.post.id,
//       })
//     } else {
//       await updatePost(post, {
//         content: newPost.content,
//       })
//     }
//   }

//   async function deleteGroupAboutPost() {
//     if (post == null) return
//     await deletePost(post)
//     await deleteFieldFromGroup(group, 'aboutPostId')
//   }

//   return editing ? (
//     <>
//       <TextEditor editor={editor} />
//       <Spacer h={2} />
//       <Row className="gap-2">
//         <Button
//           onClick={async () => {
//             await savePost()
//             setEditing(false)
//           }}
//         >
//           Save
//         </Button>
//         <Button color="gray" onClick={() => setEditing(false)}>
//           Cancel
//         </Button>
//       </Row>
//     </>
//   ) : (
//     <>
//       {post == null ? (
//         <div className="flex justify-center">
//           <Button onClick={() => setEditing(true)}>
//             <PlusIcon className="mr-3 h-5" /> Add about section
//           </Button>
//         </div>
//       ) : (
//         <RichEditPost post={post} canEdit={true}>
//           <Button
//             color="gray-white"
//             size="2xs"
//             onClick={() => {
//               deleteGroupAboutPost()
//             }}
//           >
//             <TrashIcon className="text-scarlet-500 inline h-5 w-5" />
//           </Button>
//         </RichEditPost>
//       )}
//     </>
//   )
// }
