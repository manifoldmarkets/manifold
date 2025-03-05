import { useState } from 'react'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Title } from 'web/components/widgets/title'
import { formatMoneyUSD } from 'common/util/format'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { Row } from 'web/components/layout/row'
import { UserAvatarAndBadge, UserLink } from 'web/components/widgets/user-link'
import Link from 'next/link'
import { linkClass } from 'web/components/widgets/site-link'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { getStatusColor } from 'web/components/cashout/select-cashout-options'
import { PendingCashoutStatusData } from 'common/gidx/gidx'
import { PaginationNextPrev } from 'web/components/widgets/pagination'
import { api } from 'web/lib/api/api'
import { ConfirmationButton } from 'web/components/buttons/confirmation-button'

export default function AdminCashouts() {
  const [page, setPage] = useState(0)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { data: cashouts, refresh } = useAPIGetter('get-cashouts', {
    limit: 10,
    offset: page * 10,
  })

  const handleApproveAndProcess = async (cashout: PendingCashoutStatusData) => {
    setProcessingId(cashout.txn.id)
    setError(null)
    try {
      const { data } = cashout
      if (!data) {
        throw new Error('No data')
      }
      const { AccountNumber, RoutingNumber, NameOnAccount, BillingAddress } =
        data
      if (
        !AccountNumber ||
        !RoutingNumber ||
        !NameOnAccount ||
        !BillingAddress ||
        !BillingAddress.City ||
        !BillingAddress.StateCode ||
        !BillingAddress.PostalCode ||
        !data.gps ||
        !data.ip
      ) {
        throw new Error('Missing data')
      }
      // Get checkout session
      const checkoutSession = await api('get-checkout-session-gidx', {
        DeviceGPS: data.gps,
        PayActionCode: 'PAYOUT',
        userId: cashout.user.id,
        ip: data.ip,
      })

      if (checkoutSession.status === 'error') {
        throw new Error(checkoutSession.message)
      }
      if (!checkoutSession.session) {
        throw new Error('No session')
      }

      // Complete cashout session
      const completeCashout = await api('complete-cashout-session-gidx', {
        PaymentMethod: {
          Type: 'ACH',
          AccountNumber: AccountNumber,
          RoutingNumber: RoutingNumber,
          NameOnAccount: NameOnAccount,
          BillingAddress: {
            AddressLine1: BillingAddress.AddressLine1,
            City: BillingAddress.City,
            StateCode: BillingAddress.StateCode,
            PostalCode: BillingAddress.PostalCode,
            CountryCode: 'US',
          },
        },
        SavePaymentMethod: false,
        PaymentAmount: {
          dollars: cashout.txn.payoutInDollars,
          manaCash: cashout.txn.amount,
        },
        MerchantSessionID: checkoutSession.session.MerchantSessionID,
        MerchantTransactionID: checkoutSession.session.MerchantTransactionID,
        DeviceGPS: data.gps,
        txnId: cashout.txn.id,
        userId: cashout.user.id,
        ip: data.ip,
      })

      if (completeCashout.status === 'error') {
        throw new Error(completeCashout.message)
      }

      // If successful, refresh the cashouts list
      refresh()
    } catch (error) {
      console.error('Error processing cashout:', error)
      setError(
        error instanceof Error ? error.message : 'An unknown error occurred'
      )
    } finally {
      setProcessingId(null)
    }
  }

  return (
    <Page trackPageView="admin-redemptions">
      <Col className="gap-4">
        <Title>Redemptions</Title>
        {error && (
          <div className="relative rounded border border-red-400 bg-red-100 px-4 py-3 text-red-700">
            <span className="font-bold">Error: </span>
            <span className="block sm:inline">{error}</span>
          </div>
        )}
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
                <tr>
                  <td colSpan={5} className="py-4">
                    <LoadingIndicator />
                  </td>
                </tr>
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
                        <ConfirmationButton
                          openModalBtn={{
                            label: `Approve & Process`,
                            size: 'sm',
                            color: 'indigo',
                            disabled: processingId !== null,
                          }}
                          cancelBtn={{
                            label: 'Cancel',
                            color: 'gray',
                            disabled: processingId !== null,
                          }}
                          submitBtn={{
                            label: `Approve & Process ${formatMoneyUSD(
                              cashout.txn.payoutInDollars,
                              true
                            )}`,
                            color: 'indigo',
                            isSubmitting: processingId === cashout.txn.id,
                          }}
                          onSubmit={() => handleApproveAndProcess(cashout)}
                        >
                          <span>
                            Are you sure you want to approve and process this
                            cashout to{' '}
                            <UserLink
                              className="inline-block"
                              user={cashout.user}
                            />{' '}
                            for{' '}
                            {formatMoneyUSD(cashout.txn.payoutInDollars, true)}?
                          </span>
                        </ConfirmationButton>
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
          isEnd={page === 50}
          isLoading={false}
          isComplete={true}
          getPrev={() => setPage(page - 1)}
          getNext={() => setPage(page + 1)}
        />
      </Col>
    </Page>
  )
}
