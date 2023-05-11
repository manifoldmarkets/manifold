import {
  APPLE_APP_URL,
  DOMAIN,
  ENV_CONFIG,
  GOOGLE_PLAY_APP_URL,
} from 'common/envs/constants'
import { formatMoney } from 'common/util/format'
import Link from 'next/link'
import { useState } from 'react'
import Masonry from 'react-masonry-css'
import { MobileAppsQRCodeDialog } from 'web/components/buttons/mobile-apps-qr-code-button'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Spacer } from 'web/components/layout/spacer'
import { SEO } from 'web/components/SEO'
import { Card } from 'web/components/widgets/card'
import { Title } from 'web/components/widgets/title'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { useUser } from 'web/hooks/use-user'
import { getNativePlatform } from 'web/lib/native/is-native'
import { isIOS } from 'web/lib/util/device'

export default function LabsPage() {
  const { isNative, platform } = getNativePlatform()

  const isMobile = useIsMobile()
  const [isModalOpen, setIsModalOpen] = useState(false)

  const appCallback = isMobile
    ? { href: isIOS() ? APPLE_APP_URL : GOOGLE_PLAY_APP_URL }
    : ({
        href: '#',
        onClick: (e: any) => {
          e.preventDefault()
          setIsModalOpen(true)
        },
      } as { href: string }) // typechecker is dumb

  const user = useUser()

  return (
    <Page>
      <SEO title="Sitemap" description="Manifold sitemap" url="/sitemap" />

      <Col className="p-4">
        <Title>🗺️ Sitemap</Title>
        <MobileAppsQRCodeDialog
          isModalOpen={isModalOpen}
          setIsModalOpen={setIsModalOpen}
        />
        <Masonry
          breakpointCols={{ default: 2, 768: 1 }}
          className="-ml-4 flex w-auto"
          columnClassName="pl-4 bg-clip-padding"
        >
          <LabCard
            title="🙋 About & Help"
            description={`Learn more about Manifold`}
            href="https://help.manifold.markets/"
          />

          <LabCard
            title="💬 Discord"
            description={`Join our community on Discord`}
            href="https://discord.com/invite/eHQBNBqXuh"
          />

          <LabCard
            title="📱 App"
            description={`Download our iOS/Android app`}
            {...appCallback}
          />

          <LabCard
            title="📰 Newsletter"
            description={`Read the latest about Manifold`}
            href="https://news.manifold.markets/"
          />
        </Masonry>

        <Masonry
          breakpointCols={{ default: 2, 768: 1 }}
          className="-ml-4 mt-8 flex w-auto"
          columnClassName="pl-4 bg-clip-padding"
        >
          <LabCard
            title="⚖️ Markets"
            description="Search for markets"
            href="/markets"
          />

          {(!isNative || (isNative && platform !== 'ios')) && (
            <>
              <LabCard
                title="💰 Get mana"
                description="Buy Ṁ to trade in your favorite markets"
                href="/add-funds"
              />

              <LabCard
                title="🫀 Charity"
                description={`Turn ${ENV_CONFIG.moneyMoniker} into real charitable donations`}
                href="/charity"
              />
            </>
          )}

          <LabCard
            title="💸 Referrals"
            description="Refer your friends to earn mana"
            href="/referrals"
          />

          <LabCard
            title="👥 Users"
            description="Find your friends or other people on Manifold"
            href="/users"
          />

          <LabCard
            title="⚔️ Versus"
            description="Create mana-battles between two players"
            href="/versus"
          />

          <LabCard
            title="🔥 Swipe"
            description="Swipe-to-bet UI. Try via iOS/Android app."
            {...(isNative ? { href: '/swipe' } : appCallback)}
          />

          <LabCard
            title="⚡️ Live"
            description="Live feed of Manifold activity"
            href="/live"
          />

          <LabCard
            title="💬 Discord Bot"
            description="Create, trade, and share markets directly from Discord"
            href="/discord-bot"
          />

          <LabCard
            title="🏆 CSPI/Salem tournament"
            description="Special contest on politics and current events"
            href="https://salemcenter.manifold.markets/"
          />

          <LabCard
            title="🎮 Twitch bot"
            description="Embed markets in your stream"
            href="/twitch"
          />

          <LabCard
            title="📏 Calibration"
            description="User bet calibration graph"
            href="/my-calibration"
          />

          <LabCard
            title="👥 Groups"
            description="Curated markets on a topic"
            href="/groups"
          />

          <LabCard
            title="🏆 Leaderboards"
            description="See who's winning"
            href="/leaderboards"
          />

          <LabCard
            title="💸 Manalinks"
            description={`Send ${ENV_CONFIG.moneyMoniker} to anyone`}
            href="/links"
          />

          <LabCard
            title="📈 Stats"
            description="See how Manifold is doing"
            href="/stats"
          />

          <LabCard
            title="✏ Posts"
            description="Go long on longform"
            href="/latestposts"
          />

          <LabCard
            title="🎨 Design system"
            description="For us, mostly"
            href="/styles"
          />
        </Masonry>

        <Spacer h={8} />

        <Title>🧪 Labs</Title>
        <div className="mb-4">Experimental or past projects at Manifold</div>
        <Masonry
          breakpointCols={{ default: 2, 768: 1 }}
          className="-ml-4 flex w-auto"
          columnClassName="pl-4 bg-clip-padding"
        >
          {user && (
            <LabCard
              title="🎁 Loot box"
              description="Invest in random markets"
              href="/lootbox"
            />
          )}
          <LabCard
            title="🎴 Manifold: The Gambling"
            description="Match each market to its creator"
            href="/cards"
          />
          <LabCard
            title="💰 Mana auction"
            description={`A dollar auction but for ${formatMoney(10000)}`}
            href="/mana-auction"
          />
          <LabCard
            title="💭 Dream"
            description="Ask our AI to generate a custom image"
            href="/dream"
          />
          <LabCard
            title="💌 Dating"
            description="Browse dating profiles and bet on relationships"
            href="/date-docs"
          />
          <LabCard
            title="🎲 Magic the Guessering"
            description="Match MTG card names to their art"
            href={`https://${DOMAIN}/mtg/index.html`}
          />
          <LabCard
            title="👀 Ads"
            description="Read ads for mana. Or pay mana to promote your content."
            href="/ad"
          />
          <LabCard title="🐮 Cowp" description="???" href="/cowp" />
        </Masonry>

        <Spacer h={8} />
      </Col>
    </Page>
  )
}

const LabCard = (props: {
  title: string
  description: string
  href: string
  onClick?: () => void
}) => {
  const { title, description, href, onClick } = props
  return (
    <Link href={href} onClick={onClick} className="mb-4 block">
      <Card className="flex flex-col gap-2 px-4 py-3">
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="text-ink-600">{description}</p>
      </Card>
    </Link>
  )
}
