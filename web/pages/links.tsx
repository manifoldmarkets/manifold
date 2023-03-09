import { useState } from 'react'

import dayjs from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat'
dayjs.extend(customParseFormat)

import { formatMoney } from 'common/util/format'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Page } from 'web/components/layout/page'
import { SEO } from 'web/components/SEO'
import { Title } from 'web/components/widgets/title'
import { Subtitle } from 'web/components/widgets/subtitle'
import { getUserAndPrivateUser } from 'web/lib/firebase/users'
import { useUserManalinks } from 'web/lib/firebase/manalinks'
import { useUserById } from 'web/hooks/use-user'
import { ManalinkTxn } from 'common/txn'
import { User } from 'common/user'
import { Avatar } from 'web/components/widgets/avatar'
import { RelativeTimestamp } from 'web/components/relative-timestamp'
import { CreateLinksButton } from 'web/components/manalinks/create-links-button'
import { redirectIfLoggedOut } from 'web/lib/firebase/server-auth'

import {
  linkClaimed,
  ManalinkCardFromView,
  toInfo,
} from 'web/components/manalink-card'
import { Pagination } from 'web/components/widgets/pagination'
import { canCreateManalink, Manalink } from 'common/manalink'
import { SiteLink } from 'web/components/widgets/site-link'
import { REFERRAL_AMOUNT } from 'common/economy'
import { UserLink } from 'web/components/widgets/user-link'
import { ENV_CONFIG } from 'common/envs/constants'
import ShortToggle from 'web/components/widgets/short-toggle'

const LINKS_PER_PAGE = 24

export const getServerSideProps = redirectIfLoggedOut('/', async (_, creds) => {
  return { props: { auth: await getUserAndPrivateUser(creds.uid) } }
})

export function getManalinkUrl(slug: string) {
  return `${location.protocol}//${location.host}/link/${slug}`
}

export default function LinkPage(props: { auth: { user: User } }) {
  const { user } = props.auth
  const links = useUserManalinks(user.id ?? '')
  // const manalinkTxns = useManalinkTxns(user?.id ?? '')
  const [highlightedSlug, setHighlightedSlug] = useState('')
  const [showDisabled, setShowDisabled] = useState(false)
  const displayedLinks = showDisabled
    ? links
    : links.filter((l) => !linkClaimed(toInfo(l)))

  const authorized = canCreateManalink(user)

  return (
    <Page>
      <SEO
        title="Manalinks"
        description="Send mana to others with a link, even if they don't have a Manifold account yet!"
        url="/send"
      />
      <Col className="mt-6 w-full px-8">
        <Row className="items-start justify-between">
          <Title>Manalinks</Title>
          {user && (
            <CreateLinksButton
              user={user}
              highlightedSlug={highlightedSlug}
              setHighlightedSlug={setHighlightedSlug}
            />
          )}
        </Row>
        <p>
          You can use manalinks to send mana ({ENV_CONFIG.moneyMoniker}) to
          other people, even if they don&apos;t yet have a Manifold account.{' '}
          <SiteLink href="/referrals">
            Eligible for {formatMoney(REFERRAL_AMOUNT)} referral bonus if a new
            user signs up and places a trade!!
          </SiteLink>
        </p>

        <Row className="items-baseline justify-between">
          <Subtitle>Your Manalinks</Subtitle>
          <Row className="text-ink-500 items-center gap-4 text-sm">
            Show claimed links
            <ShortToggle on={showDisabled} setOn={setShowDisabled} />
          </Row>
        </Row>
        {authorized ? (
          <ManalinksDisplay
            links={displayedLinks}
            highlightedSlug={highlightedSlug}
          />
        ) : (
          <p className="text-ink-500">
            Your account must be older than a week and have a balance or total
            profits greater than {formatMoney(1000)} to create manalinks.
          </p>
        )}
      </Col>
    </Page>
  )
}

function ManalinksDisplay(props: {
  links: Manalink[]
  highlightedSlug: string
}) {
  const { links, highlightedSlug } = props
  const [page, setPage] = useState(0)
  const start = page * LINKS_PER_PAGE
  const end = start + LINKS_PER_PAGE
  const displayedLinks = links.slice(start, end)

  if (links.length === 0) {
    return (
      <p className="text-ink-500">
        You don't have any active manalinks. Create one to spread the wealth!
      </p>
    )
  } else {
    return (
      <>
        <Col className="grid w-full gap-4 md:grid-cols-2">
          {displayedLinks.map((link) => (
            <ManalinkCardFromView
              key={link.slug + link.createdTime}
              link={link}
              highlightedSlug={highlightedSlug}
            />
          ))}
        </Col>
        <Pagination
          page={page}
          itemsPerPage={LINKS_PER_PAGE}
          totalItems={links.length}
          setPage={setPage}
          className="bg-transparent"
          scrollToTop
        />
      </>
    )
  }
}

// TODO: either utilize this or get rid of it
export function ClaimsList(props: { txns: ManalinkTxn[] }) {
  const { txns } = props
  return (
    <>
      <h1 className="text-ink-900 mb-4 text-xl font-semibold">Claimed links</h1>
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
          <p className="text-ink-500 mt-0.5 text-sm">
            <UserLink
              className="text-ink-500"
              username={to.username}
              name={to.name}
            />{' '}
            claimed {formatMoney(txn.amount)} from{' '}
            <UserLink
              className="text-ink-500"
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
