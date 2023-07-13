import { Page } from 'web/components/layout/page'
import { ManaPayTxn } from 'common/txn'
import { useManaPayments } from 'web/hooks/use-mana-payments'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Button } from 'web/components/buttons/button'
import { useEffect, useState } from 'react'
import { Modal } from 'web/components/layout/modal'
import { FilterSelectUsers } from 'web/components/filter-select-users'
import { UserSearchResult } from 'web/lib/supabase/users'
import { AmountInput } from 'web/components/widgets/amount-input'
import { sendMana } from 'web/lib/firebase/api'
import { useUser } from 'web/hooks/use-user'
import { ENV_CONFIG } from 'common/envs/constants'
import { uniq } from 'lodash'
import { useUserById, useUsers } from 'web/hooks/use-user-supabase'
import { UserAvatarAndBadge, UserLink } from 'web/components/widgets/user-link'
import { ViewListIcon, XIcon } from '@heroicons/react/outline'
import { User } from 'web/lib/firebase/users'
import { Avatar } from 'web/components/widgets/avatar'
import { formatMoney } from 'common/util/format'
import { Linkify } from 'web/components/widgets/linkify'
import { ExpandingInput } from 'web/components/widgets/expanding-input'
import { RelativeTimestamp } from 'web/components/relative-timestamp'
import SquaresIcon from 'web/lib/icons/squares-icon'

export default function Payments() {
  const { payments, load } = useManaPayments()
  return (
    <Page>
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
  const user = useUserById(userId)
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
  forUser: User | undefined | null
  refresh: () => void
}) => {
  const { payments, forUser, refresh } = props
  const user = useUser()
  const users = useUsers(
    uniq(payments.map((payment) => [payment.fromId, payment.toId]).flat())
  )
  const [showModal, setShowModal] = useState(false)
  const [viewType, setViewType] = useState<'list' | 'card'>('card')
  useEffect(() => {
    if (!showModal) setTimeout(() => refresh(), 100)
  }, [showModal])
  return (
    <Col className={'w-full'}>
      <Row className={'mb-2 justify-between'}>
        <Button
          color={'gray-outline'}
          onClick={() =>
            viewType === 'list' ? setViewType('card') : setViewType('list')
          }
        >
          {viewType === 'list' ? (
            <SquaresIcon className={'h-5 w-5'} />
          ) : (
            <ViewListIcon className={'h-5 w-5'} />
          )}
        </Button>
        <Button onClick={() => setShowModal(true)} color={'indigo'}>
          Send Mana
        </Button>
      </Row>
      {payments.length === 0 ? (
        <Col className=" ">
          <span className="text-gray-500">No Payments</span>
        </Col>
      ) : viewType === 'list' ? (
        <PaymentsTable payments={payments} users={users} forUser={forUser} />
      ) : (
        <PaymentCards payments={payments} users={users} forUser={forUser} />
      )}
      {user && (
        <PaymentsModal
          toUser={
            forUser ? (forUser.id === user.id ? undefined : forUser) : undefined
          }
          fromId={user.id}
          show={showModal}
          setShow={setShowModal}
        />
      )}
    </Col>
  )
}

const PaymentCards = (props: {
  payments: ManaPayTxn[]
  users: User[] | undefined
  forUser: User | undefined | null
}) => {
  const { payments, users, forUser } = props
  return (
    <Col className={'gap-2'}>
      {payments.map((payment) => {
        const fromUser = users?.find((u) => u.id === payment.fromId)
        const toUser = users?.find((u) => u.id === payment.toId)
        return (
          <Col
            key={payment.id}
            className={'bg-canvas-100 w-full rounded-md p-2'}
          >
            <Row className={'justify-between'}>
              {fromUser && toUser ? (
                <Row>
                  <Avatar
                    avatarUrl={fromUser.avatarUrl}
                    username={fromUser.username}
                  />
                  <Col className={'w-full'}>
                    <Row className={'flex-wrap gap-x-1'}>
                      <span className={'ml-1'}>
                        <UserLink
                          name={fromUser.name}
                          username={fromUser.username}
                        />
                      </span>
                      <span>paid</span>
                      <span>
                        <UserLink
                          name={toUser.name}
                          username={toUser.username}
                        />
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
                    ? 'text-gray-500'
                    : payment.fromId === forUser?.id
                    ? 'text-scarlet-500'
                    : 'text-teal-500'
                }
              >
                {payment.fromId === forUser?.id ? '-' : '+'}
                {formatMoney(payment.amount)}
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
const amountFromPointOfReferenceUser = (
  payment: ManaPayTxn,
  referenceUser: User | null | undefined
) =>
  referenceUser && payment.fromId === referenceUser.id
    ? -payment.amount
    : payment.amount

function getSortFunction(
  sortField: 'amount' | 'createdTime',
  sortDirection: 'asc' | 'desc',
  referenceUser: User | undefined | null
) {
  return (a: ManaPayTxn, b: ManaPayTxn) => {
    let comparison

    if (sortField === 'createdTime') {
      comparison =
        new Date(a[sortField]).getTime() - new Date(b[sortField]).getTime()
    } else {
      const amountA = amountFromPointOfReferenceUser(a, referenceUser)
      const amountB = amountFromPointOfReferenceUser(b, referenceUser)
      comparison = amountA - amountB
    }

    return sortDirection === 'asc' ? comparison : -comparison
  }
}

function PaymentsTable(props: {
  payments: ManaPayTxn[]
  users: User[] | undefined
  forUser: User | undefined | null
}) {
  const { payments, users, forUser } = props
  const [sortField, setSortField] = useState<'createdTime' | 'amount'>(
    'createdTime'
  )
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')

  const sortedPayments = [...payments].sort(
    getSortFunction(sortField, sortDirection, forUser)
  )

  const handleHeaderClick = (newSortField: 'createdTime' | 'amount') => {
    if (sortField === newSortField) {
      // If the user clicked the column that's already sorted, we'll just switch the sort direction.
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      // If the user clicked a new column, we'll start by sorting it in ascending order.
      setSortField(newSortField)
      setSortDirection('asc')
    }
  }

  return (
    <table className="w-full text-left">
      <thead>
        <tr>
          <th>From</th>
          <th>To</th>
          <th
            className={'cursor-pointer'}
            onClick={() => handleHeaderClick('amount')}
          >
            Amount
          </th>
          <th>Message</th>
          <th
            className={'cursor-pointer'}
            onClick={() => handleHeaderClick('createdTime')}
          >
            Time
          </th>
        </tr>
      </thead>
      <tbody>
        {sortedPayments.map((payment) => {
          const fromUser = users?.find((u) => u.id === payment.fromId)
          const toUser = users?.find((u) => u.id === payment.toId)
          return (
            <tr key={payment.id}>
              <td className={''}>
                {fromUser ? (
                  <UserLink
                    name={fromUser.name}
                    username={fromUser.username}
                    className={'max-w-[5rem] text-ellipsis'}
                  />
                ) : (
                  <span>Loading...</span>
                )}
              </td>{' '}
              <td>
                {toUser ? (
                  <UserLink
                    name={toUser.name}
                    username={toUser.username}
                    className={'max-w-[5rem] text-ellipsis'}
                  />
                ) : (
                  <span>Loading...</span>
                )}
              </td>
              <td className={'text-end'}>
                {formatMoney(amountFromPointOfReferenceUser(payment, forUser))}
              </td>
              <td className={'line-clamp-1 '}>{payment.data.message}</td>
              <td className={'text-end'}>
                <RelativeTimestamp
                  time={payment.createdTime}
                  shortened={true}
                />
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

const PaymentsModal = (props: {
  fromId: string
  toUser?: User
  show: boolean
  setShow: (show: boolean) => void
}) => {
  const { fromId, toUser, setShow, show } = props
  const [amount, setAmount] = useState<number | undefined>(10)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [toUsers, setToUsers] = useState<UserSearchResult[]>([])
  const [removedToUser, setRemovedToUser] = useState(false)
  useEffect(() => {
    if (toUser) setToUsers([toUser])
  }, [toUser])
  return (
    <Modal open={show} setOpen={setShow}>
      <Col className={'bg-canvas-0 rounded-md p-4'}>
        <div className="my-2 text-xl">Send Mana</div>
        <Col className={'gap-3'}>
          <Row className={'items-center justify-between'}>
            <Col>
              <div>To</div>
              {toUser && !removedToUser ? (
                <Col className={'mt-2'}>
                  <Row className={'items-center gap-1'}>
                    <UserAvatarAndBadge
                      name={toUser.name}
                      username={toUser.username}
                      avatarUrl={toUser.avatarUrl}
                    />
                    <XIcon
                      onClick={() => {
                        setToUsers([])
                        setRemovedToUser(true)
                      }}
                      className=" text-ink-400 hover:text-ink-700 h-5 w-5 cursor-pointer rounded-full"
                      aria-hidden="true"
                    />
                  </Row>
                </Col>
              ) : (
                <FilterSelectUsers
                  setSelectedUsers={setToUsers}
                  selectedUsers={toUsers}
                  ignoreUserIds={[fromId]}
                />
              )}
            </Col>
          </Row>
          <Row className={'items-center justify-between'}>
            <Col>
              <span>Amount</span>
              <AmountInput
                amount={amount}
                onChangeAmount={setAmount}
                label={ENV_CONFIG.moneyMoniker}
                inputClassName={'w-52'}
                onBlur={() => {
                  if (amount && amount < 10) {
                    setError('Amount must be 10 or more')
                  } else {
                    setError('')
                  }
                }}
              />
            </Col>
          </Row>
          <Row className={'items-center justify-between'}>
            <Col className={'w-full'}>
              <span>Message</span>
              <ExpandingInput
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className={'w-full'}
              />
              {error && <span className={'text-red-500'}>{error}</span>}
            </Col>
          </Row>
          <Row className={'justify-end'}>
            <Button
              size={'lg'}
              onClick={async () => {
                if (!amount || !toUsers.length) return
                setLoading(true)
                try {
                  await sendMana({
                    toIds: toUsers.map((user) => user.id),
                    amount,
                    message,
                  })
                  setError('')
                  setShow(false)
                } catch (e: any) {
                  setError(e.message)
                  console.error(e)
                }
                setLoading(false)
              }}
              disabled={loading || !amount || amount < 10 || !toUsers.length}
            >
              Send
            </Button>
          </Row>
        </Col>
      </Col>
    </Modal>
  )
}
