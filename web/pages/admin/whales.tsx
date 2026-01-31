import clsx from 'clsx'
import { useState } from 'react'

import { formatMoney } from 'common/util/format'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { Avatar } from 'web/components/widgets/avatar'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { Title } from 'web/components/widgets/title'
import { UserLink } from 'web/components/widgets/user-link'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { useAdmin } from 'web/hooks/use-admin'
import { useUser } from 'web/hooks/use-user'

export default function AdminWhalesPage() {
  const user = useUser()
  const isAdmin = useAdmin()

  // Show nothing for non-admins
  if (!user || !isAdmin) {
    return (
      <Page trackPageView="admin-whales">
        <Col className="items-center justify-center py-20">
          <p className="text-ink-500">Admin access required</p>
        </Col>
      </Page>
    )
  }

  return (
    <Page trackPageView="admin-whales">
      <Col className="gap-6">
        <Title>Top Mana Purchasers (Whales)</Title>
        <WhalesTable />
      </Col>
    </Page>
  )
}

type PaymentType = 'stripe' | 'apple' | 'gidx' | 'crypto' | 'unknown'

function WhalesTable() {
  const { data } = useAPIGetter('admin-get-top-whale-users', { limit: 100 })
  const [expandedUser, setExpandedUser] = useState<string | null>(null)

  if (data === undefined) {
    return <LoadingIndicator />
  }

  const users = data.users

  // Calculate grand totals
  const grandTotal = users.reduce((acc, user) => acc + user.totalPaidCents, 0)

  return (
    <Col className="gap-6">
      {/* Summary card */}
      <Row className="flex-wrap gap-4">
        <SummaryCard
          label={`Total from top ${users.length} users`}
          amount={grandTotal}
        />
      </Row>

      {/* Users table */}
      <div className="bg-canvas-0 overflow-x-auto rounded-lg border">
        <table className="w-full">
          <thead>
            <tr className="bg-canvas-50 border-b">
              <th className="text-ink-600 px-4 py-3 text-left text-sm font-medium">
                #
              </th>
              <th className="text-ink-600 px-4 py-3 text-left text-sm font-medium">
                User
              </th>
              <th className="text-ink-600 px-4 py-3 text-right text-sm font-medium">
                Total Paid
              </th>
              <th className="text-ink-600 px-4 py-3 text-right text-sm font-medium">
                Total Mana
              </th>
              <th className="text-ink-600 px-4 py-3 text-right text-sm font-medium">
                Purchases
              </th>
              <th className="text-ink-600 px-4 py-3 text-left text-sm font-medium">
                Last Purchase
              </th>
              <th className="text-ink-600 px-4 py-3 text-left text-sm font-medium">
                Breakdown
              </th>
            </tr>
          </thead>
          <tbody>
            {users.map((user, index) => (
              <tr key={user.userId} className="border-b last:border-b-0">
                <td className="text-ink-500 px-4 py-3 text-sm">{index + 1}</td>
                <td className="px-4 py-3">
                  <Row className="items-center gap-2">
                    <Avatar
                      username={user.username}
                      avatarUrl={user.avatarUrl}
                      size="sm"
                    />
                    <UserLink
                      user={{
                        id: user.userId,
                        username: user.username,
                        name: user.name,
                      }}
                    />
                  </Row>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="font-semibold text-green-600">
                    {formatDollars(user.totalPaidCents / 100)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-medium">
                  {formatMoney(user.totalMana)}
                </td>
                <td className="text-ink-600 px-4 py-3 text-right text-sm">
                  {user.purchaseCount}
                </td>
                <td className="text-ink-600 whitespace-nowrap px-4 py-3 text-sm">
                  {formatDate(user.lastPurchaseTime)}
                </td>
                <td className="px-4 py-3">
                  <button
                    className="text-primary-600 hover:text-primary-700 text-sm underline"
                    onClick={() =>
                      setExpandedUser(
                        expandedUser === user.userId ? null : user.userId
                      )
                    }
                  >
                    {expandedUser === user.userId ? 'Hide' : 'Show'}
                  </button>
                  {expandedUser === user.userId && (
                    <BreakdownPopup byType={user.byType} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Col>
  )
}

function BreakdownPopup(props: {
  byType: {
    stripe: { paidCents: number; mana: number; count: number }
    apple: { paidCents: number; mana: number; count: number }
    gidx: { paidCents: number; mana: number; count: number }
    crypto: { paidCents: number; mana: number; count: number }
    unknown: { paidCents: number; mana: number; count: number }
  }
}) {
  const { byType } = props

  const types: { key: PaymentType; label: string; color: string }[] = [
    { key: 'stripe', label: 'Stripe', color: 'bg-indigo-100 text-indigo-700' },
    { key: 'crypto', label: 'Crypto', color: 'bg-teal-100 text-teal-700' },
    { key: 'gidx', label: 'Card (GIDX)', color: 'bg-green-100 text-green-700' },
    { key: 'apple', label: 'Apple', color: 'bg-gray-100 text-gray-700' },
    { key: 'unknown', label: 'Unknown', color: 'bg-gray-100 text-gray-500' },
  ]

  const activeTypes = types.filter((t) => byType[t.key].count > 0)

  if (activeTypes.length === 0) {
    return null
  }

  return (
    <div className="bg-canvas-50 mt-2 rounded-lg border p-3">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-ink-500">
            <th className="pb-2 text-left font-medium">Type</th>
            <th className="pb-2 text-right font-medium">Paid</th>
            <th className="pb-2 text-right font-medium">Mana</th>
            <th className="pb-2 text-right font-medium">#</th>
          </tr>
        </thead>
        <tbody>
          {activeTypes.map(({ key, label, color }) => (
            <tr key={key}>
              <td className="py-1">
                <span
                  className={clsx(
                    'rounded-full px-2 py-0.5 text-xs font-medium',
                    color
                  )}
                >
                  {label}
                </span>
              </td>
              <td className="py-1 text-right">
                {formatDollars(byType[key].paidCents / 100)}
              </td>
              <td className="py-1 text-right">
                {formatMoney(byType[key].mana)}
              </td>
              <td className="text-ink-500 py-1 text-right">
                {byType[key].count}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SummaryCard(props: { label: string; amount: number }) {
  const { label, amount } = props

  return (
    <div className="bg-canvas-50 border-canvas-200 rounded-lg border px-4 py-3">
      <div className="text-ink-500 text-xs font-medium">{label}</div>
      <div className="text-ink-900 text-xl font-bold">
        {formatDollars(amount / 100)}
      </div>
    </div>
  )
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatDollars(amount: number): string {
  return '$' + amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
