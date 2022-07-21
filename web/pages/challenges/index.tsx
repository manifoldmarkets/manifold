import clsx from 'clsx'
import React, { useState } from 'react'
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/solid'
import { formatMoney } from 'common/util/format'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Page } from 'web/components/page'
import { SEO } from 'web/components/SEO'
import { Title } from 'web/components/title'
import { useUser } from 'web/hooks/use-user'
import { fromNow } from 'web/lib/util/time'
import { useUserById } from 'web/hooks/use-user'

import dayjs from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat'
import {
  getChallengeUrl,
  useAcceptedChallenges,
  useUserChallenges,
} from 'web/lib/firebase/challenges'
import { Challenge, Acceptance } from 'common/challenge'
import { copyToClipboard } from 'web/lib/util/copy'
import { ToastClipboard } from 'web/components/toast-clipboard'
import { Tabs } from 'web/components/layout/tabs'
import { SiteLink } from 'web/components/site-link'
import { UserLink } from 'web/components/user-page'
import { Avatar } from 'web/components/avatar'
dayjs.extend(customParseFormat)

export function getManalinkUrl(slug: string) {
  return `${location.protocol}//${location.host}/link/${slug}`
}

export default function LinkPage() {
  const user = useUser()
  const userChallenges = useUserChallenges(user?.id ?? '')
  const challenges = useAcceptedChallenges()

  return (
    <Page>
      <SEO
        title="Challenges"
        description="Challenge your friends to a bet!"
        url="/send"
      />
      <Col className="w-full px-8">
        <Row className="items-center justify-between">
          <Title text="Challenges" />
          {/*{user && (*/}
          {/*  <CreateChallengeButton*/}
          {/*    user={user}*/}
          {/*  />*/}
          {/*)}*/}
        </Row>
        <p>Find or create a question to challenge someone to a bet.</p>
        <Tabs
          tabs={[
            {
              content: <AllLinksTable links={challenges} />,
              title: 'All Challenges',
            },
          ].concat(
            user
              ? {
                  content: <LinksTable links={userChallenges} />,
                  title: 'Your Challenges',
                }
              : []
          )}
        />
      </Col>
    </Page>
  )
}
//
// export function ClaimsList(props: { txns: ManalinkTxn[] }) {
//   const { txns } = props
//   return (
//     <>
//       <h1 className="mb-4 text-xl font-semibold text-gray-900">
//         Claimed links
//       </h1>
//       {txns.map((txn) => (
//         <ClaimDescription txn={txn} key={txn.id} />
//       ))}
//     </>
//   )
// }

// export function ClaimDescription(props: { txn: ManalinkTxn }) {
//   const { txn } = props
//   const from = useUserById(txn.fromId)
//   const to = useUserById(txn.toId)
//
//   if (!from || !to) {
//     return <>Loading...</>
//   }
//
//   return (
//     <div className="mb-2 flow-root pr-2 md:pr-0">
//       <div className="relative flex items-center space-x-3">
//         <Avatar username={to.name} avatarUrl={to.avatarUrl} size="sm" />
//         <div className="min-w-0 flex-1">
//           <p className="mt-0.5 text-sm text-gray-500">
//             <UserLink
//               className="text-gray-500"
//               username={to.username}
//               name={to.name}
//             />{' '}
//             claimed {formatMoney(txn.amount)} from{' '}
//             <UserLink
//               className="text-gray-500"
//               username={from.username}
//               name={from.name}
//             />
//             <RelativeTimestamp time={txn.createdTime} />
//           </p>
//         </div>
//       </div>
//     </div>
//   )
// }

function ClaimTableRow(props: { claim: Acceptance }) {
  const { claim } = props
  const who = useUserById(claim.userId)
  return (
    <tr>
      <td className="px-5 py-2">{who?.name || 'Loading...'}</td>
      <td className="px-5 py-2">{`${new Date(
        claim.createdTime
      ).toLocaleString()}, ${fromNow(claim.createdTime)}`}</td>
    </tr>
  )
}

function LinkDetailsTable(props: { link: Challenge }) {
  const { link } = props
  return (
    <table className="w-full divide-y divide-gray-300 border border-gray-400">
      <thead className="bg-gray-50 text-left text-sm font-semibold text-gray-900">
        <tr>
          <th className="px-5 py-2">Accepted by</th>
          <th className="px-5 py-2">Time</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-200 bg-white text-sm text-gray-500">
        {link.acceptances.length ? (
          link.acceptances.map((claim) => <ClaimTableRow claim={claim} />)
        ) : (
          <tr>
            <td className="px-5 py-2" colSpan={2}>
              No one's accepted this challenge yet.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  )
}

function LinkTableRow(props: { link: Challenge; highlight: boolean }) {
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
  link: Challenge
  highlight: boolean
  expanded: boolean
  onToggle: () => void
}) {
  const { link, highlight, expanded, onToggle } = props
  const [showToast, setShowToast] = useState(false)

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
        {formatMoney(link.creatorAmount)}
      </td>
      <td
        className="relative px-5 py-4"
        onClick={() => {
          copyToClipboard(getChallengeUrl(link))
          setShowToast(true)
          setTimeout(() => setShowToast(false), 3000)
        }}
      >
        {getChallengeUrl(link)
          .replace('https://manifold.markets', '...')
          .replace('http://localhost:3000', '...')}
        {showToast && <ToastClipboard className={'left-10 -top-5'} />}
      </td>

      <td className="px-5 py-4">
        {link.acceptedByUserIds.length > 0 ? 'Yes' : 'No'}
      </td>
      <td className="px-5 py-4">
        {link.expiresTime == null ? 'Never' : fromNow(link.expiresTime)}
      </td>
    </tr>
  )
}

function LinksTable(props: { links: Challenge[]; highlightedSlug?: string }) {
  const { links, highlightedSlug } = props
  return links.length == 0 ? (
    <p>You don't currently have any challenges.</p>
  ) : (
    <div className="overflow-scroll">
      <table className="w-full divide-y divide-gray-300 rounded-lg border border-gray-200">
        <thead className="bg-gray-50 text-left text-sm font-semibold text-gray-900">
          <tr>
            <th></th>
            <th className="px-5 py-3.5">Amount</th>
            <th className="px-5 py-3.5">Link</th>
            <th className="px-5 py-3.5">Accepted</th>
            <th className="px-5 py-3.5">Expires</th>
          </tr>
        </thead>
        <tbody className={'divide-y divide-gray-200 bg-white'}>
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
function AllLinksTable(props: {
  links: Challenge[]
  highlightedSlug?: string
}) {
  const { links, highlightedSlug } = props
  return links.length == 0 ? (
    <p>There aren't currently any challenges.</p>
  ) : (
    <div className="overflow-scroll">
      <table className="w-full divide-y divide-gray-300 rounded-lg border border-gray-200">
        <thead className="bg-gray-50 text-left text-sm font-semibold text-gray-900">
          <tr>
            <th className="px-5 py-3.5">Amount</th>
            <th className="px-5 py-3.5">Challenge Link</th>
            <th className="px-5 py-3.5">Accepted By</th>
          </tr>
        </thead>
        <tbody className={'divide-y divide-gray-200 bg-white'}>
          {links.map((link) => (
            <PublicLinkTableRow
              link={link}
              highlight={link.slug === highlightedSlug}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PublicLinkTableRow(props: { link: Challenge; highlight: boolean }) {
  const { link, highlight } = props
  return <PublicLinkSummaryRow link={link} highlight={highlight} />
}

function PublicLinkSummaryRow(props: { link: Challenge; highlight: boolean }) {
  const { link, highlight } = props

  const className = clsx(
    'whitespace-nowrap text-sm hover:cursor-pointer text-gray-500 hover:bg-sky-50 bg-white',
    highlight ? 'bg-indigo-100 rounded-lg animate-pulse' : ''
  )
  return (
    <tr id={link.slug} key={link.slug} className={className}>
      <td className="px-5 py-4 font-medium text-gray-900">
        {formatMoney(link.creatorAmount)}
      </td>
      <td className="relative px-2 py-4">
        <SiteLink href={getChallengeUrl(link)}>
          {getChallengeUrl(link)
            .replace('https://manifold.markets', '...')
            .replace('http://localhost:3000', '...')}
        </SiteLink>
      </td>

      <td className="px-2 py-4">
        <Row className={'items-center justify-start gap-1'}>
          <Avatar
            username={link.acceptances[0].userUsername}
            avatarUrl={link.acceptances[0].userAvatarUrl}
            size={'sm'}
          />
          <UserLink
            name={link.acceptances[0].userName}
            username={link.acceptances[0].userUsername}
          />
        </Row>
      </td>
    </tr>
  )
}
