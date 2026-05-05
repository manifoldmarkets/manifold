import { useState } from 'react'
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
import { api } from 'web/lib/api/api'
import toast from 'react-hot-toast'
import clsx from 'clsx'

type PaymentStatus = 'awaiting' | 'sent' | 'rejected'

export default function AdminPrizePage() {
  const user = useUser()
  const isAdmin = useAdmin()

  // Show nothing for non-admins
  if (!user || !isAdmin) {
    return (
      <Page trackPageView="admin-prize">
        <Col className="items-center justify-center py-20">
          <p className="text-ink-500">Admin access required</p>
        </Col>
      </Page>
    )
  }

  return (
    <Page trackPageView="admin-prize">
      <Col className="gap-6">
        <Title>Prize Drawing Payouts</Title>
        <PrizeClaimsTable />
      </Col>
    </Page>
  )
}

function PrizeClaimsTable() {
  const { data, refresh } = useAPIGetter('admin-get-prize-claims', {})
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [copiedClaimId, setCopiedClaimId] = useState<string | null>(null)

  const handleStatusChange = async (
    claimId: string | null,
    newStatus: PaymentStatus
  ) => {
    if (!claimId) {
      toast.error('User has not submitted their wallet address yet')
      return
    }

    setUpdatingId(claimId)
    try {
      await api('admin-update-prize-payment', {
        claimId,
        paymentStatus: newStatus,
      })
      toast.success(`Status updated to ${newStatus}`)
      setCopiedClaimId((id) => (id === claimId ? null : id))
      refresh()
    } catch (e) {
      toast.error('Failed to update status')
    } finally {
      setUpdatingId(null)
    }
  }

  const handleCopyAddress = (claimId: string | null, address: string) => {
    navigator.clipboard.writeText(address)
    toast.success('Wallet address copied')
    if (claimId) setCopiedClaimId(claimId)
  }

  if (data === undefined) {
    return <LoadingIndicator />
  }

  const claims = data.claims

  // Group by sweepstakes number
  const groupedClaims = claims.reduce((acc, claim) => {
    const key = claim.sweepstakesNum
    if (!acc[key]) acc[key] = []
    acc[key].push(claim)
    return acc
  }, {} as Record<number, typeof claims>)

  // CSV: only awaiting claims with a wallet address
  const csvClaims = claims.filter(
    (c) => c.walletAddress && c.paymentStatus === 'awaiting'
  )
  const csvContent = csvClaims
    .map((c) => `${c.walletAddress},${c.prizeAmountUsdc}`)
    .join('\n')

  return (
    <Col className="gap-8">
      {Object.entries(groupedClaims)
        .sort(([a], [b]) => Number(b) - Number(a))
        .map(([sweepstakesNum, sweepClaims]) => (
          <Col key={sweepstakesNum} className="gap-4">
            <h2 className="text-ink-700 text-lg font-semibold">
              Drawing #{sweepstakesNum}
            </h2>

            <div className="bg-canvas-0 overflow-x-auto rounded-lg border">
              <table className="w-full">
                <thead>
                  <tr className="bg-canvas-50 border-b">
                    <th className="text-ink-600 px-4 py-3 text-left text-sm font-medium">
                      Rank
                    </th>
                    <th className="text-ink-600 px-4 py-3 text-left text-sm font-medium">
                      User
                    </th>
                    <th className="text-ink-600 px-4 py-3 text-left text-sm font-medium">
                      Prize
                    </th>
                    <th className="text-ink-600 px-4 py-3 text-left text-sm font-medium">
                      Wallet
                    </th>
                    <th className="text-ink-600 px-4 py-3 text-left text-sm font-medium">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sweepClaims.map((claim) => (
                    <tr
                      key={`${claim.sweepstakesNum}-${claim.userId}`}
                      className="border-b last:border-b-0"
                    >
                      <td className="px-4 py-3">
                        <span
                          className={clsx(
                            'inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold',
                            claim.rank === 1 && 'bg-amber-100 text-amber-700',
                            claim.rank === 2 && 'bg-gray-100 text-gray-600',
                            claim.rank === 3 && 'bg-orange-100 text-orange-700',
                            claim.rank > 3 && 'bg-canvas-50 text-ink-500'
                          )}
                        >
                          {claim.rank}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Row className="items-center gap-2">
                          <Avatar
                            username={claim.username}
                            avatarUrl={claim.avatarUrl}
                            size="sm"
                          />
                          <UserLink
                            user={{
                              id: claim.userId,
                              username: claim.username,
                              name: claim.name,
                            }}
                          />
                        </Row>
                      </td>
                      <td className="px-4 py-3 font-medium">
                        ${claim.prizeAmountUsdc}
                      </td>
                      <td className="px-4 py-3">
                        {claim.walletAddress ? (
                          <WalletAddressCell
                            address={claim.walletAddress}
                            copyable={
                              claim.paymentStatus !== 'sent' &&
                              claim.paymentStatus !== 'rejected'
                            }
                            onCopy={() =>
                              handleCopyAddress(
                                claim.id,
                                claim.walletAddress as string
                              )
                            }
                          />
                        ) : (
                          <span className="text-ink-400 text-sm italic">
                            Not submitted
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Row className="items-center gap-2">
                          <StatusSelector
                            currentStatus={claim.paymentStatus}
                            disabled={
                              !claim.walletAddress || updatingId !== null
                            }
                            loading={updatingId === claim.id}
                            onChange={(status) =>
                              handleStatusChange(claim.id, status)
                            }
                          />
                          {copiedClaimId === claim.id &&
                            claim.id &&
                            claim.paymentStatus === 'awaiting' && (
                              <MarkSentPrompt
                                disabled={updatingId !== null}
                                onMarkSent={() =>
                                  handleStatusChange(claim.id, 'sent')
                                }
                                onDismiss={() => setCopiedClaimId(null)}
                              />
                            )}
                        </Row>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Col>
        ))}

      {/* CSV Export Section */}
      <Col className="gap-3">
        <h2 className="text-ink-700 text-lg font-semibold">
          CSV Export (Address, Amount)
        </h2>
        <p className="text-ink-500 text-sm">
          Copy this CSV to process payments. Only includes winners with status{' '}
          <code>awaiting</code> who have submitted a wallet address.
        </p>
        <textarea
          readOnly
          value={csvContent || 'No awaiting wallet addresses to pay out'}
          className="bg-canvas-50 border-canvas-200 text-ink-700 h-40 w-full rounded-lg border p-3 font-mono text-sm"
          onClick={(e) => (e.target as HTMLTextAreaElement).select()}
        />
        {csvContent && (
          <Row className="gap-2">
            <button
              onClick={() => {
                navigator.clipboard.writeText(csvContent)
                toast.success('Copied to clipboard')
              }}
              className="bg-primary-500 hover:bg-primary-600 rounded px-4 py-2 text-sm font-medium text-white transition-colors"
            >
              Copy CSV
            </button>
          </Row>
        )}
      </Col>
    </Col>
  )
}

function WalletAddressCell(props: {
  address: string
  copyable: boolean
  onCopy: () => void
}) {
  const { address, copyable, onCopy } = props
  const truncated = `${address.slice(0, 6)}...${address.slice(-4)}`

  if (!copyable) {
    return (
      <code
        className="bg-canvas-50 text-ink-500 rounded px-2 py-1 text-xs"
        title={address}
      >
        {truncated}
      </code>
    )
  }

  return (
    <button
      onClick={onCopy}
      title={`Click to copy: ${address}`}
      className="bg-canvas-50 hover:bg-canvas-100 text-ink-700 cursor-pointer rounded px-2 py-1 font-mono text-xs transition-colors"
    >
      {truncated}
    </button>
  )
}

function MarkSentPrompt(props: {
  disabled: boolean
  onMarkSent: () => void
  onDismiss: () => void
}) {
  const { disabled, onMarkSent, onDismiss } = props
  return (
    <Row className="items-center gap-1">
      <span className="text-ink-600 text-xs">mark sent?</span>
      <button
        onClick={onMarkSent}
        disabled={disabled}
        title="Mark as sent"
        className="flex h-6 w-6 items-center justify-center rounded-full border border-green-200 bg-green-50 text-green-700 transition-colors hover:bg-green-100 disabled:opacity-50"
      >
        ✓
      </button>
      <button
        onClick={onDismiss}
        disabled={disabled}
        title="Dismiss"
        className="flex h-6 w-6 items-center justify-center rounded-full border border-red-200 bg-red-50 text-red-700 transition-colors hover:bg-red-100 disabled:opacity-50"
      >
        ✕
      </button>
    </Row>
  )
}

function StatusSelector(props: {
  currentStatus: PaymentStatus | null
  disabled: boolean
  loading: boolean
  onChange: (status: PaymentStatus) => void
}) {
  const { currentStatus, disabled, loading, onChange } = props

  if (!currentStatus) {
    return <span className="text-ink-400 text-sm">—</span>
  }

  return (
    <select
      value={currentStatus}
      onChange={(e) => onChange(e.target.value as PaymentStatus)}
      disabled={disabled || loading}
      className={clsx(
        'min-w-[120px] rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
        currentStatus === 'awaiting' &&
          'border-amber-200 bg-amber-50 text-amber-700',
        currentStatus === 'sent' &&
          'border-green-200 bg-green-50 text-green-700',
        currentStatus === 'rejected' && 'border-red-200 bg-red-50 text-red-700',
        disabled && 'cursor-not-allowed opacity-50'
      )}
    >
      <option value="awaiting">Awaiting</option>
      <option value="sent">Sent</option>
      <option value="rejected">Rejected</option>
    </select>
  )
}
