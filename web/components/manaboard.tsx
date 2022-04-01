import clsx from 'clsx'
import React, { useEffect, useState } from 'react'
import { ENV_CONFIG } from '../../common/envs/constants'
import { User } from '../../common/user'
import { formatMoney } from '../../common/util/format'
import { useUser } from '../hooks/use-user'
import { buyLeaderboardSlot } from '../lib/firebase/api-call'
import { Transaction, writeTransaction } from '../lib/firebase/transactions'
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
  values: number[]
  className?: string
}) {
  // TODO: Ideally, highlight your own entry on the leaderboard
  let { title, users, className, values } = props

  const [expanded, setExpanded] = useState(false)
  if (!expanded) {
    users = users.slice(0, 25)
    values = values.slice(0, 25)
  }

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
                <th>
                  <div className="pl-2">#</div>
                </th>
                <th>Name</th>
                <th>Value</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((user, index) => (
                <tr key={user.id}>
                  <td>
                    <div className="pl-2">{index + 1}</div>
                  </td>
                  <td className="w-full" style={{ maxWidth: 190 }}>
                    <Row className="items-center gap-4">
                      <Avatar avatarUrl={user.avatarUrl} size={8} />
                      <div className="truncate">{user.name}</div>
                    </Row>
                  </td>
                  <td>
                    <Row className="items-center gap-4">
                      {formatMoney(values[index])}
                      <BuySlotModal
                        slot={index + 1}
                        title={`${title}`}
                        holder={user}
                        value={values[index]}
                      />
                    </Row>
                  </td>
                  <td></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            className="btn btn-sm btn-outline m-2"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? 'Hide' : 'Show more'}
          </button>
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

  const onBuy = async () => {
    // Feel free to change this. - James
    const slotId = `${title}-${slot}`
    await buyLeaderboardSlot({ slotId, reassessValue: newValue })
  }

  return (
    <>
      <Modal open={open} setOpen={setOpen}>
        <Col className="gap-5 rounded-md bg-white p-6 text-gray-500">
          <Title text={`Buy slot #${slot}`} className="!mt-0" />

          <Label>Current value: {formatMoney(value)}</Label>
          {user && (
            <Row className="items-center gap-4 rounded-md bg-gray-100 p-2 text-sm">
              <div className="pl-2">{slot}</div>
              <Avatar avatarUrl={user.avatarUrl} size={8} />
              <div className="truncate">{message}</div>
            </Row>
          )}

          <Label>(Optional) set message</Label>
          <input
            type="text"
            className="input input-bordered w-full max-w-xs"
            onChange={(e) => {
              setMessage(e.target.value)
            }}
            value={message}
          />

          <Label>Reassess value</Label>
          <AmountInput
            amount={newValue}
            onChange={(amount) => setNewValue(amount ?? 0)}
            error=""
            label={ENV_CONFIG.moneyMoniker}
          />

          <button
            className="btn btn-primary"
            onClick={() => {
              if (user) {
                buySlot({
                  holder,
                  buyer: user,
                  amount: value,
                  slot,
                  message,
                  newValue,
                })
                setOpen(false)
              }
            }}
          >
            Buy Slot ({formatMoney(value)})
          </button>
          <div className="-mt-2 text-sm">
            Additional fees: {formatMoney(newValue / 10)} per hour
          </div>
        </Col>
      </Modal>
      <button
        className="btn btn-outline btn-sm normal-case"
        onClick={() => setOpen(true)}
      >
        Buy
      </button>
    </>
  )
}

async function buySlot(options: {
  holder: User
  buyer: User
  amount: number
  slot: number
  message: string
  newValue: number
}) {
  const { holder, buyer, amount, slot, message, newValue } = options
  const createdTime = Date.now()
  const buyTransaction: Transaction = {
    id: '',
    createdTime,

    fromId: buyer.id,
    fromName: buyer.name,
    fromUsername: buyer.username,
    fromAvatarUrl: buyer.avatarUrl,

    toId: holder.id,
    toName: holder.name,
    toUsername: holder.username,
    toAvatarUrl: holder.avatarUrl,

    amount: amount,

    category: 'BUY_LEADERBOARD_SLOT',
    description: `${buyer.name} bought a slot from ${holder.name}`,
    data: {
      slot,
      message,
      newValue,
    },
  }

  const feeTransaction: Transaction = {
    id: '',
    createdTime,

    fromId: holder.id,
    fromName: holder.name,
    fromUsername: holder.username,
    fromAvatarUrl: holder.avatarUrl,

    // Send fee to Manifold Markets official account
    toId: 'IPTOzEqrpkWmEzh6hwvAyY9PqFb2',
    toName: 'Manifold Markets',
    toUsername: 'ManifoldMarkets',
    toAvatarUrl: 'https://manifold.markets/logo-bg-white.png',

    amount: 10, // TODO: Calculate fee
    category: 'LEADERBOARD_TAX',
    description: `${holder.name} paid M$ 10 in fees`,
    data: {
      slot,
    },
  }

  await Promise.all([
    writeTransaction(buyTransaction),
    writeTransaction(feeTransaction),
  ])
}
