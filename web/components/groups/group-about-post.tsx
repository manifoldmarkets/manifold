import { Row } from '../layout/row'
import { Content } from '../editor'
import { TextEditor, useTextEditor } from 'web/components/editor'
import { Button } from '../button'
import { Spacer } from '../layout/spacer'
import { Group } from 'common/group'
import { deleteFieldFromGroup, updateGroup } from 'web/lib/firebase/groups'
import PencilIcon from '@heroicons/react/solid/PencilIcon'
import { DocumentRemoveIcon } from '@heroicons/react/solid'
import { createPost } from 'web/lib/firebase/api'
import { Post } from 'common/post'
import { deletePost, updatePost } from 'web/lib/firebase/posts'
import { useState } from 'react'
import { usePost } from 'web/hooks/use-post'

export function GroupAboutPost(props: {
  group: Group
  isEditable: boolean
  post: Post
}) {
  const { group, isEditable } = props
  const post = usePost(group.aboutPostId) ?? props.post

  return (
    <div className="rounded-md bg-white p-4">
      {isEditable ? (
        <RichEditGroupAboutPost group={group} post={post} />
      ) : (
        <Content content={post.content} />
      )}
    </div>
  )
}

function RichEditGroupAboutPost(props: { group: Group; post: Post }) {
  const { group, post } = props
  const [editing, setEditing] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const { editor, upload } = useTextEditor({
    defaultValue: post.content,
    disabled: isSubmitting,
  })

  async function savePost() {
    if (!editor) return
    const newPost = {
      title: group.name,
      content: editor.getJSON(),
    }

    if (group.aboutPostId == null) {
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

  async function deleteGroupAboutPost() {
    await deletePost(post)
    await deleteFieldFromGroup(group, 'aboutPostId')
  }

  return editing ? (
    <>
      <TextEditor editor={editor} upload={upload} />
      <Spacer h={2} />
      <Row className="gap-2">
        <Button
          onClick={async () => {
            setIsSubmitting(true)
            await savePost()
            setEditing(false)
            setIsSubmitting(false)
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
    <>
      {group.aboutPostId == null ? (
        <div className="text-center text-gray-500">
          <p className="text-sm">
            No post has been added yet.
            <Spacer h={2} />
            <Button onClick={() => setEditing(true)}>Add a post</Button>
          </p>
        </div>
      ) : (
        <div className="relative">
          <div className="absolute top-0 right-0 z-10 space-x-2">
            <Button
              color="gray"
              size="xs"
              onClick={() => {
                setEditing(true)
                editor?.commands.focus('end')
              }}
            >
              <PencilIcon className="inline h-4 w-4" />
              Edit
            </Button>

            <Button
              color="gray"
              size="xs"
              onClick={() => {
                deleteGroupAboutPost()
              }}
            >
              <DocumentRemoveIcon className="inline h-4 w-4" />
              Delete
            </Button>
          </div>

          <Content content={post.content} />
          <Spacer h={2} />
        </div>
      )}
    </>
  )
}
