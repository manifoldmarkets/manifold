import { PencilIcon, PlusIcon, TrashIcon } from '@heroicons/react/solid'
import { Editor, JSONContent } from '@tiptap/core'
import clsx from 'clsx'
import { Group } from 'common/group'
import { Post } from 'common/post'
import { group } from 'console'
import { useState } from 'react'
import { TextEditor, useTextEditor } from 'web/components/widgets/editor'
import { createPost } from 'web/lib/firebase/api'
import { deleteFieldFromGroup, updateGroup } from 'web/lib/firebase/groups'
import { deletePost, updatePost } from 'web/lib/firebase/posts'
import { RichEditPost } from 'web/pages/post/[...slugs]'
import { Button } from '../buttons/button'
import { Col } from '../layout/col'
import { MODAL_CLASS, SCROLLABLE_MODAL_CLASS } from '../layout/modal'
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
      <div className="group rounded-lg bg-white px-4 py-2 drop-shadow-sm">
        <div className="font-semibold">About</div>
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
      </div>
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

  const editor = useTextEditor({
    key: `about ${group.id}`,
    defaultValue: post?.content,
    size: 'lg',
  })

  async function deleteGroupAboutPost() {
    if (post == null) return
    await deletePost(post)
    await deleteFieldFromGroup(group, 'aboutPostId')
  }

  return editing ? (
    <>
      <TextEditor editor={editor} />
      <Spacer h={2} />
      <Row className="gap-2">
        <Button
          onClick={async () => {
            await savePost(editor, group, post)
            setEditing(false)
          }}
        >
          Save
        </Button>
        <Button color="gray" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </Row>
    </>
  ) : (
    <div className="relative">
      <Row className="absolute -top-6 right-0 transition-all group-hover:visible md:invisible">
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
            deleteGroupAboutPost()
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
      />
    </div>
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
