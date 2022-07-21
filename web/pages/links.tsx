import { useState } from 'react'
import { formatMoney } from 'common/util/format'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Page } from 'web/components/page'
import { SEO } from 'web/components/SEO'
import { Title } from 'web/components/title'
import { Subtitle } from 'web/components/subtitle'
import { useUser } from 'web/hooks/use-user'
import { useUserManalinks } from 'web/lib/firebase/manalinks'
import { useUserById } from 'web/hooks/use-user'
import { ManalinkTxn } from 'common/txn'
import { Avatar } from 'web/components/avatar'
import { RelativeTimestamp } from 'web/components/relative-timestamp'
import { UserLink } from 'web/components/user-page'
import { CreateLinksButton } from 'web/components/manalinks/create-links-button'
import { redirectIfLoggedOut } from 'web/lib/firebase/server-auth'

import dayjs from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat'
import { ManalinkCardFromView } from 'web/components/manalink-card'
import { Pagination } from 'web/components/pagination'
dayjs.extend(customParseFormat)

const LINKS_PER_PAGE = 24
export const getServerSideProps = redirectIfLoggedOut('/')

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
  const [page, setPage] = useState(0)
  const start = page * LINKS_PER_PAGE
  const end = start + LINKS_PER_PAGE
  const displayedLinks = unclaimedLinks.slice(start, end)

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
        <Col className="grid w-full gap-4 md:grid-cols-2">
          {displayedLinks.map((link) => {
            return (
              <ManalinkCardFromView
                link={link}
                highlightedSlug={highlightedSlug}
              />
            )
          })}
        </Col>
        <Pagination
          page={page}
          itemsPerPage={LINKS_PER_PAGE}
          totalItems={unclaimedLinks.length}
          setPage={setPage}
          className="mt-4 bg-transparent"
          scrollToTop
        />
      </Col>
    </Page>
  )
}

// TODO: either utilize this or get rid of it
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
