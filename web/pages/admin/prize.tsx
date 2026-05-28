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
import { ConfirmationButton } from 'web/components/buttons/confirmation-button'

type PaymentStatus = 'awaiting' | 'sent' | 'rejected' | 'opted_out'

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
  const [hidePaidOut, setHidePaidOut] = useState(true)

  // Updating a row keyed by (sweepstakesNum + userId) instead of claimId
  // when no claim exists yet — used as the busy-marker for the dropdown.
  const rowKey = (sweepstakesNum: number, userId: string) =>
    `${sweepstakesNum}:${userId}`

  const handleStatusChange = async (
    claim: {
      id: string | null
      sweepstakesNum: number
      userId: string
    },
    newStatus: PaymentStatus
  ) => {
    const key = claim.id ?? rowKey(claim.sweepstakesNum, claim.userId)
    setUpdatingId(key)
    try {
      // Send claimId when we have one; otherwise let the server upsert by
      // (sweepstakesNum, userId). The server validates the user actually won.
      await api(
        'admin-update-prize-payment',
        claim.id
          ? { claimId: claim.id, paymentStatus: newStatus }
          : {
              sweepstakesNum: claim.sweepstakesNum,
              userId: claim.userId,
              paymentStatus: newStatus,
            }
      )
      toast.success(`Status updated to ${newStatus}`)
      setCopiedClaimId((id) => (id === claim.id ? null : id))
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

  const handleResetClaim = async (claimId: string) => {
    setUpdatingId(claimId)
    try {
      await api('admin-delete-prize-claim', { claimId })
      toast.success('Claim reset')
      setCopiedClaimId((id) => (id === claimId ? null : id))
      refresh()
    } catch (e) {
      toast.error('Failed to reset claim')
    } finally {
      setUpdatingId(null)
    }
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

  // A drawing is "paid out" once every claim row has a terminal status
  // (sent / rejected / opted_out) and there are no rows still awaiting payout
  // or missing a status. Mid-flight drawings stay visible regardless of toggle.
  const isDrawingPaidOut = (claims: (typeof groupedClaims)[number]) =>
    claims.every(
      (c) =>
        c.paymentStatus === 'sent' ||
        c.paymentStatus === 'rejected' ||
        c.paymentStatus === 'opted_out'
    )

  const allGroups = Object.entries(groupedClaims).sort(
    ([a], [b]) => Number(b) - Number(a)
  )
  const paidOutCount = allGroups.filter(([, c]) => isDrawingPaidOut(c)).length
  const visibleGroups = hidePaidOut
    ? allGroups.filter(([, c]) => !isDrawingPaidOut(c))
    : allGroups

  // CSV: only awaiting claims with a wallet address
  const csvClaims = claims.filter(
    (c) => c.walletAddress && c.paymentStatus === 'awaiting'
  )
  const csvContent = csvClaims
    .map((c) => `${c.walletAddress},${c.prizeAmountUsdc}`)
    .join('\n')

  return (
    <Col className="gap-8">
      <Row className="items-center justify-between">
        <button
          onClick={() => setHidePaidOut((v) => !v)}
          disabled={paidOutCount === 0}
          className={clsx(
            'rounded-md border px-3 py-1.5 text-sm font-medium transition-colors',
            hidePaidOut
              ? 'border-primary-200 bg-primary-50 text-primary-700 hover:bg-primary-100'
              : 'border-ink-200 bg-canvas-0 text-ink-700 hover:bg-canvas-50',
            paidOutCount === 0 && 'cursor-not-allowed opacity-50'
          )}
        >
          {hidePaidOut ? 'Show' : 'Hide'} paid-out drawings
          {paidOutCount > 0 && (
            <span className="text-ink-500 ml-2 font-normal">
              ({paidOutCount} {paidOutCount === 1 ? 'drawing' : 'drawings'})
            </span>
          )}
        </button>
      </Row>

      {visibleGroups.map(([sweepstakesNum, sweepClaims]) => (
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
                          copyable={claim.paymentStatus === 'awaiting'}
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
                          disabled={updatingId !== null}
                          loading={
                            updatingId ===
                            (claim.id ??
                              rowKey(claim.sweepstakesNum, claim.userId))
                          }
                          onChange={(status) =>
                            handleStatusChange(claim, status)
                          }
                        />
                        {claim.id && (
                          <ResetClaimButton
                            hasWallet={!!claim.walletAddress}
                            currentStatus={claim.paymentStatus}
                            username={claim.username}
                            disabled={updatingId !== null}
                            onConfirm={() =>
                              handleResetClaim(claim.id as string)
                            }
                          />
                        )}
                        {copiedClaimId === claim.id &&
                          claim.id &&
                          claim.paymentStatus === 'awaiting' && (
                            <MarkSentPrompt
                              disabled={updatingId !== null}
                              onMarkSent={() =>
                                handleStatusChange(claim, 'sent')
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

// Wipes the claim row entirely. Used to recover from accidentally-set
// statuses (e.g. opted_out) — after delete the user is back in the "no
// claim" state and can submit a wallet again via the normal /prize flow.
function ResetClaimButton(props: {
  hasWallet: boolean
  currentStatus: PaymentStatus | null
  username: string
  disabled: boolean
  onConfirm: () => Promise<void> | void
}) {
  const { hasWallet, currentStatus, username, disabled, onConfirm } = props
  const isTerminal =
    currentStatus === 'sent' ||
    currentStatus === 'rejected' ||
    currentStatus === 'opted_out'

  return (
    <ConfirmationButton
      openModalBtn={{
        label: 'Reset',
        color: 'gray-outline',
        size: 'xs',
        disabled,
      }}
      cancelBtn={{ label: 'Cancel' }}
      submitBtn={{ label: 'Reset claim', color: 'red' }}
      onSubmit={() => onConfirm()}
    >
      <Col className="gap-3">
        <h3 className="text-lg font-semibold">Reset prize claim?</h3>
        <p className="text-ink-700 text-sm">
          This will <b>delete the prize claim row</b> for{' '}
          <span className="font-mono">@{username}</span>
          {currentStatus && (
            <>
              {' '}
              (currently <b>{currentStatus}</b>)
            </>
          )}
          . Use this to undo an accidentally-set status — for example, if you
          marked someone <b>opted out</b> by mistake.
        </p>
        <ul className="text-ink-700 list-disc space-y-1 pl-5 text-sm">
          <li>
            Their{' '}
            {hasWallet ? (
              <>submitted wallet address will be erased</>
            ) : (
              <>row (with no wallet) will be erased</>
            )}
            .
          </li>
          <li>
            They'll be returned to the "no claim" state and can submit a wallet
            again on /prize.
          </li>
          {isTerminal && (
            <li>
              Existing <b>{currentStatus}</b> status — including any payment
              transaction record — will be lost.
            </li>
          )}
        </ul>
        <p className="text-ink-500 text-xs">
          This does not refund anything. If a payment was already sent on-chain,
          deleting this row only removes the audit record.
        </p>
      </Col>
    </ConfirmationButton>
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

// Sentinel used when no row exists yet (the user never submitted a wallet).
// Renders as "—" but lets the admin pick a real status to upsert one.
const UNSET = '__unset__'

function StatusSelector(props: {
  currentStatus: PaymentStatus | null
  disabled: boolean
  loading: boolean
  onChange: (status: PaymentStatus) => void
}) {
  const { currentStatus, disabled, loading, onChange } = props
  const value = currentStatus ?? UNSET

  return (
    <select
      value={value}
      onChange={(e) => {
        const v = e.target.value
        if (v === UNSET) return
        onChange(v as PaymentStatus)
      }}
      disabled={disabled || loading}
      className={clsx(
        'min-w-[120px] rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
        currentStatus === 'awaiting' &&
          'border-amber-200 bg-amber-50 text-amber-700',
        currentStatus === 'sent' &&
          'border-green-200 bg-green-50 text-green-700',
        currentStatus === 'rejected' && 'border-red-200 bg-red-50 text-red-700',
        currentStatus === 'opted_out' &&
          'border-indigo-200 bg-indigo-50 text-indigo-700',
        currentStatus === null && 'border-ink-200 bg-canvas-50 text-ink-500',
        disabled && 'cursor-not-allowed opacity-50'
      )}
    >
      {currentStatus === null && <option value={UNSET}>—</option>}
      <option value="awaiting">Awaiting</option>
      <option value="sent">Sent</option>
      <option value="rejected">Rejected (ineligible)</option>
      <option value="opted_out">Opted out (forfeited)</option>
    </select>
  )
}
