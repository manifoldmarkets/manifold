import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Contract } from 'common/contract'
import { isSupporter } from 'common/supporter'
import {
  SocialPost,
  SocialPostSource,
  socialPostContentSchema,
  SOCIAL_POST_MAX_LENGTH,
  SOCIAL_POST_MAX_MARKETS,
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
    <div className="bg-canvas-0 w-full p-4" data-social-composer>
      <div className="flex items-start gap-3">
        <Avatar avatarUrl={user.avatarUrl} username={user.username} size="sm" />
        <div className="min-w-0 flex-1">
          <textarea
            aria-label={
              editing
                ? 'Edit post'
                : parentId
                ? 'Write a reply'
                : 'Write a post'
            }
            placeholder={parentId ? 'Write a reply…' : 'What’s on your mind?'}
            className="placeholder:text-ink-400 text-ink-900 w-full resize-y border-0 bg-transparent p-0 text-base focus:ring-0"
            rows={3}
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
                  className="border-ink-200 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
                >
                  <span className="grow">{m.question}</span>
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
          <div className="border-ink-100 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
            <button
              className="text-primary-700 flex items-center gap-1 text-sm disabled:opacity-40"
              disabled={saving || markets.length >= SOCIAL_POST_MAX_MARKETS}
              onClick={() => setSelecting(true)}
            >
              <PlusIcon className="h-4 w-4" /> Markets {markets.length}/
              {SOCIAL_POST_MAX_MARKETS}
            </button>
            <div className="flex items-center gap-3">
              <span
                className={
                  count > SOCIAL_POST_MAX_LENGTH
                    ? 'text-xs text-red-600'
                    : 'text-ink-400 text-xs'
                }
              >
                {count.toLocaleString()}/
                {SOCIAL_POST_MAX_LENGTH.toLocaleString('en-US')}
              </span>
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
