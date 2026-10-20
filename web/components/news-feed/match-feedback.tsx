import { Popover, PopoverButton, PopoverPanel } from '@headlessui/react'
import { CheckCircleIcon, FlagIcon, XIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import { ReactNode, useEffect, useState } from 'react'
import { LiteMarket } from 'common/api/market-types'
import { NewsFeedbackKind } from 'common/news-feed'
import { Button } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { api } from 'web/lib/api/api'
import { litePrice, useMarketSearch } from './market-search'
import { trackNews } from './news-events'

/** What the report is about: a related market, the market beside a claim,
 * or a market the story is missing. */
export type ReportMode = 'outlook' | 'claim' | 'missing'

const OPTIONS: Record<
  ReportMode,
  { kind: NewsFeedbackKind; label: string; hint?: string }[]
> = {
  outlook: [
    { kind: 'not-relevant', label: 'Not about this story' },
    {
      kind: 'missing-context',
      label: 'Missing context',
      hint: 'Readers need to know something more to read this market against the story.',
    },
    { kind: 'other', label: 'Something else' },
  ],
  claim: [
    {
      kind: 'not-direct',
      label: "Doesn't test this claim",
      hint: 'It asks something broader, narrower or different from the quote.',
    },
    { kind: 'not-relevant', label: 'Not about this story' },
    { kind: 'other', label: 'Something else' },
  ],
  missing: [
    {
      kind: 'missing-context',
      label: 'A market is missing',
      hint: 'Point us to a market that belongs on this story.',
    },
  ],
}

/**
 * A light way to say a match is wrong and point to a better market. Opens
 * from a small flag on a market, or from the panel's "suggest a market"
 * link. Reports go to the feed server for review; nothing changes on the
 * page for other readers until someone acts on them.
 */
export function MatchReport(props: {
  mode: ReportMode
  storyId: string
  contractId?: string
  claimId?: string
  /** Custom trigger; defaults to a small flag. */
  trigger?: ReactNode
  triggerClassName?: string
}) {
  const { mode, storyId, contractId, claimId, trigger, triggerClassName } =
    props
  const [sent, setSent] = useState(false)
  return (
    <Popover className="relative">
      {({ open }) => (
        <>
          <PopoverButton
            aria-label={
              mode === 'missing' ? 'Suggest a market' : 'Report this match'
            }
            title={mode === 'missing' ? undefined : 'Report this match'}
            onClick={() => {
              if (!open) trackNews('news feedback open', { mode, storyId })
            }}
            className={clsx(
              'focus-visible:ring-primary-500 rounded outline-none focus-visible:ring-2',
              triggerClassName ??
                (sent
                  ? 'text-amber-600'
                  : 'text-ink-400 hover:text-ink-700 hover:bg-canvas-100 p-1')
            )}
          >
            {trigger ?? (
              <FlagIcon
                className={clsx('h-3.5 w-3.5', sent && 'fill-current')}
              />
            )}
          </PopoverButton>
          <PopoverPanel
            anchor={{ to: 'bottom end', gap: 6, padding: 12 }}
            className="bg-canvas-0 border-ink-200 z-50 w-[19rem] rounded-lg border p-3 shadow-lg"
          >
            {({ close }) => (
              <ReportForm
                mode={mode}
                storyId={storyId}
                contractId={contractId}
                claimId={claimId}
                onSent={() => setSent(true)}
                close={close}
              />
            )}
          </PopoverPanel>
        </>
      )}
    </Popover>
  )
}

function ReportForm(props: {
  mode: ReportMode
  storyId: string
  contractId?: string
  claimId?: string
  onSent: () => void
  close: () => void
}) {
  const { mode, storyId, contractId, claimId, onSent, close } = props
  const options = OPTIONS[mode]
  const [kind, setKind] = useState<NewsFeedbackKind>(options[0].kind)
  const [query, setQuery] = useState('')
  const [suggested, setSuggested] = useState<LiteMarket>()
  const [note, setNote] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>(
    'idle'
  )
  const { results, loading } = useMarketSearch(suggested ? '' : query, {
    limit: 4,
  })

  useEffect(() => {
    if (status !== 'sent') return
    const t = setTimeout(close, 1600)
    return () => clearTimeout(t)
  }, [status])

  const send = async () => {
    setStatus('sending')
    try {
      await api('news-feedback', {
        storyId,
        contractId,
        claimId,
        kind,
        suggestedContractId: suggested?.id,
        note: note.trim() || undefined,
      })
      trackNews('news feedback send', {
        storyId,
        contractId,
        claimId,
        kind,
        suggested: !!suggested,
      })
      setStatus('sent')
      onSent()
    } catch (e) {
      console.error(e)
      setStatus('error')
    }
  }

  if (status === 'sent')
    return (
      <Row className="text-ink-700 items-center gap-2 py-2 text-sm">
        <CheckCircleIcon className="h-5 w-5 shrink-0 text-teal-600" />
        Thanks. We'll review this {mode === 'missing' ? 'suggestion' : 'match'}.
      </Row>
    )

  return (
    <Col className="gap-2.5">
      <div className="text-ink-900 text-sm font-semibold">
        {mode === 'missing'
          ? 'Suggest a market for this story'
          : "What's wrong with this match?"}
      </div>
      {options.length > 1 && (
        <Col className="gap-1" role="radiogroup">
          {options.map((o) => (
            <label
              key={o.kind}
              className={clsx(
                'flex cursor-pointer gap-2 rounded-md px-2 py-1.5',
                kind === o.kind ? 'bg-primary-50' : 'hover:bg-canvas-50'
              )}
            >
              <input
                type="radio"
                name="news-report-kind"
                className="text-primary-600 mt-0.5"
                checked={kind === o.kind}
                onChange={() => setKind(o.kind)}
              />
              <span className="min-w-0">
                <span className="text-ink-900 block text-sm">{o.label}</span>
                {o.hint && kind === o.kind && (
                  <span className="text-ink-500 block text-xs leading-snug">
                    {o.hint}
                  </span>
                )}
              </span>
            </label>
          ))}
        </Col>
      )}
      {mode === 'missing' && (
        <p className="text-ink-500 text-xs leading-snug">{options[0].hint}</p>
      )}

      <Col className="gap-1">
        <span className="text-ink-600 text-xs font-medium">
          {mode === 'missing' ? 'Which market?' : 'A better market (optional)'}
        </span>
        {suggested ? (
          <Row className="border-primary-200 bg-primary-50 items-start gap-2 rounded-md border px-2 py-1.5">
            <span className="text-ink-900 min-w-0 flex-1 text-xs leading-snug">
              {suggested.question}
            </span>
            <span className="text-ink-600 shrink-0 text-xs font-semibold">
              {litePrice(suggested)}
            </span>
            <button
              type="button"
              aria-label="Clear the suggested market"
              onClick={() => setSuggested(undefined)}
              className="text-ink-400 hover:text-ink-700 shrink-0"
            >
              <XIcon className="h-3.5 w-3.5" />
            </button>
          </Row>
        ) : (
          <>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search open markets"
              className="border-ink-300 bg-canvas-0 focus:border-primary-500 focus:ring-primary-500 h-8 rounded-md border px-2 text-sm focus:outline-none focus:ring-1"
            />
            {(loading || results.length > 0) && (
              <Col className="border-ink-200 divide-ink-100 max-h-40 divide-y overflow-y-auto rounded-md border">
                {loading && results.length === 0 && (
                  <span className="text-ink-400 px-2 py-1.5 text-xs">
                    Searching…
                  </span>
                )}
                {results.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setSuggested(m)}
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
          </>
        )}
      </Col>

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value.slice(0, 500))}
        rows={2}
        placeholder="Anything else? (optional)"
        className="border-ink-300 bg-canvas-0 focus:border-primary-500 focus:ring-primary-500 resize-none rounded-md border px-2 py-1.5 text-sm focus:outline-none focus:ring-1"
      />
      {status === 'error' && (
        <span className="text-scarlet-600 text-xs">
          Couldn't send that. Try again?
        </span>
      )}
      <Row className="justify-end gap-2">
        <Button size="xs" color="gray-white" onClick={close}>
          Cancel
        </Button>
        <Button
          size="xs"
          color="indigo"
          loading={status === 'sending'}
          disabled={mode === 'missing' && !suggested && !note.trim()}
          onClick={send}
        >
          {mode === 'missing' ? 'Send suggestion' : 'Send report'}
        </Button>
      </Row>
    </Col>
  )
}
