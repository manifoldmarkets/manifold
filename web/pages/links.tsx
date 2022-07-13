import clsx from 'clsx'
import { useState } from 'react'
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/solid'
import { Claim, Manalink } from 'common/manalink'
import { formatMoney } from 'common/util/format'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Page } from 'web/components/page'
import { SEO } from 'web/components/SEO'
import { Title } from 'web/components/title'
import { Subtitle } from 'web/components/subtitle'
import { useUser } from 'web/hooks/use-user'
import { useUserManalinks } from 'web/lib/firebase/manalinks'
import { fromNow } from 'web/lib/util/time'
import { useUserById } from 'web/hooks/use-users'
import { ManalinkTxn } from 'common/txn'
import { Avatar } from 'web/components/avatar'
import { RelativeTimestamp } from 'web/components/relative-timestamp'
import { UserLink } from 'web/components/user-page'
import { CreateLinksButton } from 'web/components/manalinks/create-links-button'

import dayjs from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat'
dayjs.extend(customParseFormat)

export function getManalinkUrl(slug: string) {
  return `${location.protocol}//${location.host}/link/${slug}`
}

export default function LinkPage() {
  const user = useUser()
  const links = useUserManalinks(user?.id ?? '')
  // const manalinkTxns = useManalinkTxns(user?.id ?? '')
  const [highlightedSlug, setHighlightedSlug] = useState('')
  const unclaimedLinks = links.filter(
    (l) =>
      (l.maxUses == null || l.claimedUserIds.length < l.maxUses) &&
      (l.expiresTime == null || l.expiresTime > Date.now())
  )

  if (user == null) {
    return null
  }

  return (
    <Page>
      <SEO
        title="Manalinks"
        description="Send M$ to others with a link, even if they don't have a Manifold account yet!"
        url="/send"
      />
      <Col className="w-full px-8">
        <Row className="items-center justify-between">
          <Title text="Manalinks" />
          {user && (
            <CreateLinksButton
              user={user}
              highlightedSlug={highlightedSlug}
              setHighlightedSlug={setHighlightedSlug}
            />
          )}
        </Row>
        <p>
          You can use manalinks to send mana to other people, even if they
          don&apos;t yet have a Manifold account.
        </p>
        <Subtitle text="Your Manalinks" />
        <LinksTable links={unclaimedLinks} highlightedSlug={highlightedSlug} />
      </Col>
    </Page>
  )
}

export function ClaimsList(props: { txns: ManalinkTxn[] }) {
  const { txns } = props
  return (
    <>
      <h1 className="mb-4 text-xl font-semibold text-gray-900">
        Claimed links
      </h1>
      {txns.map((txn) => (
        <ClaimDescription txn={txn} key={txn.id} />
      ))}
    </>
  )
}

export function ClaimDescription(props: { txn: ManalinkTxn }) {
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
    <tr>
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
          <th className="px-5 py-2">Claimed by</th>
          <th className="px-5 py-2">Time</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-200 bg-white text-sm text-gray-500">
        {link.claims.length ? (
          link.claims.map((claim) => <ClaimTableRow claim={claim} />)
        ) : (
          <tr>
            <td className="px-5 py-2" colSpan={2}>
              No claims yet.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  )
}

function LinkTableRow(props: { link: Manalink; highlight: boolean }) {
  const { link, highlight } = props
  const [expanded, setExpanded] = useState(false)
  return (
    <>
      <LinkSummaryRow
        link={link}
        highlight={highlight}
        expanded={expanded}
        onToggle={() => setExpanded((exp) => !exp)}
      />
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

function LinkSummaryRow(props: {
  link: Manalink
  highlight: boolean
  expanded: boolean
  onToggle: () => void
}) {
  const { link, highlight, expanded, onToggle } = props
  const className = clsx(
    'whitespace-nowrap text-sm hover:cursor-pointer text-gray-500 hover:bg-sky-50 bg-white',
    highlight ? 'bg-indigo-100 rounded-lg animate-pulse' : ''
  )
  return (
    <tr id={link.slug} key={link.slug} className={className}>
      <td className="py-4 pl-5" onClick={onToggle}>
        {expanded ? (
          <ChevronUpIcon className="h-5 w-5" />
        ) : (
          <ChevronDownIcon className="h-5 w-5" />
        )}
      </td>

      <td className="px-5 py-4 font-medium text-gray-900">
        {formatMoney(link.amount)}
      </td>
      <td className="px-5 py-4">{getManalinkUrl(link.slug)}</td>
      <td className="px-5 py-4">{link.claimedUserIds.length}</td>
      <td className="px-5 py-4">{link.maxUses == null ? '∞' : link.maxUses}</td>
      <td className="px-5 py-4">
        {link.expiresTime == null ? 'Never' : fromNow(link.expiresTime)}
      </td>
    </tr>
  )
}

function LinksTable(props: { links: Manalink[]; highlightedSlug?: string }) {
  const { links, highlightedSlug } = props
  return links.length == 0 ? (
    <p>You don&apos;t currently have any outstanding manalinks.</p>
  ) : (
    <div className="overflow-scroll">
      <table className="w-full divide-y divide-gray-300 rounded-lg border border-gray-200">
        <thead className="bg-gray-50 text-left text-sm font-semibold text-gray-900">
          <tr>
            <th></th>
            <th className="px-5 py-3.5">Amount</th>
            <th className="px-5 py-3.5">Link</th>
            <th className="px-5 py-3.5">Uses</th>
            <th className="px-5 py-3.5">Max Uses</th>
            <th className="px-5 py-3.5">Expires</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white">
          {links.map((link) => (
            <LinkTableRow
              link={link}
              highlight={link.slug === highlightedSlug}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}
