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

export default function AdminSalesPage() {
  const user = useUser()
  const isAdmin = useAdmin()

  // Show nothing for non-admins
  if (!user || !isAdmin) {
    return (
      <Page trackPageView="admin-sales">
        <Col className="items-center justify-center py-20">
          <p className="text-ink-500">Admin access required</p>
        </Col>
      </Page>
    )
  }

  return (
    <Page trackPageView="admin-sales">
      <Col className="gap-6">
        <Title>Mana Sales</Title>
        <SalesTable />
      </Col>
    </Page>
  )
}

function SalesTable() {
  const { data } = useAPIGetter('admin-get-mana-sales', { limit: 100 })

  if (data === undefined) {
    return <LoadingIndicator />
  }

  const sales = data.sales

  // Calculate totals by payment type
  const totals = sales.reduce(
    (acc, sale) => {
      acc[sale.paymentType] =
        (acc[sale.paymentType] || 0) + (sale.paidInCents || 0)
      acc.total += sale.paidInCents || 0
      return acc
    },
    { stripe: 0, apple: 0, gidx: 0, crypto: 0, unknown: 0, total: 0 } as Record<
      string,
      number
    >
  )

  return (
    <Col className="gap-6">
      {/* Summary cards */}
      <Row className="flex-wrap gap-4">
        <SummaryCard label="Total (last 100)" amount={totals.total} />
        <SummaryCard label="Stripe" amount={totals.stripe} color="indigo" />
        <SummaryCard label="Crypto" amount={totals.crypto} color="teal" />
        <SummaryCard label="Card (GIDX)" amount={totals.gidx} color="green" />
        <SummaryCard label="Apple" amount={totals.apple} color="gray" />
      </Row>

      {/* Sales table */}
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
                Mana
              </th>
              <th className="text-ink-600 px-4 py-3 text-left text-sm font-medium">
                Paid
              </th>
              <th className="text-ink-600 px-4 py-3 text-left text-sm font-medium">
                Type
              </th>
            </tr>
          </thead>
          <tbody>
            {sales.map((sale) => (
              <tr key={sale.id} className="border-b last:border-b-0">
                <td className="text-ink-600 whitespace-nowrap px-4 py-3 text-sm">
                  {formatTime(sale.createdTime)}
                </td>
                <td className="px-4 py-3">
                  <Row className="items-center gap-2">
                    <Avatar
                      username={sale.username}
                      avatarUrl={sale.avatarUrl}
                      size="sm"
                    />
                    <UserLink
                      user={{
                        id: sale.userId,
                        username: sale.username,
                        name: sale.name,
                      }}
                    />
                  </Row>
                </td>
                <td className="px-4 py-3 font-medium">
                  {formatMoney(sale.amount)}
                </td>
                <td className="px-4 py-3">
                  {sale.paidInCents ? (
                    <span className="font-medium text-green-600">
                      ${(sale.paidInCents / 100).toFixed(2)}
                    </span>
                  ) : (
                    <span className="text-ink-400">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <PaymentTypeBadge type={sale.paymentType} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Col>
  )
}

function SummaryCard(props: {
  label: string
  amount: number
  color?: 'indigo' | 'teal' | 'green' | 'gray'
}) {
  const { label, amount, color } = props

  return (
    <div
      className={clsx(
        'rounded-lg border px-4 py-3',
        color === 'indigo' && 'border-indigo-200 bg-indigo-50',
        color === 'teal' && 'border-teal-200 bg-teal-50',
        color === 'green' && 'border-green-200 bg-green-50',
        color === 'gray' && 'border-gray-200 bg-gray-50',
        !color && 'bg-canvas-50 border-canvas-200'
      )}
    >
      <div className="text-ink-500 text-xs font-medium">{label}</div>
      <div
        className={clsx(
          'text-xl font-bold',
          color === 'indigo' && 'text-indigo-700',
          color === 'teal' && 'text-teal-700',
          color === 'green' && 'text-green-700',
          color === 'gray' && 'text-gray-700',
          !color && 'text-ink-900'
        )}
      >
        ${(amount / 100).toFixed(2)}
      </div>
    </div>
  )
}

function PaymentTypeBadge(props: { type: string }) {
  const { type } = props

  const config: Record<string, { label: string; className: string }> = {
    stripe: {
      label: 'Stripe',
      className: 'bg-indigo-100 text-indigo-700',
    },
    crypto: {
      label: 'Crypto',
      className: 'bg-teal-100 text-teal-700',
    },
    gidx: {
      label: 'Card',
      className: 'bg-green-100 text-green-700',
    },
    apple: {
      label: 'Apple',
      className: 'bg-gray-100 text-gray-700',
    },
    unknown: {
      label: 'Unknown',
      className: 'bg-gray-100 text-gray-500',
    },
  }

  const { label, className } = config[type] || config.unknown

  return (
    <span
      className={clsx(
        'rounded-full px-2 py-0.5 text-xs font-medium',
        className
      )}
    >
      {label}
    </span>
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
