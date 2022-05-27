import { useState } from 'react'
import { Manalink } from 'common/manalink'
import { formatMoney } from 'common/util/format'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/page'
import { SEO } from 'web/components/SEO'
import { Title } from 'web/components/title'
import { useUser } from 'web/hooks/use-user'
import { createManalink, useUserManalinks } from 'web/lib/firebase/manalinks'
import { fromNow } from 'web/lib/util/time'
import { useManalinkTxns } from 'web/lib/firebase/txns'
import { useUserById } from 'web/hooks/use-users'
import { Txn } from 'common/txn'
import { Avatar } from 'web/components/avatar'
import { RelativeTimestamp } from 'web/components/relative-timestamp'
import { UserLink } from 'web/components/user-page'
import { ManalinkCard, ManalinkInfo } from 'web/components/manalink-card'
import Textarea from 'react-expanding-textarea'

import dayjs from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat'
dayjs.extend(customParseFormat)

function getLinkUrl(slug: string) {
  return `${location.protocol}//${location.host}/link/${slug}`
}

export default function LinkPage() {
  const user = useUser()
  const [newManalink, setNewManalink] = useState<ManalinkInfo>({
    expiresTime: null,
    amount: 100,
    maxUses: 5,
    uses: 0,
    message: '',
  })
  const links = useUserManalinks(user?.id ?? '')
  const manalinkTxns = useManalinkTxns(user?.id ?? '')

  if (user == null) {
    return null
  }

  return (
    <Page>
      <SEO
        title="Create a manalink"
        description="Send mana to anyone via link!"
        url="/send"
      />

      <Title text="Create a manalink" />
      <p>
        You can use manalinks to send mana to other people, even if they
        don&apos;t yet have a Manifold account.
      </p>
      <form
        className="my-5"
        onSubmit={async () => {
          await createManalink({
            fromId: user.id,
            amount: newManalink.amount,
            expiresTime: newManalink.expiresTime,
            maxUses: newManalink.maxUses,
            message: newManalink.message,
          })
        }}
      >
        <div className="flex flex-row flex-wrap gap-x-5 gap-y-2">
          <div className="form-control flex-auto">
            <label className="label">Amount</label>
            <input
              className="input"
              type="number"
              value={newManalink.amount}
              onChange={(e) =>
                setNewManalink((m) => {
                  return { ...m, amount: parseInt(e.target.value) }
                })
              }
            ></input>
          </div>
          <div className="form-control flex-auto">
            <label className="label">Uses</label>
            <input
              className="input"
              type="number"
              value={newManalink.maxUses ?? ''}
              onChange={(e) =>
                setNewManalink((m) => {
                  return { ...m, maxUses: parseInt(e.target.value) }
                })
              }
            ></input>
          </div>
          <div className="form-control flex-auto">
            <label className="label">Expires at</label>
            <input
              value={
                newManalink.expiresTime != null
                  ? dayjs(newManalink.expiresTime).format('YYYY-MM-DDTHH:mm')
                  : ''
              }
              className="input"
              type="datetime-local"
              onChange={(e) => {
                setNewManalink((m) => {
                  console.log(e.target.value)
                  console.log(
                    dayjs(e.target.value, 'YYYY-MM-DDTHH:mm').valueOf()
                  )
                  return {
                    ...m,
                    expiresTime: e.target.value
                      ? dayjs(e.target.value, 'YYYY-MM-DDTHH:mm').valueOf()
                      : null,
                  }
                })
              }}
            ></input>
          </div>
        </div>
        <div className="form-control w-full">
          <label className="label">Message</label>
          <Textarea
            placeholder={`From ${user.name}`}
            className="input input-bordered resize-none"
            autoFocus
            value={newManalink.message}
            onChange={(e) =>
              setNewManalink((m) => {
                return { ...m, message: e.target.value }
              })
            }
          />
        </div>
        <input
          type="submit"
          className="btn mt-5 max-w-xs"
          value="Create"
        ></input>
      </form>

      <Title text="Preview" />
      <p>This is what the person you send the link to will see:</p>
      <ManalinkCard
        className="my-5"
        defaultMessage={`From ${user.name}`}
        info={newManalink}
        isClaiming={false}
      />
      {links.length > 0 && <LinksTable links={links} />}

      {manalinkTxns.length > 0 && (
        <Col className="mt-12">
          <h1 className="mb-4 text-xl font-semibold text-gray-900">
            Claimed links
          </h1>
          {manalinkTxns.map((txn) => (
            <Claim txn={txn} key={txn.id} />
          ))}
        </Col>
      )}
    </Page>
  )
}

export function Claim(props: { txn: Txn }) {
  const { txn } = props
  const from = useUserById(txn.fromId)
  const to = useUserById(txn.toId)

  if (!from || !to) {
    return <>Loading...</>
  }

  return (
    <div className="mb-2 flow-root pr-2 md:pr-0">
      <div className="relative flex items-center space-x-3">
        <Avatar username={to.name} avatarUrl={to.avatarUrl} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="mt-0.5 text-sm text-gray-500">
            <UserLink
              className="text-gray-500"
              username={to.username}
              name={to.name}
            />{' '}
            claimed {formatMoney(txn.amount)} from{' '}
            <UserLink
              className="text-gray-500"
              username={from.username}
              name={from.name}
            />
            <RelativeTimestamp time={txn.createdTime} />
          </p>
        </div>
      </div>
    </div>
  )
}

function LinksTable(props: { links: Manalink[] }) {
  const { links } = props

  return (
    <div>
      <div className="sm:flex sm:items-center">
        <div className="sm:flex-auto">
          <h1 className="text-xl font-semibold text-gray-900">Your links</h1>
          <p className="mt-2 text-sm text-gray-700">
            All mana links you&apos;ve created so far~
          </p>
        </div>
      </div>
      <div className="mt-8 flex flex-col">
        <div className="-my-2 -mx-4 overflow-x-auto sm:-mx-6 lg:-mx-8">
          <div className="inline-block min-w-full py-2 align-middle md:px-6 lg:px-8">
            <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
              <table className="min-w-full divide-y divide-gray-300">
                <thead className="bg-gray-50">
                  <tr>
                    <th
                      scope="col"
                      className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6"
                    >
                      Amount
                    </th>
                    <th
                      scope="col"
                      className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900"
                    >
                      Link
                    </th>
                    <th
                      scope="col"
                      className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900"
                    >
                      Uses
                    </th>
                    <th
                      scope="col"
                      className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900"
                    >
                      Max Uses
                    </th>
                    <th
                      scope="col"
                      className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900"
                    >
                      Expires
                    </th>
                    <th
                      scope="col"
                      className="relative py-3.5 pl-3 pr-4 sm:pr-6"
                    >
                      <span className="sr-only">Edit</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {links.map((manalink) => (
                    <tr key={manalink.slug}>
                      <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6">
                        {formatMoney(manalink.amount)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                        {getLinkUrl(manalink.slug)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                        {manalink.claimedUserIds.length}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                        {manalink.maxUses == null ? '∞' : manalink.maxUses}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                        {manalink.expiresTime == null
                          ? 'Never'
                          : fromNow(manalink.expiresTime)}
                      </td>
                      <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                        <a
                          href="#"
                          className="text-indigo-600 hover:text-indigo-900"
                        >
                          Edit<span className="sr-only">, {manalink.slug}</span>
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
