import { Page } from 'web/components/layout/page'
import { ManaPayTxn } from 'common/txn'
import {
  useAllManaPayments,
  useManaPayments,
} from 'web/hooks/use-mana-payments'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Button } from 'web/components/buttons/button'
import { useEffect, useState } from 'react'
import { Modal } from 'web/components/layout/modal'
import { SelectUsers } from 'web/components/select-users'
import { DisplayUser } from 'common/api/user-types'
import { AmountInput } from 'web/components/widgets/amount-input'
import { api } from 'web/lib/api/api'
import { useUser } from 'web/hooks/use-user'
import { ENV_CONFIG, isAdminId } from 'common/envs/constants'
import { uniq } from 'lodash'
import { useDisplayUserById, useUsers } from 'web/hooks/use-user-supabase'
import { UserLink } from 'web/components/widgets/user-link'
import {
  QrcodeIcon,
  XIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  PaperAirplaneIcon,
} from '@heroicons/react/outline'
import { User } from 'web/lib/firebase/users'
import { Avatar } from 'web/components/widgets/avatar'
import { formatSpice, formatWithToken } from 'common/util/format'
import { Linkify } from 'web/components/widgets/linkify'
import { ExpandingInput } from 'web/components/widgets/expanding-input'
import { RelativeTimestamp } from 'web/components/relative-timestamp'
import { SEO } from 'web/components/SEO'
import { useCanSendMana } from 'web/hooks/use-can-send-mana'
import { QRCode } from 'web/components/widgets/qr-code'
import { CopyLinkRow } from 'web/components/buttons/copy-link-button'
import { useRouter } from 'next/router'
import { filterDefined } from 'common/util/array'
import { UserHovercard } from 'web/components/user/user-hovercard'
import clsx from 'clsx'

import { TokenNumber } from 'web/components/widgets/token-number'

export default function Payments() {
  const { payments, load } = useAllManaPayments()
  return (
    <Page trackPageView={'managrams page'}>
      <SEO
        title="Managrams"
        description="See all mana transfers (managrams!) between users."
        url="/payments"
      />
      <Col>
        <span className={'text-primary-700 py-4 text-2xl'}>Managrams</span>
        {payments ? (
          <PaymentsContent payments={payments} forUser={null} refresh={load} />
        ) : (
          <LoadingIndicator />
        )}
      </Col>
    </Page>
  )
}
export const UserPayments = (props: { userId: string }) => {
  const { userId } = props
  const user = useDisplayUserById(userId)
  const { payments, load } = useManaPayments(userId)
  return (
    <Col className="w-full">
      {payments ? (
        <PaymentsContent payments={payments} forUser={user} refresh={load} />
      ) : (
        <Col className="items-center justify-center py-12">
          <LoadingIndicator />
        </Col>
      )}
    </Col>
  )
}
export const PaymentsContent = (props: {
  payments: ManaPayTxn[]
  forUser: DisplayUser | undefined | null
  refresh: () => void
}) => {
  const { payments, forUser, refresh } = props
  const user = useUser()
  const users = useUsers(
    uniq(payments.map((payment) => [payment.fromId, payment.toId]).flat())
  )

  const [showPayModal, setShowPayModal] = useState(false)
  const [showQRModal, setShowQRModal] = useState(false)

  const router = useRouter()
  const { a, msg } = router.query
  // ios adds a query param that breaks the message.
  const defaultMessage =
    msg && (msg as string).replace(/\?nativePlatform=ios/g, '')

  useEffect(() => {
    if (router.isReady) setShowPayModal(a != undefined)
  }, [router.isReady])

  useEffect(() => {
    if (!showPayModal) setTimeout(() => refresh(), 100)
  }, [showPayModal])
  return (
    <Col className="w-full">
      {/* Action Buttons */}
      <Row className="mb-6 gap-3">
        <button
          onClick={() => setShowPayModal(true)}
          className="bg-primary-500 hover:bg-primary-600 active:bg-primary-700 flex items-center gap-2 rounded-lg px-5 py-2.5 font-medium text-white shadow-sm transition-all hover:shadow-md"
        >
          <PaperAirplaneIcon className="h-4 w-4 rotate-45" />
          Send
        </button>
        <button
          onClick={() => setShowQRModal(true)}
          className="border-ink-200 dark:border-ink-300 bg-canvas-0 hover:bg-canvas-50 text-ink-700 flex items-center gap-2 rounded-lg border px-5 py-2.5 font-medium shadow-sm transition-all hover:shadow-md"
        >
          <QrcodeIcon className="h-4 w-4" />
          {user && user.id === forUser?.id ? 'Receive' : 'QR Code'}
        </button>
      </Row>

      {/* Payments List */}
      {payments.length === 0 ? (
        <EmptyPaymentsState />
      ) : (
        <PaymentCards
          payments={payments}
          users={filterDefined(users ?? [])}
          forUser={forUser}
        />
      )}

      {user && (
        <>
          {router.isReady && (
            <PaymentsModal
              toUser={
                forUser
                  ? forUser.id === user.id
                    ? undefined
                    : forUser
                  : undefined
              }
              fromUser={user}
              show={showPayModal}
              setShow={setShowPayModal}
              defaultMessage={defaultMessage}
              defaultAmount={typeof a === 'string' ? parseInt(a) : undefined}
            />
          )}
          <QRModal
            user={forUser ?? user}
            show={showQRModal}
            setShow={setShowQRModal}
          />
        </>
      )}
    </Col>
  )
}

const EmptyPaymentsState = () => (
  <Col className="border-ink-200 dark:border-ink-300 bg-canvas-50 items-center justify-center rounded-xl border border-dashed py-12">
    <div className="bg-canvas-100 dark:bg-ink-200 mb-4 rounded-full p-3">
      <PaperAirplaneIcon className="text-ink-400 h-6 w-6 rotate-45" />
    </div>
    <span className="text-ink-700 font-medium">No payments yet</span>
    <span className="text-ink-500 mt-1 text-sm">
      Send mana to another user to get started
    </span>
  </Col>
)

const PaymentCards = (props: {
  payments: ManaPayTxn[]
  users: DisplayUser[] | undefined
  forUser: DisplayUser | undefined | null
}) => {
  const { payments, users, forUser } = props
  const hasUserContext = forUser !== null && forUser !== undefined

  return (
    <Col className="divide-ink-100 dark:divide-ink-300 border-ink-200 dark:border-ink-300 bg-canvas-0 divide-y overflow-hidden rounded-xl border shadow-sm">
      {payments.map((payment) => {
        const fromUser = users?.find((u) => u.id === payment.fromId)
        const toUser = users?.find((u) => u.id === payment.toId)
        const isSentByUser = payment.fromId === forUser?.id
        const decreasedBalance = hasUserContext
          ? (payment.fromId === forUser?.id) !== payment.amount < 0
          : false
        const isFine = payment.amount < 0

        return (
          <PaymentRow
            key={payment.id}
            payment={payment}
            fromUser={fromUser}
            toUser={toUser}
            isSentByUser={isSentByUser}
            decreasedBalance={decreasedBalance}
            isFine={isFine}
            hasUserContext={hasUserContext}
          />
        )
      })}
    </Col>
  )
}

const PaymentRow = (props: {
  payment: ManaPayTxn
  fromUser: DisplayUser | undefined
  toUser: DisplayUser | undefined
  isSentByUser: boolean
  decreasedBalance: boolean
  isFine: boolean
  hasUserContext: boolean
}) => {
  const {
    payment,
    fromUser,
    toUser,
    isSentByUser,
    decreasedBalance,
    isFine,
    hasUserContext,
  } = props

  if (!fromUser || !toUser) {
    return (
      <Row className="animate-pulse items-center gap-4 px-4 py-4">
        <div className="bg-ink-200 h-10 w-10 rounded-full" />
        <div className="flex-1 space-y-2">
          <div className="bg-ink-200 h-4 w-32 rounded" />
          <div className="bg-ink-200 h-3 w-20 rounded" />
        </div>
      </Row>
    )
  }

  const displayUser = hasUserContext
    ? isSentByUser
      ? toUser
      : fromUser
    : fromUser
  const amountDisplay =
    payment.token === 'SPICE'
      ? formatSpice(Math.abs(payment.amount))
      : formatWithToken({
          amount: Math.abs(payment.amount),
          token: payment.token,
        })

  return (
    <Row className="hover:bg-canvas-50 group items-start gap-4 px-4 py-4 transition-colors">
      {/* Direction indicator + Avatar */}
      <div className="relative flex-shrink-0">
        <UserHovercard userId={displayUser.id}>
          <Avatar
            avatarUrl={displayUser.avatarUrl}
            username={displayUser.username}
            size="md"
          />
        </UserHovercard>
        {/* Direction badge - only show when viewing own profile */}
        {hasUserContext && (
          <div
            className={clsx(
              'border-canvas-0 absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border-2',
              decreasedBalance
                ? 'bg-scarlet-100 dark:bg-scarlet-600'
                : 'bg-teal-100 dark:bg-teal-600'
            )}
          >
            {decreasedBalance ? (
              <ArrowUpIcon className="h-3 w-3 text-scarlet-600 dark:text-white" />
            ) : (
              <ArrowDownIcon className="h-3 w-3 text-teal-600 dark:text-white" />
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <Col className="min-w-0 flex-1 gap-0.5">
        <Row className="flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <UserHovercard userId={fromUser.id}>
            <UserLink user={fromUser} className="font-medium" />
          </UserHovercard>
          <span className="text-ink-500 text-sm">
            {isFine ? 'fined' : 'paid'}
          </span>
          <UserHovercard userId={toUser.id}>
            <UserLink user={toUser} className="font-medium" />
          </UserHovercard>
        </Row>
        <span className="text-ink-500 text-xs">
          <RelativeTimestamp time={payment.createdTime} shortened={true} />
        </span>
        {payment.data.message && (
          <div className="text-ink-600 mt-1.5 text-sm leading-relaxed">
            <Linkify text={payment.data.message} />
          </div>
        )}
      </Col>

      {/* Amount */}
      <div
        className={clsx(
          'flex-shrink-0 text-right font-semibold tabular-nums',
          !hasUserContext || payment.fromId === payment.toId
            ? 'text-ink-700'
            : decreasedBalance
              ? 'text-scarlet-600 dark:text-scarlet-400'
              : 'text-teal-600 dark:text-teal-400'
        )}
      >
        {hasUserContext && (decreasedBalance ? '-' : '+')}
        {amountDisplay}
      </div>
    </Row>
  )
}

export const PaymentsModal = (props: {
  fromUser: User
  toUser?: DisplayUser
  show: boolean
  setShow: (show: boolean) => void
  defaultMessage?: string
  defaultAmount?: number
  groupId?: string
}) => {
  const {
    fromUser,
    groupId,
    defaultMessage = '',
    defaultAmount = 10,
    toUser,
    setShow,
    show,
  } = props
  const [amount, setAmount] = useState<number | undefined>(defaultAmount)
  const [message, setMessage] = useState(defaultMessage)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [toUsers, setToUsers] = useState<DisplayUser[]>([])
  const [removedToUser, setRemovedToUser] = useState(false)
  const { canSend, message: cannotSendMessage } = useCanSendMana(fromUser)
  const isAdmin = isAdminId(fromUser.id)

  useEffect(() => {
    if (toUser) setToUsers([toUser])
  }, [toUser])

  const canSubmit =
    canSend && amount && (amount >= 10 || isAdmin) && toUsers.length > 0

  return (
    <Modal open={show} setOpen={setShow} size="sm">
      <Col className="bg-canvas-0 overflow-hidden rounded-xl shadow-xl">
        {/* Header */}
        <div className="from-primary-600 to-primary-500 bg-gradient-to-r px-6 py-5">
          <div>
            <h2 className="text-lg font-semibold text-white">Send Mana</h2>
            <p className="text-sm text-white/70">
              Transfer mana to another user
            </p>
          </div>
        </div>

        {/* Body */}
        <Col className="gap-5 p-6">
          {!canSend && (
            <div className="bg-scarlet-50 dark:bg-scarlet-900/20 border-scarlet-200 dark:border-scarlet-800 text-scarlet-700 dark:text-scarlet-400 rounded-lg border px-4 py-3 text-sm">
              {cannotSendMessage}
            </div>
          )}

          {/* Recipient Section */}
          <Col className="gap-2">
            <label className="text-ink-600 text-sm font-medium">
              Recipient
            </label>
            {toUser && !removedToUser ? (
              <div className="border-ink-200 dark:border-ink-300 bg-canvas-50 flex items-center justify-between rounded-lg border px-4 py-3">
                <Row className="items-center gap-3">
                  <Avatar
                    avatarUrl={toUser.avatarUrl}
                    username={toUser.username}
                    size="sm"
                  />
                  <Col className="gap-0.5">
                    <span className="text-ink-900 font-medium">
                      {toUser.name}
                    </span>
                    <span className="text-ink-500 text-xs">
                      @{toUser.username}
                    </span>
                  </Col>
                </Row>
                <button
                  onClick={() => {
                    setToUsers([])
                    setRemovedToUser(true)
                  }}
                  className="text-ink-400 hover:text-ink-600 hover:bg-ink-100 rounded-full p-1.5 transition-colors"
                >
                  <XIcon className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            ) : (
              <SelectUsers
                setSelectedUsers={setToUsers}
                selectedUsers={toUsers}
                ignoreUserIds={[fromUser.id]}
                showUserUsername
              />
            )}
          </Col>

          {/* Amount Section */}
          <Col className="gap-2">
            <label className="text-ink-600 text-sm font-medium">Amount</label>
            <AmountInput
              amount={amount}
              allowNegative={isAdmin}
              onChangeAmount={setAmount}
              label={<TokenNumber coinType="MANA" hideAmount />}
              inputClassName="w-full !text-lg"
              onBlur={() => {
                if (amount && amount < 10 && !isAdmin) {
                  setError('Minimum amount is 10 mana')
                } else {
                  setError('')
                }
              }}
            />
            {!isAdmin && (
              <p className="text-ink-500 text-xs">Minimum: 10 mana</p>
            )}
          </Col>

          {/* Message Section */}
          <Col className="gap-2">
            <label className="text-ink-600 text-sm font-medium">
              Message{' '}
              <span className="text-ink-400 font-normal">(optional)</span>
            </label>
            <ExpandingInput
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Add a note to your transfer..."
              className="min-h-[80px] w-full !py-3 text-sm"
            />
          </Col>

          {/* Error Message */}
          {error && (
            <div className="bg-scarlet-50 dark:bg-scarlet-900/20 border-scarlet-200 dark:border-scarlet-800 text-scarlet-600 dark:text-scarlet-400 rounded-lg border px-4 py-3 text-sm">
              {error}
            </div>
          )}
        </Col>

        {/* Footer */}
        <div className="border-ink-100 dark:border-ink-300 flex items-center justify-between border-t px-6 py-4">
          <button
            onClick={() => setShow(false)}
            className="text-ink-600 hover:text-ink-800 text-sm font-medium transition-colors"
          >
            Cancel
          </button>
          <Button
            onClick={async () => {
              if (!amount || !toUsers.length) return
              setLoading(true)
              try {
                await api('managram', {
                  toIds: toUsers.map((user) => user.id),
                  amount,
                  message,
                  groupId,
                  token: 'M$',
                })
                setError('')
                setShow(false)
              } catch (e: any) {
                setError(e.message)
                console.error(e)
              }
              setLoading(false)
            }}
            disabled={!canSubmit || loading}
            loading={loading}
            size="lg"
            className="min-w-[120px]"
          >
            {loading ? (
              'Sending...'
            ) : (
              <Row className="items-center gap-1">
                Send <TokenNumber coinType="MANA" amount={amount} />
              </Row>
            )}
          </Button>
        </div>
      </Col>
    </Modal>
  )
}

export const QRModal = (props: {
  show: boolean
  setShow: (show: boolean) => void
  user: DisplayUser
}) => {
  const { show, setShow, user } = props

  const [amount, setAmount] = useState<number | undefined>(10)
  const [message, setMessage] = useState('')

  const url =
    `https://${ENV_CONFIG.domain}/${user.username}?tab=payments&a=${
      amount ?? 10
    }` + (message && `&msg=${encodeURIComponent(message)}`)

  return (
    <Modal open={show} setOpen={setShow} size="sm">
      <Col className="bg-canvas-0 overflow-hidden rounded-xl shadow-xl">
        {/* Header */}
        <div className="from-primary-600 to-primary-500 bg-gradient-to-r px-6 py-5">
          <h2 className="text-lg font-semibold text-white">Receive Mana</h2>
          <p className="text-sm text-white/70">
            Share this QR code to receive mana from {user.name}
          </p>
        </div>

        {/* Body */}
        <Col className="gap-5 p-6">
          {/* QR Code */}
          <div className="flex justify-center">
            <QRCode url={url} width={220} height={220} className="rounded-lg" />
          </div>

          {/* Copy Link */}
          <CopyLinkRow
            url={url}
            eventTrackingName="copy managram page"
            linkBoxClassName="w-full"
          />

          {/* Advanced Options */}
          <details className="group">
            <summary className="text-ink-600 hover:text-ink-800 cursor-pointer text-sm font-medium transition-colors">
              Advanced Options
            </summary>
            <Col className="mt-4 gap-4">
              <Col className="gap-2">
                <label className="text-ink-600 text-sm font-medium">
                  Default Amount
                </label>
                <AmountInput
                  amount={amount}
                  onChangeAmount={setAmount}
                  placeholder="10"
                  label={<TokenNumber coinType="MANA" hideAmount />}
                />
              </Col>
              <Col className="gap-2">
                <label className="text-ink-600 text-sm font-medium">
                  Default Message
                </label>
                <ExpandingInput
                  placeholder="What this transaction is for (e.g. tacos)"
                  className="min-h-[60px] w-full !py-3 text-sm"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
              </Col>
            </Col>
          </details>
        </Col>

      </Col>
    </Modal>
  )
}
