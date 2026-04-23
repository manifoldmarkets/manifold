import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'
dayjs.extend(utc)
dayjs.extend(timezone)

import { log } from './utils'

// VoteHub API: https://polling.votehub.com/polls
// Returns a list of polls for a given subject. We use poll_type=approval,
// in_averages_only=true (their aggregator already excludes internal/partisan
// junk here), and filter by start_date. Each item has an `answers` array
// with { choice, pct }; we want "Approve". The poll's representative date
// is its `end_date` (last day of fielding) — not `created_at`, which is
// when the poll was published.
//
// We compute a daily average as the *unweighted* mean of Approve pct across
// all polls whose end_date falls within a trailing window ending on the day
// in question. 14 days is standard for political polling aggregators.

export type VoteHubPoll = {
  id: string
  poll_type: string
  start_date: string // YYYY-MM-DD
  end_date: string // YYYY-MM-DD
  pollster: string
  subject: string
  answers: { choice: string; pct: number }[]
}

export const TRUMP_APPROVAL_WINDOW_DAYS = 14
export const TRUMP_INAUGURATION_DATE = '2025-01-21'

// Fetch all Trump approval polls from VoteHub since `startDate` (YYYY-MM-DD).
// The API returns the full list in one payload (no pagination observed in
// practice; `total` is included but all items come back).
export const fetchTrumpApprovalPolls = async (
  startDate: string
): Promise<VoteHubPoll[]> => {
  const url = new URL('https://polling.votehub.com/polls')
  url.searchParams.set('poll_type', 'approval')
  url.searchParams.set('subject', 'Donald Trump')
  url.searchParams.set('in_averages_only', 'true')
  url.searchParams.set('start_date', startDate)

  const response = await fetch(url.toString(), {
    headers: {
      accept: '*/*',
      // VoteHub's CORS is locked to the votehub.com origin in browsers, but
      // server-to-server requests don't need Origin. Setting a user-agent
      // is polite.
      'user-agent': 'Manifold/1.0 (+https://manifold.markets)',
    },
  })
  if (!response.ok) {
    throw new Error(
      `VoteHub request failed: ${response.status} ${response.statusText}`
    )
  }
  const body = (await response.json()) as {
    items: VoteHubPoll[]
    total: number
  }
  log(
    `fetched ${body.items.length}/${body.total} Trump approval polls from VoteHub (start_date=${startDate})`
  )
  return body.items
}

const getApprovePct = (poll: VoteHubPoll): number | null => {
  const approve = poll.answers.find(
    (a) => a.choice.toLowerCase() === 'approve'
  )
  if (!approve || typeof approve.pct !== 'number') return null
  return approve.pct
}

// Compute a rolling (trailing, unweighted) average of Approve pct for each
// day in [fromDay, toDay] (inclusive). A poll contributes to day D if its
// end_date is in (D - windowDays, D] (i.e. the windowDays days ending on D).
// Days with no polls in the window are omitted.
export const computeRollingAverages = (
  polls: VoteHubPoll[],
  fromDay: string, // YYYY-MM-DD, in America/Los_Angeles
  toDay: string, // YYYY-MM-DD
  windowDays: number = TRUMP_APPROVAL_WINDOW_DAYS
): { ts: number; price: number }[] => {
  const pollsWithPct = polls
    .map((p) => ({ endDate: p.end_date, pct: getApprovePct(p) }))
    .filter((p): p is { endDate: string; pct: number } => p.pct != null)

  const from = dayjs.tz(fromDay, 'America/Los_Angeles').startOf('day')
  const to = dayjs.tz(toDay, 'America/Los_Angeles').startOf('day')
  const points: { ts: number; price: number }[] = []

  for (
    let day = from;
    day.isBefore(to) || day.isSame(to);
    day = day.add(1, 'day')
  ) {
    const windowStart = day.subtract(windowDays - 1, 'day')
    const inWindow = pollsWithPct.filter((p) => {
      const end = dayjs.tz(p.endDate, 'America/Los_Angeles').startOf('day')
      return (
        (end.isAfter(windowStart) || end.isSame(windowStart)) &&
        (end.isBefore(day) || end.isSame(day))
      )
    })
    if (inWindow.length === 0) continue
    const avg =
      inWindow.reduce((sum, p) => sum + p.pct, 0) / inWindow.length
    points.push({ ts: day.valueOf(), price: avg })
  }

  return points
}
