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
import { PrivacyAndTerms } from 'web/components/privacy-terms'
import { SEO } from 'web/components/SEO'
import { Card } from 'web/components/widgets/card'
import { Subtitle } from 'web/components/widgets/subtitle'
import { Title } from 'web/components/widgets/title'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { useUser } from 'web/hooks/use-user'
import { getNativePlatform } from 'web/lib/native/is-native'
import { isIOS } from 'web/lib/util/device'

export default function AboutPage() {
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
      <SEO title="About" description="About Manifold Markets" url="/sitemap" />

      <Col className="p-4">
        <Title>About</Title>

        <div className="mb-4 text-lg">
          Manifold Markets is a play-money prediction question platform where
          you can bet on anything.
        </div>

        <LabCard
          title="📈 What is a prediction question?"
          href="https://docs.manifold.markets/faq#what-is-a-prediction-question"
        />
        <LabCard
          title="💰 What is mana (Ṁ)?"
          href="https://docs.manifold.markets/faq#what-is-mana-m"
        />
        <LabCard
          title="🙋‍♂️ Learn more in our FAQ"
          href="https://docs.manifold.markets/faq"
        />

        <Subtitle>🌎 Stay connected</Subtitle>
        <LabSection>
          {!isNative && (
            <>
              <MobileAppsQRCodeDialog
                isModalOpen={isModalOpen}
                setIsModalOpen={setIsModalOpen}
              />
              <LabCard
                title="📱 Mobile app"
                description="Download the iOS/Android app"
                {...appCallback}
              />
            </>
          )}
          <LabCard
            title="💬 Discord"
            href="https://discord.com/invite/eHQBNBqXuh"
            description="Chat with the community and team"
          />
          <LabCard
            title="📰 Newsletter"
            href="https://news.manifold.markets/"
            description="Get updates on new features and questions"
          />
          <LabCard
            title="🪺 Twitter"
            href="https://twitter.com/ManifoldQuestions"
            description="Follow us for updates and memes"
          />
          <LabCard
            title="✉️️ Email"
            href="mailto:info@manifold.markets"
            description="Contact us for support or feedback"
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
            <LabCard
              title="💰 Get Mana"
              href="/add-funds"
              description={`Top up your account with ${ENV_CONFIG.moneyMoniker}`}
            />
          )}
          <LabCard
            title="🏆 Leaderboards"
            href="/leaderboards"
            description="Global profit rankings"
          />
          <LabCard
            title="💸 Manalinks"
            description={`Send ${ENV_CONFIG.moneyMoniker} to anyone`}
            href="/links"
          />
          <LabCard
            title="📏 Platform calibration"
            description="Manifold's overall track record"
            href="/calibration"
          />
          <LabCard
            title="🏆 CSPI/Salem tournament"
            description="Special contest on politics and current events"
            href="https://salemcenter.manifold.markets/"
          />
          <LabCard
            title="📜 Community guidelines"
            description="General expectations and account rules"
            href="https://manifoldmarkets.notion.site/Community-Guidelines-f6c77b1af41749828df7dae5e8735400"
          />
          <LabCard
            title="😎 Awesome Manifold"
            description="Community-created projects built on Manifold"
            href="https://manifoldmarkets.notion.site/Awesome-Manifold-4b93a64528674290989ef8a9f696b460"
          />
        </LabSection>

        <Subtitle>🧪 Experiments</Subtitle>
        <LabSection>
          {user && (
            <LabCard
              title="🎁 Loot Box"
              description="Invest in random questions"
              href="/lootbox"
            />
          )}
          <LabCard
            title="📰 News"
            description="Breaking news + questions"
            href="/news"
          />
          <LabCard
            title="🔥 Swipe"
            description="Swipe-to-bet UI. Try via iOS/Android app."
            {...(isNative ? { href: '/swipe' } : appCallback)}
          />
          <LabCard
            title="❓ Q&A"
            description="Ask and answer questions to win mana"
            href="/q-and-a"
          />
          <LabCard
            title="✏ Posts"
            description="Go long on longform"
            href="/latestposts"
          />
          <LabCard
            title="⚡️ Live feed"
            description="Latest question activity"
            href="/live"
          />
        </LabSection>

        <Subtitle>👨‍💻️ Developers</Subtitle>
        <LabSection>
          <LabCard
            title="🤖 API"
            description="Use Manifold programmatically"
            href="https://docs.manifold.markets/api"
          />
          <LabCard
            title="😻 Github"
            description="We're open source!"
            href="https://github.com/manifoldmarkets/manifold"
          />
          <LabCard
            title="🎁 Bounties"
            description="Earn mana for contributing"
            href="https://manifoldmarkets.notion.site/Manifold-Bounties-5cd9c4045422461dbe84b4339f93e98f"
          />
          <LabCard
            title="🔁 Maniswap"
            description="Learn about our AMM"
            href="https://manifoldmarkets.notion.site/Maniswap-ce406e1e897d417cbd491071ea8a0c39"
          />
          <LabCard
            title="💬 Discord bot"
            description="Create, trade, & share questions from Discord"
            href="/discord-bot"
          />
          <LabCard
            title="🎮 Twitch bot"
            description="Embed questions in your stream"
            href="/twitch"
          />
          <LabCard
            title="📈 Stats"
            description="See how Manifold is doing"
            href="/stats"
          />
          <LabCard
            title="🎨 Design system"
            href="/styles"
            description="How we make things pretty"
          />
        </LabSection>

        <Subtitle>🪦 Graveyard</Subtitle>
        <div className="mb-4 italic">
          Dead and undead projects, haunting this page until we resurrect or
          exorcise them.
        </div>
        <LabSection>
          <LabCard
            title="🎱 Oddball"
            description="Guess the probability of events"
            href="https://oddball-pi.vercel.app/"
          />
          <LabCard
            title="⚔️ Versus"
            description="Create mana-battles between two ideas"
            href="/VersusBot?tab=questions"
          />
          <LabCard
            title="🎴 Manifold: The Gambling"
            description="Match each question to its creator"
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
            description="An old version of question boosts that let you advertise anything. View ads for mana!"
            href="/ad"
          />
          <LabCard title="🐮 Moolinda" description="???" href="/cowp" />
        </LabSection>
        <Spacer h={8} />
      </Col>
      <PrivacyAndTerms />
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
