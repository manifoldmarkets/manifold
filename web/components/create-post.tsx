import { useState } from 'react'
import { Spacer } from 'web/components/layout/spacer'
import { Title } from 'web/components/title'

import { TextEditor, useTextEditor } from 'web/components/editor'
import { createPost } from 'web/lib/firebase/api'
import Router from 'next/router'
import { MAX_POST_TITLE_LENGTH } from 'common/post'
import { postPath } from 'web/lib/firebase/posts'
import { Group } from 'common/group'
import { ExpandingInput } from './expanding-input'
import { Button } from './button'

export function CreatePost(props: { group?: Group }) {
  const [title, setTitle] = useState('')
  const [subtitle, setSubtitle] = useState('')

  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const { group } = props

  const { editor, upload } = useTextEditor({
    key: `post ${group?.id || ''}`,
    disabled: isSubmitting,
  })

  const isValid =
    editor &&
    title.length > 0 &&
    subtitle.length > 0 &&
    editor.isEmpty === false

  async function savePost(title: string) {
    if (!editor) return
    const newPost = {
      title: title,
      subtitle: subtitle,
      content: editor.getJSON(),
      groupId: group?.id,
    }

    const result = await createPost(newPost).catch((e) => {
      console.log(e)
      setError('There was an error creating the post, please try again')
      return e
    })
    if (result.post) {
      editor.commands.clearContent(true)
      await Router.push(postPath(result.post.slug))
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="rounded-lg px-6 py-4 sm:py-0">
        <Title className="!mt-0" text="Create a post" />
        <form>
          <div className="form-control w-full">
            <label className="label">
              <span className="mb-1">
                Title<span className={'text-red-700'}> *</span>
              </span>
            </label>
            <ExpandingInput
              placeholder="e.g. Elon Mania Post"
              autoFocus
              maxLength={MAX_POST_TITLE_LENGTH}
              value={title}
              onChange={(e) => setTitle(e.target.value || '')}
            />
            <Spacer h={6} />
            <label className="label">
              <span className="mb-1">
                Subtitle<span className={'text-red-700'}> *</span>
              </span>
            </label>
            <ExpandingInput
              placeholder="e.g. How Elon Musk is getting everyone's attention"
              autoFocus
              maxLength={MAX_POST_TITLE_LENGTH}
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value || '')}
            />
            <Spacer h={6} />
            <label className="label">
              <span className="mb-1">
                Content<span className={'text-red-700'}> *</span>
              </span>
            </label>
            <TextEditor editor={editor} upload={upload} />
            <Spacer h={6} />

            <Button
              type="submit"
              loading={isSubmitting}
              size="xl"
              disabled={isSubmitting || !isValid || upload.isLoading}
              onClick={async () => {
                setIsSubmitting(true)
                await savePost(title)
                setIsSubmitting(false)
              }}
            >
              {isSubmitting ? 'Creating...' : 'Create a post'}
            </Button>
            {error !== '' && <div className="text-red-700">{error}</div>}
          </div>
        </form>
      </div>
    </div>
  )
}
