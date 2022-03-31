import clsx from 'clsx'
import { useState } from 'react'
import { ENV_CONFIG } from '../../common/envs/constants'
import { User } from '../../common/user'
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

export function BuySlotModal(props: {
  title: string
  holder: User
  slot: number
}) {
  const { slot, title, holder } = props
  const user = useUser()

  const [open, setOpen] = useState(false)
  return (
    <>
      <Modal open={open} setOpen={setOpen}>
        <Col className="gap-4 rounded-md bg-white p-6 text-gray-500">
          <Title
            text={`Buy #${slot} on ${title}`}
            className="!mt-0 !text-2xl"
          />

          <div className="text-sm">Currently</div>
          <Row className="items-center gap-4 rounded-md bg-gray-100 p-2">
            <div>#{slot}</div>
            <Avatar avatarUrl={holder.avatarUrl} size={8} />
            <div className="truncate">{holder.name}</div>
          </Row>

          <div className="text-sm">After purchasing</div>
          {user && (
            <Row className="items-center gap-4 rounded-md bg-gray-100 p-2">
              <div>#{slot}</div>
              <Avatar avatarUrl={user.avatarUrl} size={8} />
              <div className="truncate">{user.name}</div>
            </Row>
          )}

          <div className="text-sm">Assess value</div>
          <AmountInput
            amount={100}
            onChange={() => {}}
            error={''}
            // error="You don't have enough mana"
            label={ENV_CONFIG.moneyMoniker}
          />

          <button className="btn btn-primary">Buy Slot</button>
        </Col>
      </Modal>
      <button className="btn btn-outline btn-sm" onClick={() => setOpen(true)}>
        Buy
      </button>
    </>
  )
}
