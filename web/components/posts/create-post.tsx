import { useState } from 'react'
import { Spacer } from 'web/components/layout/spacer'
import { Title } from 'web/components/widgets/title'
import { TextEditor, useTextEditor } from 'web/components/widgets/editor'
import { createPost } from 'web/lib/firebase/api'
import Router from 'next/router'
import { MAX_POST_TITLE_LENGTH } from 'common/post'
import { postPath } from 'web/lib/supabase/post'
import { Group } from 'common/group'
import { ExpandingInput } from '../widgets/expanding-input'
import { Button } from '../buttons/button'
import { useUser } from 'web/hooks/use-user'
import { linkClass, SiteLink } from '../widgets/site-link'
import clsx from 'clsx'

export function CreatePostForm(props: { group?: Group }) {
  const [title, setTitle] = useState('')

  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const { group } = props

  const editor = useTextEditor({
    key: `post ${group?.id || ''}`,
    size: 'lg',
  })

  const isValid = editor && title.length > 0 && !editor.isEmpty

  const user = useUser()
  const canCreate =
    user?.createdTime &&
    Date.now() - user.createdTime > 30 * 24 * 60 * 60 * 1000

  async function savePost(title: string) {
    if (!editor) return
    const newPost = {
      title: title,
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
    <div className="mx-auto w-full max-w-3xl px-4">
      <Title>Create a post</Title>
      {canCreate ? (
        <>
          <form>
            <div className="flex w-full flex-col">
              <label className="px-1 py-2">
                <span className="mb-1">
                  Title<span className={'text-scarlet-500'}> *</span>
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
              <label className="px-1 py-2">
                <span className="mb-1">
                  Content<span className={'text-scarlet-500'}> *</span>
                </span>
              </label>
              <TextEditor editor={editor} />
              <Spacer h={6} />

              {error !== '' && <div className="text-scarlet-500">{error}</div>}
            </div>
          </form>
          <Button
            type="submit"
            size="xl"
            loading={isSubmitting}
            disabled={!isValid || editor.storage.upload.mutation.isLoading}
            onClick={async () => {
              setIsSubmitting(true)
              await savePost(title)
              setIsSubmitting(false)
            }}
          >
            {isSubmitting ? 'Creating...' : 'Create post'}
          </Button>
        </>
      ) : (
        <div className="">
          <p>
            Due to high amounts of spam, posts can now only be created with
            accounts more than 30 days old. (Or with the API.)
          </p>
          <br />
          <p>
            Did you mean to{' '}
            <SiteLink
              href="/create"
              className={clsx(linkClass, 'text-primary-700')}
            >
              create a market
            </SiteLink>{' '}
            instead?
          </p>
        </div>
      )}
    </div>
  )
}
