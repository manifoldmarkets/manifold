import { useState } from 'react'
import toast from 'react-hot-toast'
import { Page } from 'web/components/layout/page'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Title } from 'web/components/widgets/title'
import { NoSEO } from 'web/components/NoSEO'
import { Button } from 'web/components/buttons/button'
import { useAdmin } from 'web/hooks/use-admin'
import { useRedirectIfSignedOut } from 'web/hooks/use-redirect-if-signed-out'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { formatMoney } from 'common/util/format'
import Link from 'next/link'

export default function AdminTicketsPage() {
  useRedirectIfSignedOut()
  const isAdmin = useAdmin()

  const { data, loading } = useAPIGetter('get-ticket-orders', {
    itemId: 'manifest-ticket',
  })
  const { data: stockData } = useAPIGetter('get-ticket-stock', {
    itemId: 'manifest-ticket',
  })

  const [copying, setCopying] = useState(false)

  if (!isAdmin) return <></>

  const orders = data?.orders ?? []

  const copyEmails = async () => {
    const emails = orders
      .map((o) => o.email)
      .filter((e): e is string => !!e)
      .join(', ')
    if (!emails) {
      toast.error('No emails to copy')
      return
    }
    setCopying(true)
    try {
      await navigator.clipboard.writeText(emails)
      toast.success(`Copied ${orders.length} email${orders.length === 1 ? '' : 's'}`)
    } catch {
      toast.error('Copy failed')
    } finally {
      setCopying(false)
    }
  }

  return (
    <Page trackPageView="admin tickets page">
      <NoSEO />
      <Col className="mx-8 gap-6">
        <Title>Manifest Ticket Orders</Title>

        <div className="rounded-lg bg-amber-50 p-3 text-sm dark:bg-amber-950/30">
          <span className="text-amber-700 dark:text-amber-300">
            Refresh the page before taking action — data does not live-update.
          </span>
        </div>

        {stockData && (
          <Row className="items-center gap-4">
            <div className="text-lg">
              <b>{stockData.sold}</b> of <b>{stockData.maxStock}</b> tickets
              sold
            </div>
            <div className="text-ink-500">
              ({stockData.available} remaining)
            </div>
          </Row>
        )}

        <Row className="gap-2">
          <Button color="indigo" onClick={copyEmails} disabled={copying || orders.length === 0}>
            Copy all emails
          </Button>
        </Row>

        {loading && <div className="text-ink-500">Loading…</div>}

        {!loading && orders.length === 0 && (
          <div className="text-ink-500">No ticket orders yet.</div>
        )}

        {orders.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-ink-200 border-b text-left">
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">User</th>
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2">Amount</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr
                    key={o.id}
                    className="border-ink-200 border-b last:border-b-0"
                  >
                    <td className="whitespace-nowrap px-3 py-2">
                      {new Date(o.createdTime).toLocaleString()}
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/${o.username}`}
                        className="text-primary-700 hover:underline"
                      >
                        {o.displayName || o.username}
                      </Link>
                      <div className="text-ink-500 text-xs">@{o.username}</div>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {o.email ?? '—'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {formatMoney(o.priceMana)}
                    </td>
                    <td className="px-3 py-2">{o.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Col>
    </Page>
  )
}
