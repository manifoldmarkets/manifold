import { useState } from 'react'
import { groupBy } from 'lodash'
import dayjs from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat'
dayjs.extend(customParseFormat)

import { User } from 'common/user'
import { formatMoney } from 'common/util/format'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { CreateLinksButton } from 'web/components/manalinks/create-links-button'
import { SEO } from 'web/components/SEO'
import { Subtitle } from 'web/components/widgets/subtitle'
import { Title } from 'web/components/widgets/title'
import { redirectIfLoggedOut } from 'web/lib/firebase/server-auth'
import { getUserAndPrivateUser } from 'web/lib/firebase/users'

import { REFERRAL_AMOUNT } from 'common/economy'
import { ENV_CONFIG } from 'common/envs/constants'
import { linkClaimed, ManalinkCardFromView } from 'web/components/manalink-card'
import { Pagination } from 'web/components/widgets/pagination'
import ShortToggle from 'web/components/widgets/short-toggle'
import Link from 'next/link'
import { useCanSendMana } from 'web/hooks/use-can-send-mana'
import { initSupabaseAdmin } from 'web/lib/supabase/admin-db'
import {
  ClaimInfo,
  ManalinkInfo,
  getUserManalinks,
  getUserManalinkClaims,
} from 'web/lib/supabase/manalinks'

type LinkAndClaims = { link: ManalinkInfo; claims: ClaimInfo[] }

const LINKS_PER_PAGE = 24

export const getServerSideProps = redirectIfLoggedOut('/', async (_, creds) => {
  const adminDb = await initSupabaseAdmin()
  const [auth, links, claims] = await Promise.all([
    getUserAndPrivateUser(creds.uid),
    getUserManalinks(creds.uid, adminDb),
    getUserManalinkClaims(creds.uid, adminDb),
  ])
  const claimsByLinkId = groupBy(claims, (c) => c.manalinkId)
  const userLinks = links.map((l) => ({
    link: l,
    claims: claimsByLinkId[l.slug] ?? [],
  }))
  return { props: { auth, userLinks } }
})

export function getManalinkUrl(slug: string) {
  return `${location.protocol}//${location.host}/link/${slug}`
}

export default function LinkPage(props: {
  auth: { user: User }
  userLinks: LinkAndClaims[]
}) {
  const { user } = props.auth
  const { userLinks } = props
  const [highlightedSlug, setHighlightedSlug] = useState('')
  const [showDisabled, setShowDisabled] = useState(false)
  const displayedLinks = showDisabled
    ? userLinks
    : userLinks.filter((l) => !linkClaimed(l.link, l.claims.length))
  const { canSend, message } = useCanSendMana(user)

  return (
    <Page trackPageView={'manalinks page'}>
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
          <Link href="/referrals">
            Eligible for {formatMoney(REFERRAL_AMOUNT)} referral bonus if a new
            user signs up and places a trade!!
          </Link>
        </p>

        <Row className="items-baseline justify-between">
          <Subtitle>Your Manalinks</Subtitle>
          <Row className="text-ink-500 items-center gap-4 text-sm">
            Show claimed links
            <ShortToggle on={showDisabled} setOn={setShowDisabled} />
          </Row>
        </Row>
        {canSend ? (
          <ManalinksDisplay
            items={displayedLinks}
            highlightedSlug={highlightedSlug}
          />
        ) : (
          <p className="text-ink-500">{message}</p>
        )}
      </Col>
    </Page>
  )
}

function ManalinksDisplay(props: {
  items: LinkAndClaims[]
  highlightedSlug: string
}) {
  const { items, highlightedSlug } = props
  const [page, setPage] = useState(0)
  const start = page * LINKS_PER_PAGE
  const end = start + LINKS_PER_PAGE
  const displayedItems = items.slice(start, end)

  if (items.length === 0) {
    return (
      <p className="text-ink-500">
        You don't have any active manalinks. Create one to spread the wealth!
      </p>
    )
  } else {
    return (
      <>
        <Col className="grid w-full gap-4 md:grid-cols-2">
          {displayedItems.map((item) => (
            <ManalinkCardFromView
              key={item.link.slug}
              info={item.link}
              claims={item.claims}
              highlightedSlug={highlightedSlug}
            />
          ))}
        </Col>
        <Pagination
          page={page}
          itemsPerPage={LINKS_PER_PAGE}
          totalItems={items.length}
          setPage={setPage}
          className="bg-transparent"
        />
      </>
    )
  }
}
