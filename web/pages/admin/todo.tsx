import clsx from 'clsx'
import Link from 'next/link'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { NoSEO } from 'web/components/NoSEO'
import { Button } from 'web/components/buttons/button'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { Title } from 'web/components/widgets/title'
import { useAdmin } from 'web/hooks/use-admin'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { useRedirectIfSignedOut } from 'web/hooks/use-redirect-if-signed-out'
import { APIResponse } from 'common/api/schema'

// One page, one feed, once a day.
//
// The rest of /admin is a directory of tools — useful when you already know
// what you are looking for, useless for finding out that something has been
// sitting unattended for a week. This page only ever answers the second
// question, so an empty page is a real answer and not a broken one.
//
// It stays read-only on purpose. Every row links to the tool that owns the
// action, which keeps the dangerous operations behind the confirmations that
// were written for them, and keeps this page cheap enough to change.

type TodoItem = APIResponse<'get-admin-todo'>['items'][number]

const CATEGORY_LABEL: Record<TodoItem['category'], string> = {
  merch: 'Merch',
  prizes: 'Prize drawings',
  payments: 'Payments',
  perps: 'Perps',
}

// Overdue first, then ordinary work, then whatever is not today's problem.
const SEVERITY_ORDER: Record<TodoItem['severity'], number> = {
  overdue: 0,
  todo: 1,
  waiting: 2,
}

const SEVERITY_STYLE: Record<
  TodoItem['severity'],
  { pill: string; card: string; label: string }
> = {
  overdue: {
    pill: 'bg-scarlet-100 text-scarlet-700 dark:bg-scarlet-900 dark:text-scarlet-200',
    card: 'border-scarlet-300 dark:border-scarlet-800',
    label: 'Overdue',
  },
  todo: {
    pill: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100',
    card: 'border-ink-300',
    label: 'To do',
  },
  waiting: {
    pill: 'bg-ink-200 text-ink-700',
    card: 'border-ink-200',
    label: 'Not today',
  },
}

export default function AdminTodoPage() {
  useRedirectIfSignedOut()
  const isAdmin = useAdmin()
  // Gated on isAdmin: the hook runs before the non-admin early return, and an
  // ungated call would be a guaranteed 403 for everyone else who lands here.
  const { data, refresh, loading } = useAPIGetter(
    'get-admin-todo',
    {},
    undefined,
    undefined,
    isAdmin
  )

  if (!isAdmin) return <></>

  const items = data?.items
    ? [...data.items].sort(
        (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
      )
    : undefined
  const overdue = items?.filter((i) => i.severity === 'overdue').length ?? 0

  return (
    <Page trackPageView="admin todo page">
      <NoSEO />
      <Col className="mx-auto w-full max-w-3xl gap-4 p-4">
        <Row className="items-center justify-between gap-2">
          <Title className="!mb-0">Today</Title>
          <Row className="items-center gap-3">
            {data && (
              <span className="text-ink-500 text-sm">
                as of {new Date(data.generatedAt).toLocaleTimeString()}
              </span>
            )}
            <Button size="xs" color="gray-outline" onClick={refresh}>
              Refresh
            </Button>
          </Row>
        </Row>

        <p className="text-ink-500 -mt-2 text-sm">
          Everything waiting on a human, across merch, prize drawings,
          redemptions and perps. Moderation is not here —{' '}
          <Link className="underline" href="/admin/reports">
            reports
          </Link>{' '}
          and{' '}
          <Link className="underline" href="/admin/spam">
            spam
          </Link>{' '}
          have their own queues.
        </p>

        {items === undefined ? (
          <LoadingIndicator />
        ) : items.length === 0 ? (
          <Col className="border-ink-200 items-center gap-1 rounded-lg border border-dashed py-16">
            <span className="text-2xl">✓</span>
            <span className="text-ink-700 font-semibold">Nothing to do</span>
            <span className="text-ink-500 text-sm">
              No unshipped merch, no unpaid prizes, no perp tasks.
            </span>
          </Col>
        ) : (
          <>
            <Row className="text-ink-600 gap-3 text-sm">
              <span>
                <b className="text-ink-900">{data?.openCount ?? 0}</b> open
              </span>
              {overdue > 0 && (
                <span className="text-scarlet-600 dark:text-scarlet-400">
                  <b>{overdue}</b> overdue
                </span>
              )}
            </Row>
            <Col className="gap-3">
              {items.map((item) => (
                <TodoCard key={item.id} item={item} />
              ))}
            </Col>
          </>
        )}

        {loading && items !== undefined && (
          <span className="text-ink-400 text-xs">refreshing…</span>
        )}
      </Col>
    </Page>
  )
}

function TodoCard(props: { item: TodoItem }) {
  const { item } = props
  const style = SEVERITY_STYLE[item.severity]
  const hidden = item.count - item.entries.length

  return (
    <Col
      className={clsx(
        'bg-canvas-0 gap-3 rounded-lg border p-4',
        style.card,
        item.severity === 'waiting' && 'opacity-75'
      )}
    >
      <Row className="flex-wrap items-center gap-2">
        <span
          className={clsx(
            'rounded-full px-2 py-0.5 text-xs font-semibold',
            style.pill
          )}
        >
          {style.label}
        </span>
        <span className="text-ink-500 text-xs uppercase tracking-wide">
          {CATEGORY_LABEL[item.category]}
        </span>
      </Row>

      <Col className="gap-1">
        <span className="text-lg font-semibold">{item.title}</span>
        <span className="text-ink-600 text-sm">{item.detail}</span>
      </Col>

      {item.entries.length > 0 && (
        <Col className="border-ink-200 gap-1.5 border-l-2 pl-3">
          {item.entries.map((entry, i) => (
            <Col key={i} className="gap-0">
              {entry.href ? (
                <Link
                  href={entry.href}
                  className="text-primary-700 text-sm hover:underline"
                >
                  {entry.label}
                </Link>
              ) : (
                <span className="text-sm">{entry.label}</span>
              )}
              {entry.sublabel && (
                <span className="text-ink-500 text-xs">{entry.sublabel}</span>
              )}
            </Col>
          ))}
          {hidden > 0 && (
            <span className="text-ink-500 text-xs">…and {hidden} more</span>
          )}
        </Col>
      )}

      <Row>
        <Link href={item.actionHref} target={linkTarget(item.actionHref)}>
          <Button size="xs" color="indigo-outline">
            {item.actionLabel}
          </Button>
        </Link>
      </Row>
    </Col>
  )
}

const linkTarget = (href: string) =>
  href.startsWith('http') ? '_blank' : undefined
