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
import { QrcodeIcon, XIcon } from '@heroicons/react/outline'
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
    <div className="flex h-full flex-col items-center justify-center">
      {payments ? (
        <PaymentsContent payments={payments} forUser={user} refresh={load} />
      ) : (
        <LoadingIndicator />
      )}
    </div>
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
    <Col className={'w-full'}>
      <Row className={'mb-4 gap-4'}>
        <Button
          onClick={() => setShowPayModal(true)}
          color={'indigo-outline'}
          size="xl"
        >
          Send
        </Button>
        <Button
          onClick={() => setShowQRModal(true)}
          color="indigo-outline"
          size="xl"
        >
          {user && user.id === forUser?.id && (
            <span className="mr-1">Receive</span>
          )}
          <QrcodeIcon className="h-5 w-5" />
        </Button>
      </Row>
      {payments.length === 0 ? (
        <span className="text-ink-500">No Payments</span>
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

const PaymentCards = (props: {
  payments: ManaPayTxn[]
  users: DisplayUser[] | undefined
  forUser: DisplayUser | undefined | null
}) => {
  const { payments, users, forUser } = props
  return (
    <Col className={'gap-2'}>
      {payments.map((payment) => {
        const fromUser = users?.find((u) => u.id === payment.fromId)
        const toUser = users?.find((u) => u.id === payment.toId)
        const decreasedBalance =
          (payment.fromId === forUser?.id) !== payment.amount < 0
        return (
          <Col key={payment.id} className="bg-canvas-0 w-full rounded-md p-2">
            <Row className={'justify-between'}>
              {fromUser && toUser ? (
                <Row className="gap-1">
                  <UserHovercard userId={fromUser.id}>
                    <Avatar
                      avatarUrl={fromUser.avatarUrl}
                      username={fromUser.username}
                    />
                  </UserHovercard>
                  <Col className={'w-full'}>
                    <Row className={'flex-wrap gap-x-1'}>
                      <span className={'ml-1'}>
                        <UserHovercard userId={fromUser.id}>
                          <UserLink user={fromUser} />
                        </UserHovercard>
                      </span>
                      <span>{payment.amount < 0 ? 'fined' : 'paid'}</span>
                      <span>
                        <UserHovercard userId={toUser.id}>
                          <UserLink user={toUser} />
                        </UserHovercard>
                      </span>
                    </Row>
                    <span className={'-mt-1'}>
                      <RelativeTimestamp
                        time={payment.createdTime}
                        shortened={true}
                        className={'text-sm'}
                      />
                    </span>
                  </Col>
                </Row>
              ) : (
                <span>Loading...</span>
              )}

              <span
                className={
                  payment.fromId === payment.toId
                    ? 'text-ink-500'
                    : decreasedBalance
                    ? 'text-scarlet-500'
                    : 'text-teal-500'
                }
              >
                {decreasedBalance ? '-' : '+'}
                {payment.token === 'SPICE'
                  ? formatSpice(Math.abs(payment.amount))
                  : formatWithToken({
                      amount: Math.abs(payment.amount),
                      token: payment.token,
                    })}
              </span>
            </Row>
            <Row className={'ml-1 mt-2'}>
              <Linkify text={payment.data.message ?? ''} />
            </Row>
          </Col>
        )
      })}
    </Col>
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
