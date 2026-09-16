import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Textarea from 'react-expanding-textarea'
import { toast } from 'react-hot-toast'
import { Contract } from 'common/contract'
import { isSupporter } from 'common/supporter'
import {
  SocialPost,
  SocialPostSource,
  socialPostContentSchema,
  SOCIAL_POST_MAX_LENGTH,
  SOCIAL_POST_MAX_MARKETS,
  socialPostPath,
} from 'common/social-post'
import { Button } from '../buttons/button'
import { SelectMarkets } from '../contract-select-modal'
import { Modal } from '../layout/modal'
import { Avatar } from '../widgets/avatar'
import { useUser } from 'web/hooks/use-user'
import { api } from 'web/lib/api/api'
import { firebaseLogin } from 'web/lib/firebase/users'
import { ChatAlt2Icon, PlusIcon, XIcon } from '@heroicons/react/outline'

export function SocialComposer(props: {
  parentId?: string
  editing?: SocialPost
  initialMarkets?: Contract[]
  initialText?: string
  source?: SocialPostSource
  onPosted: (post: SocialPost) => void
  onCancel?: () => void
  focusOnMount?: boolean
}) {
  const { parentId, editing, source, onPosted, onCancel } = props
  const user = useUser()
  const input = useRef<HTMLTextAreaElement>(null)
  const [text, setText] = useState(editing?.text ?? props.initialText ?? '')
  const [markets, setMarkets] = useState(
    editing?.markets ?? props.initialMarkets ?? []
  )
  const [selecting, setSelecting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  const count = [...text.trim()].length
  const eligible = !!editing || isSupporter(user?.entitlements)
  useEffect(() => {
    if (props.focusOnMount) input.current?.focus()
  }, [props.focusOnMount, user?.id])
  const parsed = socialPostContentSchema.safeParse({
    text,
    marketIds: markets.map((m) => m.id),
  })
  async function submit() {
    if (!parsed.success || saving) return
    setSaving(true)
    setError(undefined)
    try {
      const post = editing
        ? await api('edit-social-post', {
            id: editing.id,
            content: parsed.data,
          })
        : await api('create-social-post', {
            content: parsed.data,
            parentId,
            source:
              source && markets.some((m) => m.id === source.contractId)
                ? source
                : undefined,
          })
      setText('')
      setMarkets([])
      toast.success(
        <span>
          {editing
            ? 'Post updated.'
            : parentId
            ? 'Reply posted.'
            : 'Posted to Yap.'}{' '}
          <Link
            className="text-primary-700 underline"
            href={socialPostPath(post.id)}
          >
            View post
          </Link>
        </span>
      )
      onPosted(post)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }
  if (!user || !eligible)
    return (
      <div className="bg-canvas-50 border-ink-200 flex items-center gap-3 rounded-xl border p-4">
        <ChatAlt2Icon className="text-primary-500 h-8 w-8 shrink-0" />
        <div className="grow text-sm">
          <p className="text-ink-900 font-semibold">Join the conversation</p>
          <p className="text-ink-500">
            Members can post and reply. Everyone can read and like.
          </p>
        </div>
        {user ? (
          <Link
            className="text-primary-700 text-sm font-semibold"
            href="/membership"
          >
            Become a member
          </Link>
        ) : (
          <Button size="sm" onClick={firebaseLogin}>
            Sign in
          </Button>
        )}
      </div>
    )
  return (
    <div className="bg-canvas-0 w-full px-4 py-3" data-social-composer>
      <div className="flex items-start gap-3">
        <Avatar avatarUrl={user.avatarUrl} username={user.username} size="sm" />
        <div className="min-w-0 flex-1">
          <Textarea
            aria-label={
              editing
                ? 'Edit post'
                : parentId
                ? 'Write a reply'
                : 'Write a post'
            }
            placeholder={parentId ? 'Write a reply…' : 'What’s on your mind?'}
            className="bg-canvas-50 border-ink-300 placeholder:text-ink-600 text-ink-900 focus:border-primary-500 focus:ring-primary-500 mb-3 w-full resize-none rounded-2xl border p-3 text-base transition-colors focus:outline-none focus:ring-1"
            rows={2}
            value={text}
            onChange={(e) => setText(e.target.value)}
            ref={input}
            disabled={saving}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault()
                void submit()
              }
            }}
          />
          {!!markets.length && (
            <div className="my-3 space-y-2">
              {markets.map((m) => (
                <div
                  key={m.id}
                  className="border-ink-200 dark:border-ink-300 flex items-center gap-3 rounded-2xl border p-4 text-sm"
                >
                  <div className="min-w-0 grow">
                    <span className="text-ink-600 mb-1 block text-xs">
                      Market
                    </span>
                    <span className="text-ink-900 break-words font-medium">
                      {m.question}
                    </span>
                  </div>
                  <button
                    aria-label={`Remove ${m.question}`}
                    disabled={saving}
                    onClick={() =>
                      setMarkets(markets.filter((c) => c.id !== m.id))
                    }
                  >
                    <XIcon className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {error && (
            <p role="alert" className="mb-2 text-sm text-red-600">
              {error}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              className="text-primary-700 hover:bg-primary-500/10 -ml-2 flex items-center gap-1 rounded-full px-2 py-2 text-sm transition-colors disabled:opacity-40"
              disabled={saving || markets.length >= SOCIAL_POST_MAX_MARKETS}
              onClick={() => setSelecting(true)}
            >
              <PlusIcon className="h-4 w-4" /> Markets
            </button>
            <div className="flex items-center gap-3">
              {count >= SOCIAL_POST_MAX_LENGTH * 0.9 && (
                <span
                  role="status"
                  className={
                    count > SOCIAL_POST_MAX_LENGTH
                      ? 'text-xs text-red-600'
                      : 'text-ink-500 dark:text-ink-600 text-xs tabular-nums'
                  }
                >
                  {count.toLocaleString()}/
                  {SOCIAL_POST_MAX_LENGTH.toLocaleString('en-US')}
                </span>
              )}
              {onCancel && (
                <Button
                  color="gray"
                  size="xs"
                  disabled={saving}
                  onClick={onCancel}
                >
                  Cancel
                </Button>
              )}
              <Button
                size="sm"
                className="min-w-[76px] !rounded-full font-semibold"
                disabled={!parsed.success || saving}
                loading={saving}
                onClick={submit}
              >
                {editing ? 'Save' : parentId ? 'Reply' : 'Post'}
              </Button>
            </div>
          </div>
        </div>
      </div>
      <Modal open={selecting} setOpen={setSelecting}>
        <div className="bg-canvas-0 rounded-xl p-4">
          <h2 className="mb-3 text-lg font-semibold">
            Attach up to {SOCIAL_POST_MAX_MARKETS} markets
          </h2>
          <SelectMarkets
            initialContracts={markets}
            maxSelections={SOCIAL_POST_MAX_MARKETS}
            publicOnly
            onCancel={() => setSelecting(false)}
            submitLabel={(n) => `Attach ${n} market${n === 1 ? '' : 's'}`}
            onSubmit={(selected) => {
              setMarkets(selected)
              setSelecting(false)
            }}
          />
        </div>
      </Modal>
    </div>
  )
}
