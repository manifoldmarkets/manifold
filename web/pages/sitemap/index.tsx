import { REFERRAL_AMOUNT } from 'common/economy'
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
import { Subtitle } from 'web/components/widgets/subtitle'
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
        <LabSection>
          <LabCard
            title="🙋 About & Help"
            href="https://help.manifold.markets/"
          />
          <LabCard
            title="💬 Discord"
            href="https://discord.com/invite/eHQBNBqXuh"
          />
          <LabCard title="📱 Download iOS/Android App" {...appCallback} />
          <LabCard
            title="📰 Newsletter"
            href="https://news.manifold.markets/"
          />
        </LabSection>
        <Subtitle>📄 Pages</Subtitle>
        <LabSection>
          {(!isNative || (isNative && platform !== 'ios')) && (
            <LabCard
              title="🫀 Charity"
              description={`Turn mana into real charitable donations`}
              href="/charity"
            />
          )}
          <LabCard
            title="💸 Referrals"
            description={`Refer a friend to earn ${formatMoney(
              REFERRAL_AMOUNT
            )}`}
            href="/referrals"
          />
          {(!isNative || (isNative && platform !== 'ios')) && (
            <LabCard title="💰 Get Mana" href="/add-funds" />
          )}
          <LabCard title="⚡️ Live Feed" href="/live" />
          <LabCard title="⚖️ Market Search" href="/markets" />
          <LabCard title="👥 User Search" href="/users" />
          <LabCard title="👥 Group Search" href="/groups" />
          <LabCard title="🏆 Leaderboards" href="/leaderboards" />

          <LabCard
            title="💸 Manalinks"
            description={`Send ${ENV_CONFIG.moneyMoniker} to anyone`}
            href="/links"
          />
          <LabCard
            title="📏 Platform calibration"
            description="See how Manifold is doing"
            href="/calibration"
          />
        </LabSection>
        <Subtitle>🧪 Ongoing Experiments</Subtitle>
        <LabSection>
          <LabCard
            title="⚔️ Versus"
            description="Create mana-battles between two ideas"
            href="/versus"
          />
          <LabCard
            title="❓ Q&A"
            description="Ask and answer questions to win mana"
            href="/q-and-a"
          />
          {user && (
            <LabCard
              title="🎁 Loot Box"
              description="Invest in random markets"
              href="/lootbox"
            />
          )}
          <LabCard
            title="🔥 Swipe"
            description="Swipe-to-bet UI. Try via iOS/Android app."
            {...(isNative ? { href: '/swipe' } : appCallback)}
          />
          <LabCard
            title="✏ Posts"
            description="Go long on longform"
            href="/latestposts"
          />
        </LabSection>

        <Subtitle>🏝️ Exotic lands</Subtitle>
        <LabSection>
          <LabCard
            title="🤖 Discord Bot"
            description="Create, trade, & share markets from Discord"
            href="/discord-bot"
          />
          <LabCard
            title="🎮 Twitch bot"
            description="Embed markets in your stream"
            href="/twitch"
          />
          <LabCard
            title="🏆 CSPI/Salem tournament"
            description="Special contest on politics and current events"
            href="https://salemcenter.manifold.markets/"
          />
          <LabCard
            title="📈 Stats"
            description="See how Manifold is doing"
            href="/stats"
          />
          <LabCard title="🎨 Design system" href="/styles" />
        </LabSection>
        <Subtitle>🪦 Spooky Graveyard</Subtitle>
        <div className="mb-4 italic">
          Dead and undead projects, haunting this page until we resurrect or
          exorcise them.
        </div>
        <LabSection>
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
            description="Generate an image with AI"
            href="/dream"
          />
          <LabCard
            title="💌 Dating"
            description="Browse dating profiles and bet on relationships"
            href="/date-docs"
          />
          <LabCard
            title="🃏 Magic the Guessering"
            description="Match MTG card names to their art"
            href={`https://${DOMAIN}/mtg/index.html`}
          />
          <LabCard
            title="👀 Classified Ads"
            description="An old version of market boosts that let you advertise anything. View ads for mana!"
            href="/ad"
          />
          <LabCard title="🐮 Cowp" description="???" href="/cowp" />
        </LabSection>
        <Spacer h={8} />
      </Col>
    </Page>
  )
}

const LabCard = (props: {
  title: string
  description?: string
  href: string
  onClick?: () => void
}) => {
  const { title, description, href, onClick } = props
  return (
    <Link href={href} onClick={onClick} className="mb-4 block">
      <Card className="flex flex-col gap-2 px-4 py-3">
        <div className="text-lg font-semibold">{title}</div>
        {description && <p className="text-ink-600">{description}</p>}
      </Card>
    </Link>
  )
}

const LabSection = (props: { children: React.ReactNode }) => (
  <Masonry
    breakpointCols={{ default: 2, 768: 1 }}
    className="-ml-4 flex w-auto"
    columnClassName="pl-4 bg-clip-padding"
  >
    {props.children}
  </Masonry>
)
