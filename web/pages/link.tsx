import { useState } from 'react'
import { Claim, Manalink } from 'common/manalink'
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
      <Title text="Your links" />
      {links.length > 0 ? (
        <LinksTable links={links} />
      ) : (
        <p>You haven&apos;t yet created any manalinks.</p>
      )}

      {manalinkTxns.length > 0 && (
        <Col className="mt-12">
          <h1 className="mb-4 text-xl font-semibold text-gray-900">
            Claimed links
          </h1>
          {manalinkTxns.map((txn) => (
            <ClaimDescription txn={txn} key={txn.id} />
          ))}
        </Col>
      )}
    </Page>
  )
}

export function ClaimDescription(props: { txn: Txn }) {
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

function ClaimTableRow(props: { claim: Claim }) {
  const { claim } = props
  const who = useUserById(claim.toId)
  return (
    <tr className="text-sm text-gray-500">
      <td className="px-5 py-2">{who?.name || 'Loading...'}</td>
      <td className="px-5 py-2">{`${new Date(
        claim.claimedTime
      ).toLocaleString()}, ${fromNow(claim.claimedTime)}`}</td>
    </tr>
  )
}

function LinkDetailsTable(props: { link: Manalink }) {
  const { link } = props
  return (
    <table className="w-full divide-y divide-gray-300 border border-gray-400">
      <thead className="bg-gray-50 text-left text-sm font-semibold text-gray-900">
        <tr>
          <th className="px-5 py-2">Claimant</th>
          <th className="px-5 py-2">Time</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-200 bg-white">
        {link.claims.map((claim) => (
          <ClaimTableRow claim={claim} />
        ))}
      </tbody>
    </table>
  )
}

function LinkTableRow(props: { link: Manalink }) {
  const { link } = props
  const [expanded, setExpanded] = useState(false)
  return (
    <>
      <LinkSummaryRow link={link} onClick={() => setExpanded((exp) => !exp)} />
      {expanded && (
        <tr>
          <td className="bg-gray-100 p-3" colSpan={5}>
            <LinkDetailsTable link={link} />
          </td>
        </tr>
      )}
    </>
  )
}

function LinkSummaryRow(props: { link: Manalink; onClick: () => void }) {
  const { link, onClick } = props
  return (
    <tr
      onClick={onClick}
      className="whitespace-nowrap text-sm text-gray-500 hover:cursor-pointer hover:bg-sky-50"
      key={link.slug}
    >
      <td className="px-5 py-4 font-medium text-gray-900">
        {formatMoney(link.amount)}
      </td>
      <td className="px-5 py-4">{getLinkUrl(link.slug)}</td>
      <td className="px-5 py-4">{link.claimedUserIds.length}</td>
      <td className="px-5 py-4">{link.maxUses == null ? '∞' : link.maxUses}</td>
      <td className="px-5 py-4">
        {link.expiresTime == null ? 'Never' : fromNow(link.expiresTime)}
      </td>
    </tr>
  )
}

function LinksTable(props: { links: Manalink[] }) {
  const { links } = props
  return (
    <table className="w-full divide-y divide-gray-300 rounded-lg border border-gray-200">
      <thead className="bg-gray-50 text-left text-sm font-semibold text-gray-900">
        <tr>
          <th className="px-5 py-3.5">Amount</th>
          <th className="px-5 py-3.5">Link</th>
          <th className="px-5 py-3.5">Uses</th>
          <th className="px-5 py-3.5">Max Uses</th>
          <th className="px-5 py-3.5">Expires</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-200 bg-white">
        {links.map((link) => (
          <LinkTableRow link={link} />
        ))}
      </tbody>
    </table>
  )
}
