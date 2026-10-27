import { capitalize } from 'lodash'
import Link from 'next/link'
import clsx from 'clsx'

import { TRADE_TERM, TRADED_TERM } from 'common/envs/constants'
import { linkClass } from 'web/components/widgets/site-link'
import {
  MOD_ACTION_TEXT_CLASS,
  ModActionBadge,
} from 'web/components/moderation/mod-action'
import { StatMetric } from './stat-metric'
import {
  DailyStatsRow,
  NumericStatsColumn,
  dataForStats,
  ratioSeries,
  rollingAvg,
  rollingSum,
  round,
} from './stats-series'

export const STATS_SECTIONS = [
  { key: 'users', label: 'Users' },
  { key: 'retention', label: 'Retention' },
  { key: 'engagement', label: 'Engagement' },
  { key: 'conversion', label: 'Conversion' },
  { key: 'topics', label: 'Topics' },
  { key: 'pages', label: 'Pages' },
] as const
export type StatsSection = (typeof STATS_SECTIONS)[number]['key']
// The sections of metric tiles; 'topics' and 'pages' have their own panels.
export type ActivitySection = Exclude<StatsSection, 'topics' | 'pages'>

export type IdVerificationDay = {
  date: string
  approvals: number
  denials: number
}

export function getActivityMetrics(props: {
  stats: DailyStatsRow[]
  idVerifications?: IdVerificationDay[]
  isAdmin: boolean
}): Record<ActivitySection, StatMetric[]> {
  const { stats, idVerifications = [], isAdmin } = props
  const dataFor = dataForStats(stats)
  const daily = (key: NumericStatsColumn) => ({
    key: 'daily',
    label: 'Daily',
    values: dataFor(key),
  })
  const avg7 = (key: NumericStatsColumn, skip = 0, rounded = false) => {
    const values = rollingAvg(dataFor(key), 7).slice(skip)
    return {
      key: '7d',
      label: '7d avg',
      values: rounded ? values.map(round) : values,
    }
  }

  return {
    users: [
      {
        key: 'active-users',
        label: 'Active users',
        description: 'Users who took any action on the site.',
        views: [daily('dav'), avg7('dav', 0, true)],
        defaultView: '7d',
      },
      {
        key: 'active-traders',
        label: 'Active traders',
        description:
          'Users who traded in, commented on, or created a question.',
        views: [
          daily('dau'),
          avg7('dau', 0, true),
          { key: 'weekly', label: 'Weekly', values: dataFor('wau') },
          { key: 'monthly', label: 'Monthly', values: dataFor('mau') },
        ],
        defaultView: '7d',
      },
      {
        key: 'signups',
        label: 'Signups',
        description: 'New accounts, excluding likely spam.',
        views: [daily('signups_real'), avg7('signups_real', 0, true)],
        defaultView: '7d',
        summary: { kind: 'sum' },
      },
      {
        key: 'stickiness',
        label: 'Stickiness',
        description:
          'Active traders on a day (or in a week) as a share of those active over the longer period.',
        pct: true,
        views: [
          {
            key: 'dau-wau',
            label: 'DAU / WAU',
            values: ratioSeries(stats, 'dau', 'wau'),
          },
          {
            key: 'dau-mau',
            label: 'DAU / MAU',
            values: ratioSeries(stats, 'dau', 'mau'),
          },
          {
            key: 'wau-mau',
            label: 'WAU / MAU',
            values: ratioSeries(stats, 'wau', 'mau'),
          },
        ],
        defaultView: 'dau-mau',
      },
      ...(idVerifications.length > 0
        ? [
            {
              key: 'id-verifications',
              label: 'ID verifications',
              description:
                'Daily identity verification attempts and their outcomes.',
              views: [
                {
                  key: 'approvals',
                  label: 'Approvals',
                  values: idVerifications.map((d) => ({
                    x: d.date,
                    y: d.approvals,
                  })),
                },
                {
                  key: 'denials',
                  label: 'Denials',
                  values: idVerifications.map((d) => ({
                    x: d.date,
                    y: d.denials,
                  })),
                },
                {
                  key: 'total',
                  label: 'Total',
                  values: idVerifications.map((d) => ({
                    x: d.date,
                    y: d.approvals + d.denials,
                  })),
                },
              ],
              defaultView: 'approvals',
              summary: { kind: 'sum' as const, view: 'approvals' },
            },
          ]
        : []),
    ],
    retention: [
      {
        key: 'd1',
        label: 'D1 retention',
        description:
          'Share of active traders who are active again the next day.',
        pct: true,
        views: [daily('d1'), avg7('d1')],
        defaultView: '7d',
      },
      {
        key: 'w1',
        label: 'W1 retention',
        description:
          'Share of active traders who are active again the next week.',
        pct: true,
        views: [daily('w1')],
        defaultView: 'daily',
      },
      {
        key: 'm1',
        label: 'M1 retention',
        description:
          'Share of active traders who are active again the next month.',
        pct: true,
        views: [daily('m1')],
        defaultView: 'daily',
      },
      {
        key: 'nd1',
        label: 'New user D1',
        description: 'Share of new users who are active again the next day.',
        pct: true,
        views: [daily('nd1'), avg7('nd1', 7)],
        defaultView: '7d',
      },
      {
        key: 'nw1',
        label: 'New user W1',
        description: 'Share of new users who are active again the next week.',
        pct: true,
        views: [
          { key: 'daily', label: 'Daily', values: dataFor('nw1').slice(14) },
        ],
        defaultView: 'daily',
      },
      {
        key: 'active-days',
        label: 'Active days D1–D3',
        description:
          'Average share of the three days after signing up that new users are active.',
        pct: true,
        views: [daily('active_d1_to_d3'), avg7('active_d1_to_d3', 7)],
        defaultView: '7d',
      },
    ],
    engagement: [
      {
        key: 'trades',
        label: `${capitalize(TRADE_TERM)}s`,
        description: `${capitalize(TRADE_TERM)}s placed each day.`,
        views: [daily('bet_count'), avg7('bet_count', 0, true)],
        defaultView: 'daily',
        summary: { kind: 'sum' },
        note: `As of October 8, 2026, ${TRADE_TERM}s exclude API limit orders that never filled. Bots can post thousands of these a day without anyone trading against them, and at their peak they outnumbered real ${TRADE_TERM}s more than 10 to 1. This is applied retroactively to all days since May 2023, when we started recording which orders come from the API.`,
      },
      {
        key: 'questions',
        label: 'Questions created',
        description: 'New questions each day.',
        views: [daily('contract_count'), avg7('contract_count', 0, true)],
        defaultView: 'daily',
        summary: { kind: 'sum' },
      },
      {
        key: 'comments',
        label: 'Comments',
        description: 'Comments posted each day.',
        views: [daily('comment_count'), avg7('comment_count', 0, true)],
        defaultView: 'daily',
        summary: { kind: 'sum' },
      },
      {
        key: 'mana-traded',
        label: `Mana ${TRADED_TERM}`,
        description: `Sum of ${TRADE_TERM} amounts. (Divided by 100 to be more readable.)`,
        views: [
          daily('bet_amount'),
          {
            key: 'weekly',
            label: 'Weekly',
            values: rollingSum(dataFor('bet_amount'), 7),
          },
          {
            key: 'monthly',
            label: 'Monthly',
            values: rollingSum(dataFor('bet_amount'), 30),
          },
        ],
        defaultView: 'weekly',
        summary: { kind: 'sum' },
      },
    ],
    conversion: [
      {
        key: 'activation',
        label: 'Activation rate',
        description: `Out of all new users, how many placed at least one ${TRADE_TERM}?`,
        pct: true,
        views: [daily('activation'), avg7('activation', 7)],
        defaultView: '7d',
      },
      {
        key: 'd1-trades',
        label: `D1 ${TRADE_TERM}s per new user`,
        description: `On average, how many ${TRADE_TERM}s new users placed in their first 24 hours.`,
        views: [
          daily('d1_bet_average'),
          {
            key: '3d',
            label: '3d avg',
            values: dataFor('d1_bet_3_day_average').slice(1),
          },
        ],
        defaultView: '3d',
        note: isAdmin ? (
          <Link
            className={clsx(linkClass, MOD_ACTION_TEXT_CLASS)}
            href={'/admin/journeys'}
          >
            <ModActionBadge admin className="mr-1 align-middle" />
            See what new users did on the journeys page.
          </Link>
        ) : undefined,
      },
      {
        key: 'feed-conversion',
        label: 'Feed conversion',
        description: `Clicks, ${TRADE_TERM}s and likes on feed cards per card view.`,
        pct: true,
        views: [daily('feed_conversion'), avg7('feed_conversion')],
        defaultView: '7d',
      },
    ],
  }
}
