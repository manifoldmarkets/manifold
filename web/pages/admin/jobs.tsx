import { useState } from 'react'

import { formatJustDateShort } from 'client-common/lib/time'
import {
  JOB_INTEREST_LABELS,
  JOB_REGION_LABELS,
  JOB_SKILL_LABELS,
  JobSeekerAdminRow,
} from 'common/job-seeker'
import { formatMoney } from 'common/util/format'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { Title } from 'web/components/widgets/title'
import { UserLink } from 'web/components/widgets/user-link'
import { useAdmin } from 'web/hooks/use-admin'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { useUser } from 'web/hooks/use-user'

export default function AdminJobsPage() {
  const user = useUser()
  const isAdmin = useAdmin()

  if (!user || !isAdmin) {
    return (
      <Page trackPageView="admin-jobs">
        <Col className="items-center justify-center py-20">
          <p className="text-ink-500">Admin access required</p>
        </Col>
      </Page>
    )
  }

  return (
    <Page trackPageView="admin-jobs" className="!col-span-10">
      <Col className="gap-6">
        <Title>Job Board Candidates</Title>
        <SeekersTable />
      </Col>
    </Page>
  )
}

function SeekersTable() {
  const { data } = useAPIGetter('get-job-seekers', {})
  const [expandedUser, setExpandedUser] = useState<string | null>(null)

  if (data === undefined) return <LoadingIndicator />
  const { seekers } = data

  const trading = seekers.filter(
    (s) =>
      s.interests.includes('trading-firms') ||
      s.interests.includes('hedge-funds')
  ).length

  return (
    <Col className="gap-4">
      <Row className="flex-wrap gap-4">
        <SummaryCard label="Active candidates" value={seekers.length} />
        <SummaryCard label="Want trading roles" value={trading} />
        <SummaryCard
          label="Profit > 100k"
          value={seekers.filter((s) => (s.profit ?? 0) > 100_000).length}
        />
      </Row>

      <div className="bg-canvas-0 overflow-x-auto rounded-lg border">
        <table className="w-full">
          <thead>
            <tr className="bg-canvas-50 border-b">
              {[
                'User',
                'Profit',
                'Rank',
                'Portfolio',
                'Joined',
                'Last bet',
                'Region',
                'Skills',
                'Wants',
                'Topics',
              ].map((h) => (
                <th
                  key={h}
                  className="text-ink-600 whitespace-nowrap px-3 py-3 text-left text-sm font-medium"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {seekers.map((s) => (
              <SeekerRow
                key={s.userId}
                seeker={s}
                expanded={expandedUser === s.userId}
                onToggle={() =>
                  setExpandedUser(expandedUser === s.userId ? null : s.userId)
                }
              />
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-ink-400 text-xs">
        Candidates opted in to employer contact via /jobs. Profiles are private
        until they reply — share anonymized stats only. Topic ranks are computed
        live against all traders in that topic and can take several seconds for
        large topics.
      </p>
    </Col>
  )
}

function SeekerRow(props: {
  seeker: JobSeekerAdminRow
  expanded: boolean
  onToggle: () => void
}) {
  const { seeker: s, expanded, onToggle } = props

  return (
    <>
      <tr className="border-b last:border-b-0">
        <td className="whitespace-nowrap px-3 py-2">
          <Row className="items-center gap-1.5">
            <UserLink
              user={{ id: s.userId, username: s.username, name: s.name }}
            />
            {s.isBot && (
              <span className="rounded-full bg-indigo-100 px-1.5 py-0.5 text-xs text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300">
                bot
              </span>
            )}
          </Row>
        </td>
        <td className="whitespace-nowrap px-3 py-2 text-right font-medium">
          {s.profit === null ? '—' : formatMoney(s.profit)}
        </td>
        <td className="text-ink-600 whitespace-nowrap px-3 py-2 text-right text-sm">
          {s.overallRank === null ? '—' : `#${s.overallRank}`}
        </td>
        <td className="text-ink-600 whitespace-nowrap px-3 py-2 text-right text-sm">
          {s.portfolio === null ? '—' : formatMoney(s.portfolio)}
        </td>
        <td className="text-ink-600 whitespace-nowrap px-3 py-2 text-sm">
          {formatJustDateShort(s.joinedTime)}
        </td>
        <td className="text-ink-600 whitespace-nowrap px-3 py-2 text-sm">
          {s.lastBetTime === null
            ? 'never'
            : formatJustDateShort(s.lastBetTime)}
        </td>
        <td className="text-ink-600 whitespace-nowrap px-3 py-2 text-sm">
          {s.region ? JOB_REGION_LABELS[s.region] : '—'}
        </td>
        <td className="px-3 py-2">
          <ChipList items={s.skills.map((k) => JOB_SKILL_LABELS[k])} />
        </td>
        <td className="px-3 py-2">
          <ChipList items={s.interests.map((i) => JOB_INTEREST_LABELS[i])} />
        </td>
        <td className="px-3 py-2">
          <button
            className="text-primary-600 hover:text-primary-700 text-sm underline"
            onClick={onToggle}
          >
            {expanded ? 'Hide' : 'Show'}
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="border-b last:border-b-0">
          <td colSpan={10} className="bg-canvas-50 px-4 py-3">
            <TopicsPanel userId={s.userId} />
          </td>
        </tr>
      )}
    </>
  )
}

function TopicsPanel(props: { userId: string }) {
  const { userId } = props
  // Keyed per user: the hook's data slot defaults to the path alone, which
  // would leak the previously expanded seeker's topics into this panel.
  const { data } = useAPIGetter(
    'get-job-seeker-topics',
    { userId },
    undefined,
    `get-job-seeker-topics-${userId}`
  )

  if (data === undefined) return <LoadingIndicator size="sm" />
  if (data.topics.length === 0)
    return <span className="text-ink-500 text-sm">No profitable topics</span>

  return (
    <Col className="gap-2">
      <span className="text-ink-500 font-mono text-xs uppercase tracking-widest">
        Top topics by profit — click for site-wide rank
      </span>
      <Row className="flex-wrap gap-2">
        {data.topics.map((t) => (
          <TopicRankChip
            key={t.topic}
            topic={t.topic}
            profit={t.profit}
            userId={userId}
          />
        ))}
      </Row>
    </Col>
  )
}

// Rank responses are per-topic, not per-seeker, so they're cached under a
// topic-keyed slot shared by every row and kept across expand/collapse —
// the multi-second aggregation runs once per topic per session.
function TopicRankChip(props: {
  topic: string
  profit: number
  userId: string
}) {
  const { topic, profit, userId } = props
  const [clicked, setClicked] = useState(false)
  const { data, error, loading, refresh } = useAPIGetter(
    'get-job-seeker-topic-rank',
    { topic },
    undefined,
    `get-job-seeker-topic-rank-${topic}`,
    clicked
  )
  const mine = data?.ranks.find((r) => r.userId === userId)

  return (
    <button
      onClick={() => {
        if (!clicked) setClicked(true)
        else if (error) refresh()
      }}
      className="bg-canvas-0 border-ink-200 hover:border-primary-400 rounded-full border px-2.5 py-1 text-xs"
    >
      <span className="text-ink-700 font-medium">{topic}</span>{' '}
      <span className="text-ink-500">{formatMoney(profit)}</span>
      {loading && <span className="text-ink-400"> · ranking…</span>}
      {error && !loading && (
        <span className="text-scarlet-500" title={error.message}>
          {' '}
          · failed — click to retry
        </span>
      )}
      {data &&
        !loading &&
        (mine ? (
          <span className="text-primary-600 font-semibold">
            {' '}
            · #{mine.rank} of {data.participants.toLocaleString()}
          </span>
        ) : (
          <span className="text-ink-400"> · not ranked</span>
        ))}
    </button>
  )
}

function ChipList(props: { items: string[] }) {
  const { items } = props
  if (items.length === 0) return <span className="text-ink-400 text-xs">—</span>
  const shown = items.slice(0, 3)
  const extra = items.length - shown.length
  return (
    <Row className="max-w-[16rem] flex-wrap gap-1">
      {shown.map((label) => (
        <span
          key={label}
          className="bg-ink-100 text-ink-600 whitespace-nowrap rounded-full px-2 py-0.5 text-xs"
        >
          {label}
        </span>
      ))}
      {extra > 0 && (
        <span className="text-ink-400 text-xs" title={items.join(', ')}>
          +{extra}
        </span>
      )}
    </Row>
  )
}

function SummaryCard(props: { label: string; value: number }) {
  const { label, value } = props
  return (
    <div className="bg-canvas-50 border-canvas-100 rounded-lg border px-4 py-3">
      <div className="text-ink-500 text-xs font-medium">{label}</div>
      <div className="text-ink-900 text-xl font-bold">{value}</div>
    </div>
  )
}
