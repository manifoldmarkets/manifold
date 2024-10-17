import { useState } from 'react'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Title } from 'web/components/widgets/title'
import { formatMoneyUSD } from 'common/util/format'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { Row } from 'web/components/layout/row'
import { UserAvatarAndBadge } from 'web/components/widgets/user-link'
import Link from 'next/link'
import { linkClass } from 'web/components/widgets/site-link'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { getStatusColor } from 'web/components/cashout/select-cashout-options'
import { PendingCashoutStatusData } from 'common/gidx/gidx'
import { PaginationNextPrev } from 'web/components/widgets/pagination'

export default function AdminCashouts() {
  const [page, setPage] = useState(0)

  const { data: cashouts } = useAPIGetter('get-cashouts', {
    limit: 10,
    offset: page * 10,
  })
  console.log('redemptions', cashouts)

  return (
    <Page trackPageView="admin-redemptions">
      <Col className="gap-4">
        <Title>Redemptions</Title>
        <Col className="overflow-auto">
          <table className="w-full ">
            <thead>
              <tr>
                <th className="text-left">User</th>
                <th className="text-left">Amount</th>
                <th className="text-left">Date</th>
                <th className="text-left">Status</th>
                <th className="text-left">GIDX</th>
              </tr>
            </thead>
            <tbody>
              {cashouts === undefined ? (
                <LoadingIndicator />
              ) : (
                cashouts?.map((cashout: PendingCashoutStatusData) => (
                  <tr key={cashout.txn.id}>
                    <td className="py-2">
                      <Row className="items-center gap-2">
                        <UserAvatarAndBadge user={cashout.user} />
                      </Row>
                    </td>
                    <td>{formatMoneyUSD(cashout.txn.payoutInDollars, true)}</td>
                    <td className="whitespace-nowrap">
                      {new Date(cashout.txn.createdTime).toLocaleString()}
                    </td>
                    <td className="whitespace-nowrap">
                      <span
                        className={`rounded-full px-2 py-1 text-xs ${getStatusColor(
                          cashout.txn.gidxStatus
                        )}`}
                      >
                        {cashout.txn.gidxStatus}
                      </span>
                    </td>
                    <td className="whitespace-nowrap">
                      {!cashout.txn.transactionId ? (
                        ''
                      ) : (
                        <Link
                          className={linkClass}
                          href={`https://portal.gidx-service.in/Payments?TransactionID=${
                            cashout.txn.transactionId
                          }&CustomerID=&dpStart=${new Date(
                            cashout.txn.createdTime
                          )
                            .toLocaleDateString('en-US', {
                              month: '2-digit',
                              day: '2-digit',
                              year: 'numeric',
                            })
                            .replace(/\//g, '%2F')}&dpEnd=${new Date()
                            .toLocaleDateString('en-US', {
                              month: '2-digit',
                              day: '2-digit',
                              year: 'numeric',
                            })
                            .replace(/\//g, '%2F')}&DateRange=${new Date(
                            cashout.txn.createdTime
                          )
                            .toLocaleDateString('en-US', {
                              month: '2-digit',
                              day: '2-digit',
                              year: 'numeric',
                            })
                            .replace(/\//g, '%2F')}+-+${new Date()
                            .toLocaleDateString('en-US', {
                              month: '2-digit',
                              day: '2-digit',
                              year: 'numeric',
                            })
                            .replace(
                              /\//g,
                              '%2F'
                            )}&downloadType=&SearchRecords=true`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          inspect
                        </Link>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </Col>
        <PaginationNextPrev
          isStart={page === 0}
          isEnd={page === 10}
          isLoading={false}
          isComplete={true}
          getPrev={() => setPage(page - 1)}
          getNext={() => setPage(page + 1)}
        />
      </Col>
    </Page>
  )
}
