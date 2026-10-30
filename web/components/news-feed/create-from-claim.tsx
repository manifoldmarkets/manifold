import {
  CheckCircleIcon,
  ExclamationIcon,
  PlusIcon,
  XIcon,
} from '@heroicons/react/outline'
import clsx from 'clsx'
import dayjs from 'dayjs'
import Link from 'next/link'
import { useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { LiteMarket } from 'common/api/market-types'
import { Contract } from 'common/contract'
import { getAnte } from 'common/economy'
import {
  canLinkNewsMarkets,
  NewsArticle,
  NewsClaim,
  NewsMarketDraft,
  NewsMarketRelation,
} from 'common/news-feed'
import { formatMoney } from 'common/util/format'
import { Button } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { Modal } from 'web/components/layout/modal'
import { Row } from 'web/components/layout/row'
import { ExpandingInput } from 'web/components/widgets/expanding-input'
import { useUser } from 'web/hooks/use-user'
import { api } from 'web/lib/api/api'
import { firebaseLogin } from 'web/lib/firebase/users'
import { contextUrl, PrototypeNote } from './claim-row'
import { litePrice, useMarketSearch } from './market-search'
import { trackNews } from './news-events'
import { Price } from './news-market-row'

/** A market the reader published from a claim. Publishing is simulated in
 * the prototype; this is what the page shows in its place. */
export type SimulatedMarket = {
  id: string
  storyId: string
  claimId: string
  question: string
  criteria: string
  closeTime: number
  relation: NewsMarketRelation
  createdTime: number
}

/** Liquidity for a new binary market at the lowest tier, as /create uses. */
const ANTE = getAnte('BINARY', undefined, 100)

const field =
  'border-ink-300 bg-canvas-0 focus:border-primary-500 focus:ring-primary-500 w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-1'

const words = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9%$.\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2)
  )

/** Share of words two questions have in common. */
const overlap = (a: string, b: string) => {
  const x = words(a)
  const y = words(b)
  if (x.size === 0 || y.size === 0) return 0
  let common = 0
  for (const w of x) if (y.has(w)) common++
  return common / new Set([...x, ...y]).size
}

/** Below this, the reader has rewritten the question rather than edited it. */
const REWRITTEN_BELOW = 0.6

/**
 * Turn a claim into a market. The draft is prefilled and fully editable;
 * nothing is created until the reader presses Publish. Existing markets that
 * ask much the same thing are offered first, so a reader can link one
 * instead. The reader also says how the market relates to the quote, so a
 * broader question lands under the related outlook rather than beside the
 * claim as if it tested it.
 */
export function CreateFromClaimModal(props: {
  open: boolean
  setOpen: (open: boolean) => void
  storyId: string
  article: NewsArticle
  claim: NewsClaim
  draft: NewsMarketDraft
  contractsById: Record<string, Contract>
  onPublished: (market: SimulatedMarket) => void
  /** A reader linked an existing market; the feed should refetch. */
  onAttached: () => void
}) {
  const {
    open,
    setOpen,
    storyId,
    article,
    claim,
    draft,
    contractsById,
    onPublished,
    onAttached,
  } = props
  const user = useUser()
  // Linking is for members. Signed out, the button signs the reader in first.
  const member = !user || canLinkNewsMarkets(user.entitlements)
  const [question, setQuestion] = useState(draft.question)
  const [criteria, setCriteria] = useState(draft.criteria)
  const [definitions, setDefinitions] = useState(draft.definitions)
  const [closeDate, setCloseDate] = useState(
    // Drafts close at the end of a UTC day; show that day.
    new Date(draft.closeTime).toISOString().slice(0, 10)
  )
  const [resolution, setResolution] = useState(draft.resolution)
  const [evidence, setEvidence] = useState(
    draft.evidence.map((e) => ({ name: e.name, url: e.url ?? '' }))
  )
  const [relation, setRelation] = useState<NewsMarketRelation>('direct')
  const [scopeConfirmed, setScopeConfirmed] = useState(false)
  const [busy, setBusy] = useState<'publish' | string | undefined>()
  const edited = useRef(false)
  const done = useRef(false)

  const markEdited = () => {
    if (edited.current) return
    edited.current = true
    trackNews('news create edit', { storyId, claimId: claim.id })
  }
  const close = () => {
    if (!done.current)
      trackNews('news create cancel', {
        storyId,
        claimId: claim.id,
        edited: edited.current,
      })
    setOpen(false)
  }

  const closeTime = Date.parse(`${closeDate}T23:59:00Z`)
  const rewritten = overlap(draft.question, question) < REWRITTEN_BELOW
  const checks = [
    {
      ok: question.trim().endsWith('?') && question.trim().length >= 15,
      label: 'Asks a yes/no question',
    },
    {
      ok:
        Number.isFinite(closeTime) &&
        closeTime > Date.now() + 24 * 3600 * 1000 &&
        closeTime < Date.now() + 3 * 365 * 24 * 3600 * 1000,
      label: 'Has a deadline',
    },
    { ok: criteria.trim().length >= 40, label: 'Says how it resolves' },
    {
      ok: evidence.some((e) => e.name.trim().length > 1),
      label: 'Names evidence anyone can check',
    },
    {
      ok: relation === 'related' || !rewritten || scopeConfirmed,
      label:
        relation === 'direct'
          ? 'Asks exactly what the claim says'
          : 'Placed as a related forecast',
    },
  ]
  const ready = checks.every((c) => c.ok)

  // Markets that already ask much the same: the matcher's picks, then what
  // a search on the question finds as the reader edits it.
  const known = claim.similarIds
    .map((id) => contractsById[id])
    .filter((c): c is Contract => !!c)
  const { results } = useMarketSearch(question, {
    limit: 4,
    delayMs: 600,
    fromQuestion: true,
  })
  const searched = useMemo(
    () =>
      results
        .filter((m) => !known.some((k) => k.id === m.id))
        .slice(0, Math.max(0, 4 - known.length)),
    [results, known.map((k) => k.id).join(',')]
  )

  const reuse = async (contractId: string) => {
    if (!user) {
      firebaseLogin()
      return
    }
    if (!canLinkNewsMarkets(user.entitlements)) {
      toast.error('Linking markets to stories is for members.')
      return
    }
    setBusy(contractId)
    try {
      await api('attach-news-market', {
        storyId,
        claimId: claim.id,
        contractId,
        relation,
      })
      done.current = true
      trackNews('news create reuse', {
        storyId,
        claimId: claim.id,
        contractId,
        relation,
      })
      toast.success(
        relation === 'direct'
          ? 'Linked to the claim'
          : 'Added to the related outlook'
      )
      onAttached()
      setOpen(false)
    } catch (e) {
      console.error(e)
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(undefined)
    }
  }

  const publish = async () => {
    if (!ready) return
    setBusy('publish')
    // Prototype: no market is created. The real call is api('market', ...)
    // with the question, the criteria and definitions as the description,
    // the evidence and the quote as background, then a link back to the
    // claim like the one reuse makes.
    await new Promise((r) => setTimeout(r, 700))
    const market: SimulatedMarket = {
      id: `sim-${claim.id}-${Date.now()}`,
      storyId,
      claimId: claim.id,
      question: question.trim(),
      criteria: criteria.trim(),
      closeTime,
      relation,
      createdTime: Date.now(),
    }
    done.current = true
    trackNews('news create publish', {
      storyId,
      claimId: claim.id,
      relation,
      edited: edited.current,
      rewritten,
      simulated: true,
    })
    onPublished(market)
    setBusy(undefined)
    setOpen(false)
    toast.success(
      relation === 'direct'
        ? 'Published and linked to the claim (simulated)'
        : 'Published under Related outlook (simulated)'
    )
  }

  const who =
    claim.speakerKind === 'author'
      ? `${article.publisher}, in its own reporting`
      : [claim.speaker, claim.speakerRole].filter(Boolean).join(', ')

  return (
    <Modal
      open={open}
      setOpen={(o) => (o ? setOpen(true) : close())}
      size="lg"
      hideCloseButton
      ariaLabel="Create a market from this claim"
    >
      <Col className="bg-canvas-0 text-ink-1000 max-h-[90vh] overflow-hidden rounded-t-xl sm:max-h-[88vh] sm:rounded-xl">
        <Row className="border-ink-200 items-start justify-between gap-3 border-b px-4 py-3 sm:px-6">
          <Col className="min-w-0 gap-0.5">
            <h2 className="text-ink-1000 text-lg font-semibold">
              Create a market from this claim
            </h2>
            <p className="text-ink-500 text-xs">
              We drafted it from the quote. Review and edit everything; nothing
              is published until you press Publish.
            </p>
          </Col>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="text-ink-400 hover:text-ink-700 -mr-1 rounded p-1"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </Row>

        <Col className="gap-5 overflow-y-auto px-4 py-4 sm:px-6">
          {/* The quote and article travel with the market as background. */}
          <div className="bg-canvas-50 border-ink-200 rounded-md border p-3">
            <div className="text-ink-500 text-[10px] font-bold uppercase tracking-wider">
              Background · from {article.publisher}
            </div>
            <blockquote className="border-ink-300 text-ink-900 mt-1.5 border-l-2 pl-3 text-sm leading-relaxed">
              “{claim.excerpt.replace(/^["“]|["”]$/g, '')}”
            </blockquote>
            <div className="text-ink-500 mt-1.5 pl-3 text-xs">
              — {who} ·{' '}
              <a
                href={contextUrl(article.url, claim.excerpt)}
                target="_blank"
                rel="noreferrer"
                className="hover:text-primary-700 underline underline-offset-2"
              >
                {article.title}
              </a>{' '}
              ↗ · {dayjs(article.publishedTime).format('MMM D, YYYY')}
            </div>
            <div className="text-ink-400 mt-1 pl-3 text-[11px]">
              The quote and the article link go into the market's description.
            </div>
          </div>

          <Field
            label="Question"
            hint="A yes/no question someone who hasn't read the article understands, with its threshold and deadline. YES should mean the claim comes true."
          >
            <ExpandingInput
              value={question}
              onChange={(e) => {
                markEdited()
                setQuestion(e.target.value)
                setScopeConfirmed(false)
              }}
              maxLength={200}
              rows={2}
              className="w-full !px-3 !py-2 text-sm !leading-snug"
            />
          </Field>

          {(known.length > 0 || searched.length > 0) && (
            <Col className="gap-1.5">
              <span className="text-ink-700 text-sm font-medium">
                Already on Manifold
              </span>
              <span className="text-ink-500 -mt-1 text-xs">
                {member ? (
                  'If one of these asks the same thing, link it instead of creating another.'
                ) : (
                  <>
                    Linking one of these to the story is for members.{' '}
                    <Link
                      href="/membership"
                      className="text-primary-700 font-semibold hover:underline"
                    >
                      See membership
                    </Link>
                  </>
                )}
              </span>
              <Col className="border-ink-200 divide-ink-100 divide-y rounded-md border">
                {known.map((c) => (
                  <SimilarRow
                    key={c.id}
                    question={c.question}
                    price={<Price contract={c} />}
                    busy={busy === c.id}
                    canUse={member}
                    onUse={() => reuse(c.id)}
                  />
                ))}
                {searched.map((m: LiteMarket) => (
                  <SimilarRow
                    key={m.id}
                    question={m.question}
                    price={
                      <span className="text-ink-600 text-xs font-semibold">
                        {litePrice(m)}
                      </span>
                    }
                    busy={busy === m.id}
                    canUse={member}
                    onUse={() => reuse(m.id)}
                  />
                ))}
              </Col>
            </Col>
          )}

          <Field
            label="Resolution criteria"
            hint="When it resolves YES, when NO, and what happens if the outcome is unclear."
          >
            <ExpandingInput
              value={criteria}
              onChange={(e) => {
                markEdited()
                setCriteria(e.target.value)
              }}
              maxLength={1500}
              rows={4}
              className="w-full !px-3 !py-2 text-sm !leading-snug"
            />
          </Field>

          <Field
            label="Definitions"
            hint="Pin down any term the criteria rely on. Use the article's or common usage."
          >
            <Col className="gap-2">
              {definitions.map((d, i) => (
                <Row key={i} className="items-start gap-2">
                  <input
                    value={d.term}
                    onChange={(e) => {
                      markEdited()
                      setDefinitions((ds) =>
                        ds.map((x, j) =>
                          j === i ? { ...x, term: e.target.value } : x
                        )
                      )
                    }}
                    placeholder="Term"
                    className={clsx(field, 'w-36 shrink-0 sm:w-44')}
                  />
                  <input
                    value={d.meaning}
                    onChange={(e) => {
                      markEdited()
                      setDefinitions((ds) =>
                        ds.map((x, j) =>
                          j === i ? { ...x, meaning: e.target.value } : x
                        )
                      )
                    }}
                    placeholder="Meaning"
                    className={field}
                  />
                  <RemoveButton
                    label="Remove definition"
                    onClick={() => {
                      markEdited()
                      setDefinitions((ds) => ds.filter((_, j) => j !== i))
                    }}
                  />
                </Row>
              ))}
              <AddButton
                onClick={() =>
                  setDefinitions((ds) => [...ds, { term: '', meaning: '' }])
                }
              >
                Add definition
              </AddButton>
            </Col>
          </Field>

          <div className="grid gap-4 sm:grid-cols-[11rem_minmax(0,1fr)]">
            <Field label="Closes">
              <input
                type="date"
                value={closeDate}
                min={dayjs().add(1, 'day').format('YYYY-MM-DD')}
                max={dayjs().add(3, 'year').format('YYYY-MM-DD')}
                onChange={(e) => {
                  markEdited()
                  setCloseDate(e.target.value)
                }}
                className={field}
              />
            </Field>
            <Field label="Resolution timing">
              <input
                value={resolution}
                onChange={(e) => {
                  markEdited()
                  setResolution(e.target.value)
                }}
                maxLength={400}
                className={field}
              />
            </Field>
          </div>

          <Field
            label="Evidence"
            hint="Public sources anyone can check when it resolves."
          >
            <Col className="gap-2">
              {evidence.map((e, i) => (
                <Row key={i} className="items-start gap-2">
                  <input
                    value={e.name}
                    onChange={(ev) => {
                      markEdited()
                      setEvidence((es) =>
                        es.map((x, j) =>
                          j === i ? { ...x, name: ev.target.value } : x
                        )
                      )
                    }}
                    placeholder="Source"
                    className={clsx(field, 'w-40 shrink-0 sm:w-56')}
                  />
                  <input
                    value={e.url}
                    onChange={(ev) => {
                      markEdited()
                      setEvidence((es) =>
                        es.map((x, j) =>
                          j === i ? { ...x, url: ev.target.value } : x
                        )
                      )
                    }}
                    placeholder="https:// (optional)"
                    className={field}
                  />
                  <RemoveButton
                    label="Remove source"
                    onClick={() => {
                      markEdited()
                      setEvidence((es) => es.filter((_, j) => j !== i))
                    }}
                  />
                </Row>
              ))}
              <AddButton
                onClick={() =>
                  setEvidence((es) => [...es, { name: '', url: '' }])
                }
              >
                Add source
              </AddButton>
            </Col>
          </Field>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-ink-700 mb-1 text-sm font-medium">
              How it relates to the quote
            </legend>
            <RelationOption
              checked={relation === 'direct'}
              onSelect={() => setRelation('direct')}
              title="Tests this claim directly"
              body="Shown beside the quote. Its price reads as the chance the claim comes true."
            />
            <RelationOption
              checked={relation === 'related'}
              onSelect={() => setRelation('related')}
              title="A broader or related forecast"
              body="Shown under Related outlook, so its price isn't read as a verdict on the quote."
            />
            {relation === 'direct' && rewritten && (
              <div className="flex flex-col gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-100">
                <Row className="items-start gap-2">
                  <ExclamationIcon className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    You've rewritten the question. If it no longer asks exactly
                    what the quote claims, place it as a related forecast so
                    readers don't take its price as a verdict on the quote.
                  </span>
                </Row>
                <label className="flex cursor-pointer items-center gap-2 pl-6 text-xs">
                  <input
                    type="checkbox"
                    checked={scopeConfirmed}
                    onChange={(e) => setScopeConfirmed(e.target.checked)}
                  />
                  It still asks exactly what the quote claims
                </label>
              </div>
            )}
          </fieldset>

          <Col className="gap-1.5">
            <span className="text-ink-700 text-sm font-medium">
              Ready to publish?
            </span>
            <ul className="grid gap-1 sm:grid-cols-2">
              {checks.map((c) => (
                <li
                  key={c.label}
                  className={clsx(
                    'flex items-center gap-1.5 text-xs',
                    c.ok ? 'text-ink-700' : 'text-amber-700 dark:text-amber-300'
                  )}
                >
                  {c.ok ? (
                    <CheckCircleIcon className="h-4 w-4 shrink-0 text-teal-600" />
                  ) : (
                    <ExclamationIcon className="h-4 w-4 shrink-0" />
                  )}
                  {c.label}
                </li>
              ))}
            </ul>
          </Col>
        </Col>

        <div className="border-ink-200 bg-canvas-50 flex flex-col gap-2 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <Col className="gap-0.5">
            <span className="text-ink-600 text-xs">
              Creating a market costs {formatMoney(ANTE)} in liquidity.
            </span>
            <PrototypeNote before />
          </Col>
          <Row className="justify-end gap-2">
            <Button color="gray-white" size="sm" onClick={close}>
              Cancel
            </Button>
            <Button
              color="indigo"
              size="sm"
              disabled={!ready || !!busy}
              loading={busy === 'publish'}
              onClick={publish}
            >
              Publish market
            </Button>
          </Row>
        </div>
      </Col>
    </Modal>
  )
}

function Field(props: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <Col className="gap-1.5">
      <span className="text-ink-700 text-sm font-medium">{props.label}</span>
      {props.hint && (
        <span className="text-ink-500 -mt-1 text-xs leading-snug">
          {props.hint}
        </span>
      )}
      {props.children}
    </Col>
  )
}

function SimilarRow(props: {
  question: string
  price: React.ReactNode
  busy: boolean
  /** Members may link it; everyone else only sees that it exists. */
  canUse: boolean
  onUse: () => void
}) {
  return (
    // Phones: question on top, price and the button beneath it.
    <div className="flex flex-col gap-1.5 px-3 py-2 sm:flex-row sm:items-center sm:gap-3">
      <span className="text-ink-800 min-w-0 flex-1 text-sm leading-snug">
        {props.question}
      </span>
      <Row className="items-center justify-between gap-3 sm:justify-end">
        <div className="min-w-0 max-w-[14rem]">{props.price}</div>
        {props.canUse && (
          <Button
            size="2xs"
            color="gray-outline"
            loading={props.busy}
            onClick={props.onUse}
            className="shrink-0"
          >
            Use this instead
          </Button>
        )}
      </Row>
    </div>
  )
}

function RelationOption(props: {
  checked: boolean
  onSelect: () => void
  title: string
  body: string
}) {
  return (
    <label
      aria-label={props.title}
      className={clsx(
        'flex cursor-pointer gap-3 rounded-md border px-3 py-2.5',
        props.checked
          ? 'border-primary-400 bg-primary-50'
          : 'border-ink-200 hover:bg-canvas-50'
      )}
    >
      <input
        type="radio"
        name="news-market-relation"
        className="text-primary-600 mt-1"
        checked={props.checked}
        onChange={props.onSelect}
      />
      <span className="min-w-0">
        <span className="text-ink-900 block text-sm font-medium">
          {props.title}
        </span>
        <span className="text-ink-500 block text-xs leading-snug">
          {props.body}
        </span>
      </span>
    </label>
  )
}

function AddButton(props: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className="text-primary-700 hover:text-primary-800 flex items-center gap-1 self-start text-xs font-medium"
    >
      <PlusIcon className="h-3.5 w-3.5" />
      {props.children}
    </button>
  )
}

function RemoveButton(props: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={props.label}
      onClick={props.onClick}
      className="text-ink-400 hover:text-ink-700 mt-2 shrink-0 rounded p-0.5"
    >
      <XIcon className="h-4 w-4" />
    </button>
  )
}
