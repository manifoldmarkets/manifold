import { useState } from 'react'
import { Spacer } from 'web/components/layout/spacer'
import { Title } from 'web/components/widgets/title'
import { TextEditor, useTextEditor } from 'web/components/widgets/editor'
import Router from 'next/router'
import { Group } from 'common/group'
import { ExpandingInput } from 'web/components/widgets/expanding-input'
import { Button } from 'web/components/buttons/button'
import { useUser } from 'web/hooks/use-user'
import { linkClass } from 'web/components/widgets/site-link'
import clsx from 'clsx'
import Link from 'next/link'
import { api, APIError } from 'web/lib/api/api'
import { Page } from 'web/components/layout/page'
import { DAY_MS } from 'common/util/time'
import ShortToggle from 'web/components/widgets/short-toggle'
import { Row } from 'web/components/layout/row'
import { useAdmin } from 'web/hooks/use-admin'
import { BackButton } from 'web/components/contract/back-button'
import { Visibility } from 'common/contract'
import { InfoTooltip } from 'web/components/widgets/info-tooltip'
import { removeUndefinedProps } from 'common/util/object'

export async function getServerSideProps(context: any) {
  return {
    props: removeUndefinedProps({
      title: context.query?.title,
      content: context.query?.text,
    }),
  }
}

export default function CreatePostPage(props: {
  title?: string
  content?: string
}) {
  return (
    <Page trackPageView={'create post page'}>
      <CreatePostForm
        defaultTitle={props.title}
        defaultContent={props.content}
      />
    </Page>
  )
}

export function CreatePostForm(props: {
  group?: Group
  defaultContent?: string
  defaultTitle?: string
}) {
  const { group, defaultContent, defaultTitle } = props

  const [title, setTitle] = useState(defaultTitle || '')
  const [postVisibility, setPostVisibility] = useState<Visibility>('public')

  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isAnnouncement, setIsAnnouncement] = useState(false)
  const [isChangeLog, setIsChangeLog] = useState(false)

  const editor = useTextEditor({
    key: `post ${group?.id || ''}`,
    size: 'lg',
    defaultValue: defaultContent,
  })

  const isValid = editor && title.length > 0 && !editor.isEmpty

  const user = useUser()
  const isAdmin = useAdmin()
  const canCreate = user?.createdTime && Date.now() - user.createdTime > DAY_MS

  async function savePost(title: string) {
    if (!editor) return
    const newPost = {
      title: title,
      content: editor.getJSON(),
      groupId: group?.id,
      isAnnouncement,
      visibility: postVisibility,
      isChangeLog,
    }

    const result = await api('create-post', newPost).catch((e) => {
      if (e instanceof APIError) {
        if (e.message.includes('validating request')) {
          const details = e.details as { field: string; error: string }[]
          const detail = details[0]
          setError(`${detail.field}: ${detail.error}`)
        } else setError(e.message)
      } else {
        console.error(e)
        setError('There was an error creating the post, please try again')
      }
      return e
    })
    if (result.post) {
      editor.commands.clearContent(true)
      await Router.push(`/post/${result.post.slug}`)
    }
  }
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-3">
      <Title className="!mb-4">
        <BackButton /> Create post
      </Title>
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
                autoFocus
                maxLength={480}
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
              {isAdmin && (
                <>
                  <Row className="items-center gap-2 px-1 py-2">
                    <ShortToggle
                      colorMode="warning"
                      on={isAnnouncement}
                      setOn={setIsAnnouncement}
                    />
                    <span
                      className={clsx(
                        'mb-1',
                        isAnnouncement && 'text-scarlet-500'
                      )}
                    >
                      Announcement (sends a notification to all users)
                    </span>
                  </Row>
                  <Row className="items-center gap-2 px-1 py-2">
                    <ShortToggle on={isChangeLog} setOn={setIsChangeLog} />
                    <span className="mb-1">
                      Changelog (shows up on the{' '}
                      <Link
                        href="/posts?filter=changelog"
                        className={linkClass}
                      >
                        changelog page
                      </Link>
                      )
                    </span>
                  </Row>
                </>
              )}
              <Row className="items-center gap-2 px-1 py-2">
                <ShortToggle
                  on={postVisibility === 'public'}
                  setOn={(on) => setPostVisibility(on ? 'public' : 'unlisted')}
                />
                <span className="mb-1">
                  Publicly listed{' '}
                  <InfoTooltip text="Public posts show up on the browse and search pages. Unlisted posts are only visible via link." />
                </span>
              </Row>
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
        <div>
          <p>
            Due to high amounts of spam, posts can now only be created with
            accounts more than 1 day old. (Or with the API.)
          </p>
          <br />
          <p>
            Did you mean to{' '}
            <Link
              href="/create"
              className={clsx(linkClass, 'text-primary-700')}
            >
              create a market
            </Link>{' '}
            instead?
          </p>
        </div>
      )}
    </div>
  )
}
