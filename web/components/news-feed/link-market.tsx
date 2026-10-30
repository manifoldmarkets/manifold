import { Popover, PopoverButton, PopoverPanel } from '@headlessui/react'
import { CheckCircleIcon, XIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { LiteMarket } from 'common/api/market-types'
import { canLinkNewsMarkets } from 'common/news-feed'
import { Button } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { useUser } from 'web/hooks/use-user'
import { api } from 'web/lib/api/api'
import { firebaseLogin } from 'web/lib/firebase/users'
import { litePrice, useMarketSearch } from './market-search'
import { trackNews } from './news-events'

const TRIGGER = 'hover:text-primary-700 underline-offset-2 hover:underline'

/**
 * "Missing a market? Link one." A member searches open markets and puts the
 * one they pick under the story's related outlook, for every reader at once.
 * Signed-out readers are sent to sign in; signed-in non-members are shown
 * where membership is. The server applies the same rule.
 */
export function LinkMarket(props: { storyId: string; onAttached: () => void }) {
  const { storyId, onAttached } = props
  const user = useUser()

  if (!user) {
    return (
      <button
        type="button"
        className={TRIGGER}
        onClick={() => {
          trackNews('news link open', { storyId, signedIn: false })
          firebaseLogin()
        }}
      >
        Missing a market? Link one
      </button>
    )
  }

  const member = canLinkNewsMarkets(user.entitlements)
  return (
    <Popover className="relative">
      {({ open }) => (
        <>
          <PopoverButton
            className={clsx(
              'focus-visible:ring-primary-500 rounded outline-none focus-visible:ring-2',
              TRIGGER
            )}
            onClick={() => {
              if (!open) trackNews('news link open', { storyId, member })
            }}
          >
            Missing a market? Link one
          </PopoverButton>
          <PopoverPanel
            anchor={{ to: 'bottom end', gap: 6, padding: 12 }}
            className="bg-canvas-0 border-ink-200 z-50 w-[19rem] rounded-lg border p-3 shadow-lg"
          >
            {({ close }) =>
              member ? (
                <LinkForm
                  storyId={storyId}
                  onAttached={onAttached}
                  close={close}
                />
              ) : (
                <MembersOnly close={close} />
              )
            }
          </PopoverPanel>
        </>
      )}
    </Popover>
  )
}

function MembersOnly(props: { close: () => void }) {
  return (
    <Col className="gap-2.5">
      <div className="text-ink-900 text-sm font-semibold">
        Members link markets
      </div>
      <p className="text-ink-600 text-xs leading-snug">
        A linked market shows on this story for every reader, so linking comes
        with membership. Every tier includes it.
      </p>
      <Row className="items-center justify-end gap-3">
        <Button size="xs" color="gray-white" onClick={props.close}>
          Not now
        </Button>
        <Link
          href="/membership"
          className="text-primary-700 text-xs font-semibold hover:underline"
        >
          See membership
        </Link>
      </Row>
    </Col>
  )
}

function LinkForm(props: {
  storyId: string
  onAttached: () => void
  close: () => void
}) {
  const { storyId, onAttached, close } = props
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<LiteMarket>()
  const [status, setStatus] = useState<'idle' | 'linking' | 'linked' | 'error'>(
    'idle'
  )
  const [error, setError] = useState<string>()
  const { results, loading } = useMarketSearch(picked ? '' : query, {
    limit: 5,
  })

  useEffect(() => {
    if (status !== 'linked') return
    const t = setTimeout(close, 1400)
    return () => clearTimeout(t)
  }, [status])

  const link = async () => {
    if (!picked) return
    setStatus('linking')
    try {
      await api('attach-news-market', {
        storyId,
        contractId: picked.id,
        relation: 'related',
      })
      trackNews('news link market', { storyId, contractId: picked.id })
      setStatus('linked')
      onAttached()
    } catch (e) {
      console.error(e)
      setError(e instanceof Error ? e.message : String(e))
      setStatus('error')
    }
  }

  if (status === 'linked')
    return (
      <Row className="text-ink-700 items-center gap-2 py-2 text-sm">
        <CheckCircleIcon className="h-5 w-5 shrink-0 text-teal-600" />
        Linked. It now shows under Related outlook.
      </Row>
    )

  return (
    <Col className="gap-2.5">
      <div className="text-ink-900 text-sm font-semibold">
        Link a market to this story
      </div>
      <p className="text-ink-500 text-xs leading-snug">
        Pick an open market whose outcome this story bears on. It joins the
        related outlook for every reader.
      </p>
      {picked ? (
        <Row className="border-primary-200 bg-primary-50 items-start gap-2 rounded-md border px-2 py-1.5">
          <span className="text-ink-900 min-w-0 flex-1 text-xs leading-snug">
            {picked.question}
          </span>
          <span className="text-ink-600 shrink-0 text-xs font-semibold">
            {litePrice(picked)}
          </span>
          <button
            type="button"
            aria-label="Choose a different market"
            onClick={() => setPicked(undefined)}
            className="text-ink-400 hover:text-ink-700 shrink-0"
          >
            <XIcon className="h-3.5 w-3.5" />
          </button>
        </Row>
      ) : (
        <Col className="gap-1">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search open markets"
            className="border-ink-300 bg-canvas-0 focus:border-primary-500 focus:ring-primary-500 h-8 rounded-md border px-2 text-sm focus:outline-none focus:ring-1"
          />
          {(loading || results.length > 0) && (
            <Col className="border-ink-200 divide-ink-100 max-h-44 divide-y overflow-y-auto rounded-md border">
              {loading && results.length === 0 && (
                <span className="text-ink-400 px-2 py-1.5 text-xs">
                  Searching…
                </span>
              )}
              {results.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setPicked(m)}
                  className="hover:bg-canvas-50 flex items-start gap-2 px-2 py-1.5 text-left"
                >
                  <span className="text-ink-800 min-w-0 flex-1 text-xs leading-snug">
                    {m.question}
                  </span>
                  <span className="text-ink-500 shrink-0 text-xs">
                    {litePrice(m)}
                  </span>
                </button>
              ))}
            </Col>
          )}
        </Col>
      )}
      {status === 'error' && (
        <span className="text-scarlet-600 text-xs">
          {error ?? "Couldn't link that. Try again?"}
        </span>
      )}
      <Row className="justify-end gap-2">
        <Button size="xs" color="gray-white" onClick={close}>
          Cancel
        </Button>
        <Button
          size="xs"
          color="indigo"
          loading={status === 'linking'}
          disabled={!picked}
          onClick={link}
        >
          Link market
        </Button>
      </Row>
    </Col>
  )
}
