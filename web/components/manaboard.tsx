import clsx from 'clsx'
import React, { useEffect, useState } from 'react'
import { ENV_CONFIG } from '../../common/envs/constants'
import { User } from '../../common/user'
import { formatMoney } from '../../common/util/format'
import { useUser } from '../hooks/use-user'
import { AmountInput } from './amount-input'
import { Avatar } from './avatar'
import { Col } from './layout/col'
import { Modal } from './layout/modal'
import { Row } from './layout/row'
import { SiteLink } from './site-link'
import { Title } from './title'

export function Manaboard(props: {
  title: string
  users: User[]
  className?: string
}) {
  // TODO: Ideally, highlight your own entry on the leaderboard
  const { title, users, className } = props
  return (
    <div className={clsx('w-full px-1', className)}>
      <Title text={title} className="!mt-0" />
      {users.length === 0 ? (
        <div className="ml-2 text-gray-500">None yet</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="table-zebra table-compact table w-full text-gray-500">
            <thead>
              <tr className="p-2">
                <th>#</th>
                <th>Name</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((user, index) => (
                <tr key={user.id}>
                  <td>{index + 1}</td>
                  <td style={{ maxWidth: 190 }}>
                    <Row className="items-center gap-4">
                      <Avatar avatarUrl={user.avatarUrl} size={8} />
                      <div className="truncate">{user.name}</div>
                    </Row>
                  </td>
                  <td>
                    <BuySlotModal
                      slot={index + 1}
                      title={`${title}`}
                      holder={user}
                      value={100}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Label(props: { children: React.ReactNode }) {
  return <label className="-mb-3 text-sm">{props.children}</label>
}

export function BuySlotModal(props: {
  title: string
  holder: User
  slot: number
  value: number
}) {
  const { slot, title, holder, value } = props
  const user = useUser()

  const [open, setOpen] = useState(false)
  const [newValue, setNewValue] = useState(value)
  const [message, setMessage] = useState('')
  useEffect(() => {
    if (user?.name) {
      setMessage(user.name)
    }
  }, [user])

  return (
    <>
      <Modal open={open} setOpen={setOpen}>
        <Col className="gap-5 rounded-md bg-white p-6 text-gray-500">
          <Title
            text={`Buy #${slot} on ${title}`}
            className="!mt-0 !text-2xl"
          />

          <Label>Current value: {formatMoney(value)}</Label>
          <Row className="items-center gap-4 rounded-md bg-gray-100 p-2">
            <div>#{slot}</div>
            <Avatar avatarUrl={holder.avatarUrl} size={8} />
            <div className="truncate">{holder.name}</div>
          </Row>

          <Label>Reassess value</Label>
          <AmountInput
            amount={newValue}
            onChange={(amount) => setNewValue(amount ?? 0)}
            error={''}
            // error="You don't have enough mana"
            label={ENV_CONFIG.moneyMoniker}
          />
          <div className="-mt-5 text-sm">
            Tax: {formatMoney(newValue / 10)} per hour
          </div>

          <Label>(Optional) set message</Label>
          <input
            type="text"
            className="input input-bordered w-full max-w-xs"
            onChange={(e) => {
              setMessage(e.target.value)
            }}
            value={message}
          />

          <Label>Preview</Label>
          {user && (
            <Row className="items-center gap-4 rounded-md bg-gray-100 p-2">
              <div>#{slot}</div>
              <Avatar avatarUrl={user.avatarUrl} size={8} />
              <div className="truncate">{message}</div>
            </Row>
          )}

          <button className="btn btn-primary">
            Buy Slot ({formatMoney(value)})
          </button>
        </Col>
      </Modal>
      <button className="btn btn-outline btn-sm" onClick={() => setOpen(true)}>
        Buy
      </button>
    </>
  )
}
