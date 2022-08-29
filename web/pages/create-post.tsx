import { useState } from 'react'
import { Spacer } from 'web/components/layout/spacer'
import { Page } from 'web/components/page'
import { Title } from 'web/components/title'
import Textarea from 'react-expanding-textarea'

import { TextEditor, useTextEditor } from 'web/components/editor'
import { createPost } from 'web/lib/firebase/api'
import clsx from 'clsx'
import Router from 'next/router'
import { MAX_POST_TITLE_LENGTH } from 'common/post'
import { postPath } from 'web/lib/firebase/posts'

export default function CreatePost() {
  const [title, setTitle] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const { editor, upload } = useTextEditor({
    disabled: isSubmitting,
  })

  const isValid = editor && title.length > 0 && editor.isEmpty === false

  async function savePost(title: string) {
    if (!editor) return
    const newPost = {
      title: title,
      content: editor.getJSON(),
    }

    const result = await createPost(newPost).catch((e) => {
      console.log(e)
      setError('There was an error creating the post, please try again')
      return e
    })
    if (result.post) {
      await Router.push(postPath(result.post.slug))
    }
  }

  return (
    <Page>
      <div className="mx-auto w-full max-w-2xl">
        <div className="rounded-lg px-6 py-4 sm:py-0">
          <Title className="!mt-0" text="Create a post" />
          <form>
            <div className="form-control w-full">
              <label className="label">
                <span className="mb-1">
                  Title<span className={'text-red-700'}> *</span>
                </span>
              </label>
              <Textarea
                placeholder="e.g. Elon Mania Post"
                className="input input-bordered resize-none"
                autoFocus
                maxLength={MAX_POST_TITLE_LENGTH}
                value={title}
                onChange={(e) => setTitle(e.target.value || '')}
              />
              <Spacer h={6} />
              <label className="label">
                <span className="mb-1">
                  Content<span className={'text-red-700'}> *</span>
                </span>
              </label>
              <TextEditor editor={editor} upload={upload} />
              <Spacer h={6} />

              <button
                type="submit"
                className={clsx(
                  'btn btn-primary normal-case',
                  isSubmitting && 'loading disabled'
                )}
                disabled={isSubmitting || !isValid || upload.isLoading}
                onClick={async () => {
                  setIsSubmitting(true)
                  await savePost(title)
                  setIsSubmitting(false)
                }}
              >
                {isSubmitting ? 'Creating...' : 'Create a post'}
              </button>
              {error !== '' && <div className="text-red-700">{error}</div>}
            </div>
          </form>
        </div>
      </div>
    </Page>
  )
}
