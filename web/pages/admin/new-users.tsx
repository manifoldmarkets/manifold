import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { Title } from 'web/components/widgets/title'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { useAdmin } from 'web/hooks/use-admin'
import { useUser } from 'web/hooks/use-user'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { Avatar } from 'web/components/widgets/avatar'
import { UserLink } from 'web/components/widgets/user-link'
import { formatMoney } from 'common/util/format'
import clsx from 'clsx'
import { useState } from 'react'
import { api } from 'web/lib/api/api'
import toast from 'react-hot-toast'
import SuperBanControl from 'web/components/SuperBanControl'

export default function AdminNewUsersPage() {
  const user = useUser()
  const isAdmin = useAdmin()

  if (!user || !isAdmin) {
    return (
      <Page trackPageView="admin-new-users">
        <Col className="items-center justify-center py-20">
          <p className="text-ink-500">Admin access required</p>
        </Col>
      </Page>
    )
  }

  return (
    <Page trackPageView="admin-new-users">
      <Col className="gap-6">
        <Title>New Users</Title>
        <NewUsersTable />
      </Col>
    </Page>
  )
}

function NewUsersTable() {
  const { data, refresh } = useAPIGetter('admin-get-new-users', { limit: 100 })
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  if (data === undefined) {
    return <LoadingIndicator />
  }

  const users = data.users

  const handleEligibilityChange = async (
    userId: string,
    value: string
  ) => {
    if (!value) return
    setUpdatingId(userId)
    try {
      await api('admin-set-bonus-eligibility', {
        userId,
        bonusEligibility: value,
      })
      toast.success('Bonus eligibility updated')
      refresh()
    } catch (e) {
      toast.error('Failed to update bonus eligibility')
    } finally {
      setUpdatingId(null)
    }
  }

  return (
    <div className="bg-canvas-0 overflow-x-auto rounded-lg border">
      <table className="w-full">
        <thead>
          <tr className="bg-canvas-50 border-b">
            <th className="text-ink-600 px-4 py-3 text-left text-sm font-medium">
              Time
            </th>
            <th className="text-ink-600 px-4 py-3 text-left text-sm font-medium">
              User
            </th>
            <th className="text-ink-600 px-4 py-3 text-left text-sm font-medium">
              Balance
            </th>
            <th className="text-ink-600 px-4 py-3 text-left text-sm font-medium">
              Referred By
            </th>
            <th className="text-ink-600 px-4 py-3 text-left text-sm font-medium">
              Purchased Mana
            </th>
            <th className="text-ink-600 px-4 py-3 text-left text-sm font-medium">
              IP Address
            </th>
            <th className="text-ink-600 px-4 py-3 text-left text-sm font-medium">
              Email
            </th>
            <th className="text-ink-600 px-4 py-3 text-left text-sm font-medium">
              Bonus Eligibility
            </th>
            <th className="text-ink-600 px-4 py-3 text-left text-sm font-medium">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-b last:border-b-0">
              <td className="text-ink-600 whitespace-nowrap px-4 py-3 text-sm">
                {formatTime(u.createdTime)}
              </td>
              <td className="px-4 py-3">
                <Row className="items-center gap-2">
                  <Avatar username={u.username} avatarUrl={u.avatarUrl} size="sm" />
                  <UserLink
                    user={{
                      id: u.id,
                      username: u.username,
                      name: u.name,
                    }}
                  />
                </Row>
              </td>
              <td className="px-4 py-3 font-medium">{formatMoney(u.balance)}</td>
              <td className="px-4 py-3">
                {u.referredByUserId ? (
                  <UserLink
                    user={{
                      id: u.referredByUserId,
                      username: u.referredByUsername ?? 'unknown',
                      name: u.referredByName ?? 'Unknown',
                    }}
                  />
                ) : (
                  <span className="text-ink-400">—</span>
                )}
              </td>
              <td className="px-4 py-3">
                <span
                  className={clsx(
                    'rounded-full px-2 py-0.5 text-xs font-medium',
                    u.purchasedMana
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-600'
                  )}
                >
                  {u.purchasedMana ? 'Yes' : 'No'}
                </span>
              </td>
              <td className="px-4 py-3 text-sm">
                {u.ipAddress ?? <span className="text-ink-400">—</span>}
              </td>
              <td className="px-4 py-3 text-sm">
                {u.email ?? <span className="text-ink-400">—</span>}
              </td>
              <td className="px-4 py-3">
                <select
                  value={u.bonusEligibility ?? ''}
                  onChange={(e) => handleEligibilityChange(u.id, e.target.value)}
                  disabled={updatingId === u.id}
                  className={clsx(
                    'rounded-lg border px-2 py-1 text-xs font-medium',
                    u.bonusEligibility === 'verified' &&
                      'border-green-200 bg-green-50 text-green-700',
                    u.bonusEligibility === 'grandfathered' &&
                      'border-indigo-200 bg-indigo-50 text-indigo-700',
                    u.bonusEligibility === 'ineligible' &&
                      'border-gray-200 bg-gray-50 text-gray-600',
                    !u.bonusEligibility &&
                      'border-canvas-200 bg-canvas-50 text-ink-500',
                    updatingId === u.id && 'cursor-not-allowed opacity-60'
                  )}
                >
                  <option value="">Unset</option>
                  <option value="verified">Verified</option>
                  <option value="grandfathered">Grandfathered</option>
                  <option value="ineligible">Ineligible</option>
                </select>
              </td>
              <td className="px-4 py-3">
                <SuperBanControl userId={u.id} onBan={refresh} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}
