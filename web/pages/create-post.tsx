import { ShieldCheckIcon } from '@heroicons/react/solid'
import { useState } from 'react'

import { STARTING_BALANCE } from 'common/economy'
import { Group } from 'common/group'
import { Visibility } from 'common/contract'
import { hasAccountTrustSignal } from 'common/user'
import { formatMoney } from 'common/util/format'
import { removeUndefinedProps } from 'common/util/object'
import clsx from 'clsx'
import Link from 'next/link'
import Router from 'next/router'
import { Button } from 'web/components/buttons/button'
import { BackButton } from 'web/components/contract/back-button'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { Spacer } from 'web/components/layout/spacer'
import { ExpandingInput } from 'web/components/widgets/expanding-input'
import { TextEditor, useTextEditor } from 'web/components/widgets/editor'
import { InfoTooltip } from 'web/components/widgets/info-tooltip'
import ShortToggle from 'web/components/widgets/short-toggle'
import { linkClass } from 'web/components/widgets/site-link'
import { Title } from 'web/components/widgets/title'
import { useAdmin } from 'web/hooks/use-admin'
import { useUser } from 'web/hooks/use-user'
import { api, APIError } from 'web/lib/api/api'
import { track } from 'web/lib/service/analytics'

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
  const canCreate = user && hasAccountTrustSignal(user)

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
        <VerifyToCreatePost />
      )}
    </div>
  )
}

function VerifyToCreatePost() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleVerify = async () => {
    setLoading(true)
    setError(null)
    try {
      track('create post verification prompt: clicked')
      const response = await api('create-idenfy-session', {})
      window.location.href = response.redirectUrl
    } catch (e) {
      console.error('Failed to start verification:', e)
      setError(
        e instanceof APIError && e.code === 503
          ? e.message
          : 'Failed to start verification. Please try again.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <Col className="border-primary-300 bg-primary-50 items-center gap-3 rounded-lg border p-6">
      <ShieldCheckIcon className="text-primary-500 h-12 w-12" />
      <div className="text-ink-900 text-center text-lg font-semibold">
        Verify your identity to create posts
      </div>
      <div className="text-ink-600 max-w-md text-center text-sm">
        Complete a quick identity check (~2 min) to start posting. You'll also
        receive{' '}
        <span className="font-semibold">
          {formatMoney(STARTING_BALANCE, 'MANA')}
        </span>{' '}
        as a bonus.
      </div>
      {error && <div className="text-scarlet-500 text-sm">{error}</div>}
      <Button onClick={handleVerify} loading={loading}>
        Verify now
      </Button>
    </Col>
  )
}
