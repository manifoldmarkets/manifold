import { Row } from '../layout/row'
import { Content } from '../editor'
import { TextEditor, useTextEditor } from 'web/components/editor'
import { Button } from '../button'
import { Spacer } from '../layout/spacer'
import { Group } from 'common/group'
import { deleteFieldFromGroup, updateGroup } from 'web/lib/firebase/groups'
import PencilIcon from '@heroicons/react/solid/PencilIcon'
import { DocumentRemoveIcon, TrashIcon } from '@heroicons/react/solid'
import { createPost } from 'web/lib/firebase/api'
import { Post } from 'common/post'
import { deletePost, updatePost } from 'web/lib/firebase/posts'
import { useState } from 'react'
import { usePost } from 'web/hooks/use-post'
import { Col } from '../layout/col'

export function GroupOverviewPost(props: {
  group: Group
  isEditable: boolean
  post: Post | null
}) {
  const { group, isEditable } = props
  const post = usePost(group.aboutPostId) ?? props.post

  return (
    <div className="rounded-md bg-white p-4 ">
      {isEditable && <RichEditGroupAboutPost group={group} post={post} />}
      {!isEditable && post && <Content content={post.content} />}
    </div>
  )
}

function RichEditGroupAboutPost(props: { group: Group; post: Post | null }) {
  const { group, post } = props
  const [editing, setEditing] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const { editor, upload } = useTextEditor({
    defaultValue: post?.content,
    disabled: isSubmitting,
  })

  async function savePost() {
    if (!editor) return
    const newPost = {
      title: group.name,
      subtitle: 'About post for the group',
      content: editor.getJSON(),
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

  async function deleteGroupAboutPost() {
    if (post == null) return
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
      {post == null ? (
        <div className="text-center text-gray-500">
          <p className="text-sm">
            No post has been added yet.
            <Spacer h={2} />
            <Button onClick={() => setEditing(true)}>Add a post</Button>
          </p>
        </div>
      ) : (
        <Col>
          <Content content={post.content} />
          <Row className="place-content-end">
            <Button
              color="gray-white"
              size="2xs"
              onClick={() => {
                setEditing(true)
                editor?.commands.focus('end')
              }}
            >
              <PencilIcon className="inline h-5 w-5" />
            </Button>

            <Button
              color="gray-white"
              size="2xs"
              onClick={() => {
                deleteGroupAboutPost()
              }}
            >
              <TrashIcon className="inline h-5 w-5" />
            </Button>
          </Row>
        </Col>
      )}
    </>
  )
}
