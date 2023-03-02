import { DOMAIN, ENV_CONFIG } from 'common/envs/constants'
import Link from 'next/link'
import Masonry from 'react-masonry-css'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Spacer } from 'web/components/layout/spacer'
import { SEO } from 'web/components/SEO'
import { Card } from 'web/components/widgets/card'
import { Title } from 'web/components/widgets/title'
import { getNativePlatform } from 'web/lib/native/is-native'

export default function LabsPage() {
  const { isNative, platform } = getNativePlatform()
  return (
    <Page>
      <SEO
        title="Directory"
        description="Cool features for you to check out!"
        url="/directory"
      />
      <Col className="p-4">
        <Title>🗄️ Directory</Title>

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
            title="📰 Newsletter"
            description={`Read the latest about Manifold`}
            href="https://news.manifold.markets/"
          />

          {(!isNative || (isNative && platform !== 'ios')) && (
            <LabCard
              title="🫀 Charity"
              description={`Turn ${ENV_CONFIG.moneyMoniker} into real charitable donations`}
              href="/charity"
            />
          )}

          <LabCard
            title="🔥 Swipe"
            description="Swipe-to-bet UI. Try via iOS/Android app."
            href="#"
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
        <div className="mb-4">Experimental projects at Manifold</div>
        <Masonry
          breakpointCols={{ default: 2, 768: 1 }}
          className="-ml-4 flex w-auto"
          columnClassName="pl-4 bg-clip-padding"
        >
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
          <LabCard title="🐮 Cowp" description="???" href="/cowp" />
        </Masonry>

        <Spacer h={8} />

        <Title>⌛️ Past projects</Title>
        <Masonry
          breakpointCols={{ default: 2, 768: 1 }}
          className="-ml-4 flex w-auto"
          columnClassName="pl-4 bg-clip-padding"
        >
          <LabCard
            title="🇺🇸 2022 US Midterm Elections"
            description="Manifold's midterm forecast"
            href="/midterms"
          />

          <LabCard
            title="⚽️ World Cup"
            description="2022 FIFA World Cup tournament"
            href="/worldcup"
          />

          <LabCard
            title="🏆 Tournaments"
            description="Ongoing and past prediction tournaments"
            href="/tournaments"
          />
        </Masonry>
      </Col>
    </Page>
  )
}

const LabCard = (props: {
  title: string
  description: string
  href: string
}) => {
  const { title, description, href } = props
  return (
    <Link href={href} className="mb-4 block">
      <Card className="flex flex-col gap-2 px-4 py-3">
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="text-ink-600">{description}</p>
      </Card>
    </Link>
  )
}
