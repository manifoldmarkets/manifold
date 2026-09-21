import { SocialQuoteCard } from './social-quote-card'
import { useSocialComposerDraft } from './social-reply-drafts'
import { SocialEditor } from './social-editor'
import { useRef, useState } from 'react'
import Link from 'next/link'
import { toast } from 'react-hot-toast'
import { Contract } from 'common/contract'
import { isSupporter } from 'common/supporter'
import {
  SocialPost,
  SocialPostSource,
  SocialQuote,
  socialPostDraftSchema,
  SOCIAL_POST_MAX_LENGTH,
  SOCIAL_POST_MAX_MARKETS,
  SOCIAL_POST_MAX_IMAGES,
  socialPostPath,
} from 'common/social-post'
import { Button } from '../buttons/button'
import { SelectMarkets } from '../contract-select-modal'
import { Modal } from '../layout/modal'
import { Avatar } from '../widgets/avatar'
import { useUser } from 'web/hooks/use-user'
import { api } from 'web/lib/api/api'
import { firebaseLogin } from 'web/lib/firebase/users'
import { uploadPublicImage } from 'web/lib/firebase/storage'
import {
  ChatAlt2Icon,
  PhotographIcon,
  PlusIcon,
  XIcon,
} from '@heroicons/react/outline'

export function SocialComposer(props: {
  parentId?: string
  editing?: SocialPost
  initialMarkets?: Contract[]
  initialText?: string
  source?: SocialPostSource
  quote?: SocialQuote
  onPosted: (post: SocialPost) => void
  onCancel?: () => void
  focusOnMount?: boolean
}) {
  const { parentId, editing, source, onPosted, onCancel } = props
  const user = useUser()
  const fileInput = useRef<HTMLInputElement>(null)
  const { draft, setField, clear } = useSocialComposerDraft(
    {
      text: editing?.text ?? props.initialText ?? '',
      richContent: editing?.richContent,
      markets: editing?.markets ?? props.initialMarkets ?? [],
      images: editing?.imageUrls ?? [],
    },
    editing ? undefined : parentId
  )
  const {
    text,
    richContent,
    markets,
    images,
    uploading,
    saving,
    error,
    submitting,
  } = draft
  const localImages = draft.localImages
  const [selecting, setSelecting] = useState(false)
  const isPostRepost =
    !!(source && 'postId' in source) || editing?.source?.kind === 'post'
  const quote = props.quote ?? editing?.source
  const shownQuote =
    quote &&
    (!quote.contractId || markets.some((m) => m.id === quote.contractId))
      ? quote
      : undefined
  const count = [...text.trim()].length
  const eligible = !!editing || isSupporter(user?.entitlements)
  const canSubmit =
    count <= SOCIAL_POST_MAX_LENGTH &&
    !!(count || markets.length || images.length || isPostRepost)
  function addImages(files: File[]) {
    if (!user || submitting.current || !files.length) return
    setField('error', undefined)
    if (images.length + files.length > SOCIAL_POST_MAX_IMAGES) {
      setField('error', `Attach up to ${SOCIAL_POST_MAX_IMAGES} images.`)
      return
    }
    if (
      files.some(
        (file) =>
          !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(
            file.type
          )
      )
    ) {
      setField('error', 'Choose JPEG, PNG, WebP, or GIF images.')
      return
    }
    if (files.some((file) => file.size > 20 * 1024 ** 2)) {
      setField('error', 'Each image must be 20 MB or smaller.')
      return
    }
    const urls = files.map((file) => {
      const url = URL.createObjectURL(file)
      localImages.set(url, { file })
      return url
    })
    setField('images', (previous) => [...previous, ...urls])
  }
  async function submit() {
    if (!canSubmit || !user || submitting.current) return
    submitting.current = true
    setField('saving', true)
    setField('error', undefined)
    try {
      setField(
        'uploading',
        images.some((url) => localImages.has(url))
      )
      const uploads = await Promise.allSettled(
        images.map(async (url) => {
          const local = localImages.get(url)
          if (!local) return url
          // Reuse completed uploads if posting fails and the user retries.
          local.uploadedUrl ??= await uploadPublicImage(
            user.username,
            local.file,
            'yap'
          )
          return local.uploadedUrl
        })
      )
      setField('uploading', false)
      const imageUrls = uploads.map((result) => {
        if (result.status === 'rejected') throw result.reason
        return result.value
      })
      const content = socialPostDraftSchema.parse({
        text,
        richContent,
        marketIds: markets.map((m) => m.id),
        imageUrls,
      })
      const post = editing
        ? await api('edit-social-post', {
            id: editing.id,
            content,
          })
        : await api('create-social-post', {
            content,
            parentId,
            source:
              source &&
              ('postId' in source ||
                markets.some((m) => m.id === source.contractId))
                ? source
                : undefined,
          })
      clear()
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
      setField('error', e instanceof Error ? e.message : String(e))
    } finally {
      submitting.current = false
      setField('uploading', false)
      setField('saving', false)
    }
  }
  if (!user || !eligible)
    return (
      <div className="bg-canvas-50 border-ink-200 flex items-center gap-3 rounded-xl border p-4">
        <ChatAlt2Icon className="text-primary-500 h-8 w-8 shrink-0" />
        <div className="grow text-sm">
          <p className="text-ink-900 font-semibold">Join the conversation</p>
          <p className="text-ink-500">
            Members can post and reply. All signed-in users can read and like.
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
          <SocialEditor
            ariaLabel={
              editing
                ? 'Edit post'
                : parentId
                ? 'Write a reply'
                : 'Write a post'
            }
            placeholder={
              parentId
                ? 'Write a reply…'
                : quote
                ? 'Add a comment (optional)…'
                : 'What’s on your mind?'
            }
            text={text}
            value={richContent}
            onChange={(content, plainText) => {
              setField('richContent', content)
              setField('text', plainText)
            }}
            onImages={addImages}
            onSubmit={() => void submit()}
            focusOnMount={props.focusOnMount}
            disabled={saving}
          />
          {!!images.length && (
            <div className="mb-3 flex flex-wrap gap-2">
              {images.map((url, index) => (
                <div
                  key={url}
                  className="bg-canvas-50 relative h-20 w-20 overflow-hidden rounded-lg"
                >
                  <img
                    src={url}
                    alt={`Attachment ${index + 1}`}
                    className="h-full w-full object-cover"
                  />
                  <button
                    aria-label={`Remove image ${index + 1}`}
                    disabled={saving || uploading}
                    onClick={() => {
                      URL.revokeObjectURL(url)
                      localImages.delete(url)
                      setField(
                        'images',
                        images.filter((_, i) => i !== index)
                      )
                    }}
                    className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white"
                  >
                    <XIcon className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {uploading && (
            <p role="status" className="text-ink-600 mb-2 text-sm">
              Uploading images…
            </p>
          )}
          {shownQuote && <SocialQuoteCard quote={shownQuote} />}
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
                      setField(
                        'markets',
                        markets.filter((c) => c.id !== m.id)
                      )
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
            <div className="flex items-center gap-1">
              <button
                className="text-primary-700 hover:bg-primary-500/10 -ml-2 flex items-center gap-1 rounded-full px-2 py-2 text-sm transition-colors disabled:opacity-40"
                disabled={saving || markets.length >= SOCIAL_POST_MAX_MARKETS}
                onClick={() => setSelecting(true)}
              >
                <PlusIcon className="h-4 w-4" /> Markets
              </button>
              <input
                ref={fileInput}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                multiple
                className="hidden"
                aria-label="Upload images"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? [])
                  e.target.value = ''
                  void addImages(files)
                }}
              />
              <button
                title={`Add up to ${SOCIAL_POST_MAX_IMAGES} images`}
                className="text-primary-700 hover:bg-primary-500/10 flex items-center gap-1 rounded-full px-2 py-2 text-sm transition-colors disabled:opacity-40"
                disabled={
                  saving || uploading || images.length >= SOCIAL_POST_MAX_IMAGES
                }
                onClick={() => fileInput.current?.click()}
              >
                <PhotographIcon className="h-4 w-4" /> Images
              </button>
            </div>
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
                  disabled={saving || uploading}
                  onClick={() => {
                    clear()
                    onCancel()
                  }}
                >
                  Cancel
                </Button>
              )}
              <Button
                size="sm"
                className="min-w-[76px] !rounded-full font-semibold"
                disabled={!canSubmit || saving || uploading}
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
              setField('markets', selected)
              setSelecting(false)
            }}
          />
        </div>
      </Modal>
    </div>
  )
}
