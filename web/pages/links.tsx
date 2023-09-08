import { useState } from 'react'

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
import { Manalink } from 'common/manalink'
import {
  linkClaimed,
  ManalinkCardFromView,
  toInfo,
} from 'web/components/manalink-card'
import { Pagination } from 'web/components/widgets/pagination'
import ShortToggle from 'web/components/widgets/short-toggle'
import Link from 'next/link'
import { useCanSendMana } from 'web/hooks/use-can-send-mana'
import { initSupabaseAdmin } from 'web/lib/supabase/admin-db'
import { getUserManalinks } from 'web/lib/supabase/manalinks'

const LINKS_PER_PAGE = 24

export const getServerSideProps = redirectIfLoggedOut('/', async (_, creds) => {
  const adminDb = await initSupabaseAdmin()
  return {
    props: {
      auth: await getUserAndPrivateUser(creds.uid),
      userLinks: await getUserManalinks(creds.uid, adminDb),
    },
  }
})

export function getManalinkUrl(slug: string) {
  return `${location.protocol}//${location.host}/link/${slug}`
}

export default function LinkPage(props: {
  auth: { user: User }
  userLinks: Manalink[]
}) {
  const { user } = props.auth
  const { userLinks } = props
  const [highlightedSlug, setHighlightedSlug] = useState('')
  const [showDisabled, setShowDisabled] = useState(false)
  const displayedLinks = showDisabled
    ? userLinks
    : userLinks.filter((l) => !linkClaimed(toInfo(l)))
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
            links={displayedLinks}
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
        />
      </>
    )
  }
}
